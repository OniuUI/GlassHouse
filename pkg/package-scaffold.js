(function () {
  'use strict';

  GlassHouse.define('package-scaffold', ['package-manager', 'package-validator', 'types', 'ts-compiler'],
    function (pm, validator, T, tsCompiler) {

    var watchedDirs = {};
    var watchTimers = {};
    var processedFiles = {};

    function parseNameFromPath(path) {
      var name = path.replace(/^.*[\/\\]/, '');
      name = name.replace(/\.(peb|sap|pkg)\.\w+$/, '');
      name = name.replace(/\.\w+$/, '');
      return name;
    }

    function detectType(source) {
      if (/GlassHouse\s*\.\s*pebble/i.test(source) || /type\s*:\s*['"]pebble['"]/i.test(source)) {
        return 'pebble';
      }
      if (/GlassHouse\s*\.\s*Shine/i.test(source) || /type\s*:\s*['"]Shine['"]/i.test(source)) {
        return 'Shine';
      }
      if (/Pebble\s*\(/i.test(source) || /Shine\s*\(/i.test(source)) {
        return /Shine/.test(source) ? 'Shine' : 'pebble';
      }
      return 'utility';
    }

    function extractPropTypes(source) {
      var props = {};
      var match = source.match(/propTypes\s*:\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/);
      if (match) return props;

      var iface = source.match(/interface\s+Props\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/);
      if (!iface) return props;

      var body = iface[1];
      var fields = body.split(/[;\n]+/);
      for (var i = 0; i < fields.length; i++) {
        var f = fields[i].trim();
        if (!f) continue;
        var parts = f.split(':');
        if (parts.length < 2) continue;
        var key = parts[0].trim().replace(/\?$/, '');
        var optional = f.indexOf('?') > -1;
        var typeStr = parts.slice(1).join(':').trim();
        props[key] = {
          type: mapTSType(typeStr),
          optional: optional
        };
      }
      return props;
    }

    function extractStateTypes(source) {
      var state = {};
      var iface = source.match(/interface\s+State\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/);
      if (!iface) return state;

      var body = iface[1];
      var fields = body.split(/[;\n]+/);
      for (var i = 0; i < fields.length; i++) {
        var f = fields[i].trim();
        if (!f) continue;
        var parts = f.split(':');
        if (parts.length < 2) continue;
        var key = parts[0].trim().replace(/\?$/, '');
        var optional = f.indexOf('?') > -1;
        var typeStr = parts.slice(1).join(':').trim();
        state[key] = {
          type: mapTSType(typeStr),
          optional: optional
        };
      }
      return state;
    }

    function mapTSType(tsType) {
      var t = tsType.trim();
      if (t === 'string') return 'string';
      if (t === 'number') return 'number';
      if (t === 'boolean') return 'boolean';
      if (t === 'void') return 'void';
      if (t === 'any') return 'any';
      if (t === 'null') return 'null';
      if (t.startsWith("'") || t.startsWith('"')) return 'literal';
      if (t.includes('|')) return 'union';
      if (t.endsWith('[]')) return 'array';
      return 'unknown';
    }

    function extractVersion(source) {
      var match = source.match(/version\s*:\s*['"](\d+\.\d+\.\d+)['"]/);
      return match ? match[1] : '0.1.0';
    }

    function extractName(source, fallbackPath) {
      var match = source.match(/name\s*:\s*['"]([^'"]+)['"]/);
      return match ? match[1] : parseNameFromPath(fallbackPath);
    }

    function extractDependencies(source) {
      var deps = {};
      var match = source.match(/dependencies\s*:\s*\{([^}]+)\}/);
      if (!match) return deps;
      var body = match[1];
      var pairs = body.split(',');
      for (var i = 0; i < pairs.length; i++) {
        var p = pairs[i].trim();
        var equals = p.indexOf(':');
        if (equals === -1) continue;
        var key = p.substring(0, equals).trim().replace(/['"]/g, '');
        var val = p.substring(equals + 1).trim().replace(/['"]/g, '');
        deps[key] = val;
      }
      return deps;
    }

    function extractDescription(source) {
      var match = source.match(/description\s*:\s*['"]([^'"]+)['"]/);
      return match ? match[1] : '';
    }

    function generatePackageJSON(name, type, version, deps, description, size) {
      return {
        name: name,
        version: version,
        type: type,
        description: description,
        main: 'index.js',
        dependencies: deps,
        size: size,
        GlassHouse: '>=1.0.0'
      };
    }

    function generateTypesJSON(propTypes, stateTypes) {
      return {
        propTypes: propTypes || {},
        stateTypes: stateTypes || {},
        generatedAt: Date.now()
      };
    }

    function isTypeScript(source) {
      return /\binterface\s+\w+\s*\{/.test(source) ||
             /\btype\s+\w+\s*=/.test(source) ||
             /\b:\s*(string|number|boolean|void|any|never|unknown)\b/.test(source) ||
             /\bimplements\s/.test(source) ||
             /\benum\s+\w+\s*\{/.test(source);
    }

    function isTSX(source) {
      // Check for JSX pattern: <identifier ...> that looks like JSX
      return /<\w+[^>]*\/?>/.test(source) && !/<=|>=|<<|>>|=>/.test(source.replace(/<(\w+)[^>]*\/?>/g, ''));
    }

    function hasTypeScriptFeatures(source) {
      return isTypeScript(source) || isTSX(source);
    }

    function injectVNodePreamble(jsSource) {
      // Add the v() alias at the top of compiled output if JSX was used
      if (!jsSource || typeof jsSource !== 'string') return jsSource;
      if (jsSource.indexOf('v(') === -1) return jsSource;

      // Check if preamble already exists
      if (jsSource.indexOf('var v = ') !== -1 && jsSource.indexOf("require('vnode')") !== -1) {
        return jsSource;
      }

      return "var v = GlassHouse.require('vnode').v;\n" + jsSource;
    }

    function scaffoldFromSource(source, sourceURL) {
      var name = extractName(source, sourceURL);
      var type = detectType(source);
      var version = extractVersion(source);
      var deps = extractDependencies(source);
      var description = extractDescription(source);

      var compiledSource = source;
      var typeContracts = {};
      var compileResult = null;

      if (hasTypeScriptFeatures(source)) {
        compileResult = tsCompiler.compile(source);
        compiledSource = compileResult.js || source;

        // Inject vnode preamble if JSX was compiled
        compiledSource = injectVNodePreamble(compiledSource);

        if (compileResult.types) {
          typeContracts = contractMapFromTypes(compileResult.types);
        }
      }

      var propTypes = extractPropTypes(source);
      var stateTypes = extractStateTypes(source);

      if (Object.keys(typeContracts.propTypes || {}).length > 0) {
        propTypes = typeContracts.propTypes;
      }
      if (Object.keys(typeContracts.stateTypes || {}).length > 0) {
        stateTypes = typeContracts.stateTypes;
      }

      // For TSX files, also extract Props/State interfaces from compiled metadata
      if (isTSX(source) && compileResult && compileResult.types) {
        var tsxContracts = contractMapFromTypes(compileResult.types);
        if (Object.keys(tsxContracts.propTypes).length > 0) {
          propTypes = tsxContracts.propTypes;
        }
        if (Object.keys(tsxContracts.stateTypes).length > 0) {
          stateTypes = tsxContracts.stateTypes;
        }
      }

      var size = new Blob([compiledSource]).size;

      var pkgJSON = generatePackageJSON(name, type, version, deps, description, size);
      var typesJSON = generateTypesJSON(propTypes, stateTypes);

      return pm._executeSource(compiledSource, sourceURL).then(function () {
        var pkg = {
          name: name,
          version: version,
          type: type,
          source: sourceURL,
          dependencies: deps,
          installedAt: Date.now(),
          size: size,
          loaded: true
        };
        pm._registry[name] = pkg;
        pm._persist();

        return {
          name: name,
          version: version,
          type: type,
          source: sourceURL,
          compiled: compileResult !== null,
          diagnostics: compileResult ? compileResult.diagnostics : [],
          packageJSON: pkgJSON,
          typesJSON: typesJSON,
          files: {
            'index.js': compiledSource,
            'types.json': JSON.stringify(typesJSON, null, 2),
            'package.json': JSON.stringify(pkgJSON, null, 2)
          }
        };
      });
    }

    function contractMapFromTypes(types) {
      var propTypes = {};
      var stateTypes = {};

      if (types.interfaces) {
        var propsIface = types.interfaces['Props'];
        var stateIface = types.interfaces['State'];

        if (propsIface && propsIface.properties) {
          Object.keys(propsIface.properties).forEach(function (k) {
            propTypes[k] = propsIface.properties[k];
          });
        }

        if (stateIface && stateIface.properties) {
          Object.keys(stateIface.properties).forEach(function (k) {
            stateTypes[k] = stateIface.properties[k];
          });
        }
      }

      return { propTypes: propTypes, stateTypes: stateTypes };
    }

    function scaffold(sourcePathOrURL) {
      processedFiles[sourcePathOrURL] = { status: 'pending', startedAt: Date.now() };

      return pm._fetchText(sourcePathOrURL).then(function (source) {
        var validation = validator.validate(
          { name: parseNameFromPath(sourcePathOrURL), version: '0.1.0', type: detectType(source) },
          source
        );

        if (!validation.passed) {
          processedFiles[sourcePathOrURL] = {
            status: 'failed',
            errors: validation.errors,
            finishedAt: Date.now()
          };
          throw new Error('Scaffold validation failed for ' + sourcePathOrURL +
            ':\n  ' + validation.errors.join('\n  '));
        }

        return scaffoldFromSource(source, sourcePathOrURL);
      }).then(function (result) {
        processedFiles[sourcePathOrURL] = {
          status: 'scaffolded',
          package: result.name,
          finishedAt: Date.now()
        };
        return result;
      }).catch(function (err) {
        processedFiles[sourcePathOrURL] = {
          status: 'failed',
          errors: [err.message],
          finishedAt: Date.now()
        };
        throw err;
      });
    }

    function scan(baseDir, fileList) {
      var base = baseDir.replace(/\/$/, '');
      var results = [];
      var chain = Promise.resolve();

      for (var i = 0; i < fileList.length; i++) {
        (function (file) {
          chain = chain.then(function () {
            var path = base + '/' + file;
            if (processedFiles[path] && processedFiles[path].status === 'scaffolded') {
              results.push({ file: path, status: 'already-scaffolded' });
              return;
            }
            return scaffold(path).then(function (r) {
              results.push({ file: path, status: 'scaffolded', package: r.name });
            }).catch(function (err) {
              results.push({ file: path, status: 'failed', error: err.message });
            });
          });
        })(fileList[i]);
      }

      return chain.then(function () { return results; });
    }

    function watch(baseDir, fileList, intervalMs) {
      var watcherId = baseDir.replace(/[^a-zA-Z0-9]/g, '_');
      if (watchTimers[watcherId]) {
        clearInterval(watchTimers[watcherId]);
      }

      watchedDirs[watcherId] = { baseDir: baseDir, fileList: fileList };

      function poll() {
        scan(baseDir, fileList).then(function (results) {
          var changed = results.filter(function (r) { return r.status !== 'already-scaffolded'; });
          if (changed.length > 0) {
            if (watchedDirs[watcherId].onChange) {
              watchedDirs[watcherId].onChange(changed);
            }
          }
        }).catch(function () {});
      }

      poll();
      watchTimers[watcherId] = setInterval(poll, intervalMs || 5000);

      return {
        stop: function () {
          clearInterval(watchTimers[watcherId]);
          delete watchTimers[watcherId];
          delete watchedDirs[watcherId];
        },
        onChange: function (fn) {
          watchedDirs[watcherId].onChange = fn;
          return this;
        }
      };
    }

    function status(filePath) {
      return processedFiles[filePath] || { status: 'unknown' };
    }

    function reset() {
      var ids = Object.keys(watchTimers);
      for (var i = 0; i < ids.length; i++) {
        clearInterval(watchTimers[ids[i]]);
      }
      watchTimers = {};
      watchedDirs = {};
      processedFiles = {};
    }

    var scaffolder = {
      scaffold: scaffold,
      scan: scan,
      watch: watch,
      status: status,
      reset: reset,
      _processed: processedFiles,
    };

    Object.freeze(scaffolder);

    return scaffolder;
  });
})();
