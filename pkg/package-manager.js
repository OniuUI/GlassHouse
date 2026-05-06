(function () {
  'use strict';

  GlassHouse.define('package-manager', ['package-validator'], function (validator) {

    var LS_KEY = 'GlassHouse_packages';
    var packages = Object.create(null);
    var installQueue = [];
    var isInstalling = false;

    function persist() {
      try {
        var data = {};
        var names = Object.keys(packages);
        for (var i = 0; i < names.length; i++) {
          var p = packages[names[i]];
          data[names[i]] = {
            name: p.name,
            version: p.version,
            type: p.type,
            source: p.source,
            dependencies: p.dependencies || {},
            installedAt: p.installedAt,
            size: p.size || 0,
            loaded: !!p.loaded
          };
        }
        localStorage.setItem(LS_KEY, JSON.stringify(data));
      } catch (e) {
        console.warn('GlassHouse: Unable to persist package registry:', e.message);
      }
    }

    function restore() {
      try {
        var raw = localStorage.getItem(LS_KEY);
        if (!raw) return;
        var data = JSON.parse(raw);
        var names = Object.keys(data);
        for (var i = 0; i < names.length; i++) {
          packages[names[i]] = data[names[i]];
        }
      } catch (e) {}
    }

    function fetchText(url) {
      return new Promise(function (resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.timeout = 15000;
        xhr.onload = function () {
          if (xhr.status >= 200 && xhr.status < 400) {
            resolve(xhr.responseText);
          } else {
            reject(new Error('HTTP ' + xhr.status + ' fetching ' + url));
          }
        };
        xhr.onerror = function () {
          reject(new Error('Network error fetching ' + url));
        };
        xhr.ontimeout = function () {
          reject(new Error('Timeout fetching ' + url));
        };
        xhr.send();
      });
    }

    function fetchJSON(url) {
      return fetchText(url).then(function (text) {
        return JSON.parse(text);
      });
    }

    function executeSource(source, sourceURL) {
      return new Promise(function (resolve, reject) {
        var script = document.createElement('script');
        script.textContent = source;
        if (sourceURL) {
          script.setAttribute('data-source', sourceURL);
        }

        script.onload = function () {
          document.head.removeChild(script);
          resolve();
        };

        script.onerror = function () {
          document.head.removeChild(script);
          reject(new Error('Syntax error in package source from ' + sourceURL));
        };

        document.head.appendChild(script);
      });
    }

    function stripTrailingSlash(s) {
      return s.replace(/\/+$/, '');
    }

    function resolveSource(source) {
      var isURL = /^https?:\/\//.test(source);

      if (isURL) {
        return {
          isURL: true,
          manifestURL: stripTrailingSlash(source) + '/package.json',
          mainURL: function (main) {
            return stripTrailingSlash(source) + '/' + main;
          },
        };
      }

      return {
        isURL: false,
        manifestURL: stripTrailingSlash(source) + '/package.json',
        mainURL: function (main) {
          return stripTrailingSlash(source) + '/' + main;
        },
      };
    }

    function installDependencies(deps) {
      if (!deps) return Promise.resolve();
      var depNames = Object.keys(deps);
      var chain = Promise.resolve();

      for (var i = 0; i < depNames.length; i++) {
        (function (name, version) {
          chain = chain.then(function () {
            return installPackage(name);
          });
        })(depNames[i], deps[depNames[i]]);
      }

      return chain;
    }

    function validateAndInstall(manifest, source, sourceURL) {
      var validation = validator.validate(manifest, source);
      if (!validation.passed) {
        return Promise.reject(
          new Error('Package "' + manifest.name + '" failed validation:\n  ' +
            validation.errors.join('\n  '))
        );
      }

      return installDependencies(manifest.dependencies).then(function () {
        return executeSource(source, sourceURL).then(function () {
          packages[manifest.name] = {
            name: manifest.name,
            version: manifest.version,
            type: manifest.type,
            source: sourceURL,
            dependencies: manifest.dependencies || {},
            installedAt: Date.now(),
            size: manifest.size || new Blob([source]).size,
            loaded: true
          };
          persist();
          return manifest;
        });
      });
    }

    function installPackage(source) {
      var resolved = resolveSource(source);

      return fetchJSON(resolved.manifestURL).then(function (manifest) {
        var mainFile = manifest.main || 'index.js';
        return fetchText(resolved.mainURL(mainFile)).then(function (mainSource) {
          return validateAndInstall(manifest, mainSource, resolved.mainURL(mainFile));
        }).then(function (m) {
          return { manifest: m, source: source };
        });
      }).catch(function (err) {
        var scaffoldSource = source.replace(/\/$/, '') + '.ts';
        if (scaffoldSource !== source) {
          var scaffoldJS = source.replace(/\/$/, '') + '.js';
          return fetchText(scaffoldJS).then(function (rawSource) {
            return validateAndInstall(
              { name: source.replace(/^.*[\/\\]/, '').replace(/\.\w+$/, ''),
                version: '0.1.0', type: 'utility', main: scaffoldJS },
              rawSource, scaffoldJS
            );
          }).then(function (m) {
            return { manifest: m, source: source, autoScaffolded: true };
          });
        }
        throw err;
      });
    }

    function install(source) {
      return installPackage(source);
    }

    function uninstall(name) {
      if (!packages[name]) {
        throw new Error('Package "' + name + '" is not installed');
      }

      try {
        GlassHouse.unload(name);
      } catch (e) {}

      delete packages[name];
      persist();
    }

    function list() {
      return Object.keys(packages).map(function (name) {
        var p = packages[name];
        return {
          name: p.name,
          version: p.version,
          type: p.type,
          source: p.source,
          dependencies: p.dependencies || {},
          installedAt: p.installedAt,
          size: p.size || 0,
          loaded: !!p.loaded
        };
      });
    }

    function get(name) {
      if (!packages[name]) return null;
      var p = packages[name];
      return {
        name: p.name,
        version: p.version,
        type: p.type,
        source: p.source,
        dependencies: p.dependencies || {},
        installedAt: p.installedAt,
        size: p.size || 0,
        loaded: !!p.loaded
      };
    }

    function has(name) {
      return !!packages[name];
    }

    function reset() {
      packages = Object.create(null);
      try { localStorage.removeItem(LS_KEY); } catch (e) {}
      restore();
    }

    function clearCache() {
      reset();
    }

    restore();

    var pm = {
      install: install,
      uninstall: uninstall,
      list: list,
      get: get,
      has: has,
      reset: reset,
      clearCache: clearCache,

      _registry: packages,
      _persist: persist,
      _fetchText: fetchText,
      _executeSource: executeSource,
    };

    Object.freeze(pm);

    try {
      GlassHouse.packages = pm;
    } catch (e) {
      console.warn('GlassHouse: Failed to register package manager:', e.message);
    }

    return pm;
  });
})();
