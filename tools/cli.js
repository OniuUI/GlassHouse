(function () {
  'use strict';

  GlassHouse.define('glass-cli', ['package-manager', 'package-validator', 'builder'], function (pm, validator, builderModule) {

    var CONFIG = {
      registry: '',
      color: true,
      timeout: 15000,
      strict: true,
      logLevel: 'info'
    };

    // --- Semver ---

    function parseVersion(v) {
      v = String(v).trim();
      var pre = '';
      var build = '';
      var dash = v.indexOf('-');
      var plus = v.indexOf('+');
      if (plus > -1) { build = v.substring(plus + 1); v = v.substring(0, plus); }
      if (dash > -1) { pre = v.substring(dash + 1); v = v.substring(0, dash); }
      var parts = v.split('.');
      return {
        major: parseInt(parts[0] || '0', 10),
        minor: parseInt(parts[1] || '0', 10),
        patch: parseInt(parts[2] || '0', 10),
        prerelease: pre,
        build: build,
        raw: v + (pre ? '-' + pre : '') + (build ? '+' + build : '')
      };
    }

    function cmpVersions(a, b) {
      a = typeof a === 'string' ? parseVersion(a) : a;
      b = typeof b === 'string' ? parseVersion(b) : b;
      if (a.major !== b.major) return a.major - b.major;
      if (a.minor !== b.minor) return a.minor - b.minor;
      if (a.patch !== b.patch) return a.patch - b.patch;
      if (a.prerelease && !b.prerelease) return -1;
      if (!a.prerelease && b.prerelease) return 1;
      if (a.prerelease !== b.prerelease) return a.prerelease < b.prerelease ? -1 : 1;
      return 0;
    }

    function satisfies(version, range) {
      if (!range || range === '*' || range === 'latest' || range === '*') return true;
      var v = parseVersion(version);

      if (/^\d+\.\d+\.\d+/.test(range)) {
        if (range.indexOf(' - ') > -1) {
          var parts = range.split(' - ');
          return cmpVersions(v, parts[0]) >= 0 && cmpVersions(v, parts[1]) <= 0;
        }
        if (range.indexOf('||') > -1) {
          var ors = range.split('||');
          for (var i = 0; i < ors.length; i++) {
            if (satisfies(version, ors[i].trim())) return true;
          }
          return false;
        }
        if (range.indexOf(' ') > -1) {
          var ands = range.split(' ');
          for (var i = 0; i < ands.length; i++) {
            if (!satisfies(version, ands[i].trim())) return false;
          }
          return true;
        }
      }

      if (range.indexOf('^') === 0) {
        var base = parseVersion(range.substring(1));
        var maxMajor = base.major || 0;
        if (maxMajor === 0) {
          return v.major === 0 && v.minor === base.minor && v.patch >= base.patch;
        }
        return v.major === maxMajor && cmpVersions(v, base) >= 0;
      }

      if (range.indexOf('~') === 0) {
        var base = parseVersion(range.substring(1));
        return v.major === base.major && v.minor === base.minor && cmpVersions(v, base) >= 0;
      }

      if (range.indexOf('>=') === 0) {
        var base = parseVersion(range.substring(2).trim());
        return cmpVersions(v, base) >= 0;
      }

      if (range.indexOf('<=') === 0) {
        var base = parseVersion(range.substring(2).trim());
        return cmpVersions(v, base) <= 0;
      }

      if (range.indexOf('>') === 0) {
        var base = parseVersion(range.substring(1).trim());
        return cmpVersions(v, base) > 0;
      }

      if (range.indexOf('<') === 0) {
        var base = parseVersion(range.substring(1).trim());
        return cmpVersions(v, base) < 0;
      }

      if (/^\d+\.x$/i.test(range)) {
        var m = parseInt(range, 10);
        return v.major === m;
      }

      if (/^\d+\.\d+\.x$/i.test(range)) {
        var partsV = range.split('.');
        return v.major === parseInt(partsV[0], 10) && v.minor === parseInt(partsV[1], 10);
      }

      return range === version;
    }

    function resolveBest(versions, range) {
      if (!versions || versions.length === 0) return null;
      var matching = versions.filter(function (v) { return satisfies(v, range); });
      if (matching.length === 0) return null;
      matching.sort(cmpVersions);
      return matching[matching.length - 1];
    }

    function parsePackageSpec(spec) {
      var name = spec;
      var version = null;
      var flags = {};

      if (spec.indexOf('@') > 0 && !/^[@/]/.test(spec)) {
        var at = spec.lastIndexOf('@');
        name = spec.substring(0, at);
        version = spec.substring(at + 1);
      }

      return { name: name, version: version || 'latest' };
    }

    // --- Console formatting ---

    var STYLES = {
      reset:   'color:inherit',
      bold:    'font-weight:bold',
      dim:     'color:#6b7280',
      green:   'color:#059669',
      red:     'color:#dc2626',
      yellow:  'color:#d97706',
      blue:    'color:#2563eb',
      magenta: 'color:#7c3aed',
      cyan:    'color:#0891b2',
      white:   'color:#f9fafb',
    };

    function c(name) {
      return CONFIG.color ? (STYLES[name] || '') : '';
    }

    function log(parts) {
      var msgs = [];
      var styles = [];
      for (var i = 0; i < parts.length; i++) {
        if (typeof parts[i] === 'string') {
          msgs.push('%c' + parts[i]);
          styles.push(parts[i + 1] && typeof parts[i + 1] === 'object' && parts[i + 1].style ? parts[i + 1].style : c('reset'));
        }
      }
      console.log(msgs.join(''), ...styles);
    }

    function table(headers, rows) {
      var colWidths = headers.map(function (h) { return h.length; });
      rows.forEach(function (row) {
        row.forEach(function (cell, i) {
          colWidths[i] = Math.max(colWidths[i], String(cell).length);
        });
      });

      var divider = colWidths.map(function (w) { return '-'.repeat(w + 2); }).join('');

      var headerRow = colWidths.map(function (w, i) {
        return headers[i].padEnd(w);
      }).join('  ');

      console.log('%c' + headerRow, c('bold'));
      console.log(divider);

      rows.forEach(function (row) {
        var rowStr = colWidths.map(function (w, i) {
          return String(row[i] || '').padEnd(w);
        }).join('  ');
        console.log(rowStr);
      });
    }

    // --- Registry client ---

    function registryURL(path) {
      var base = CONFIG.registry;
      if (!base) return null;
      return base.replace(/\/$/, '') + '/' + path.replace(/^\//, '');
    }

    function fetchRegistryJSON(path) {
      var url = registryURL(path);
      if (!url) return Promise.reject(new Error('No registry configured. Use: glass.config({ registry: "url" })'));

      return pm._fetchText(url).then(function (text) {
        return JSON.parse(text);
      });
    }

    function resolveFromRegistry(name, range) {
      return fetchRegistryJSON(name).then(function (pkgData) {
        var versions = pkgData.versions || [pkgData.version];
        var best = resolveBest(versions, range);
        if (!best) {
          throw new Error('No version of "' + name + '" satisfies "' + range + '". Available: ' + versions.join(', '));
        }

        var basePath = registryURL(name + '/');
        var resolved = basePath.replace(/\/$/, '') + '/' + best;

        return { name: name, version: best, url: resolved + '/package.json' };
      });
    }

    // --- Commands ---

    var glass = {
      config: function (opts) {
        Object.assign(CONFIG, opts);
        return CONFIG;
      },

      install: function (spec, options) {
        var opts = options || {};
        var parsed = parsePackageSpec(spec);
        var name = parsed.name;
        var range = opts.version || parsed.version || 'latest';
        var force = opts.force || opts.f || false;

        if (force && pm.has(name)) {
          pm.uninstall(name);
        }

        if (pm.has(name) && !force) {
          var existing = pm.get(name);
          if (satisfies(existing.version, range)) {
            console.log(
              '%c✓%c ' + name + '@' + existing.version + ' already installed',
              c('green'), c('reset')
            );
            return Promise.resolve(existing);
          }
        }

        console.log(
          '%c⬇%c Installing ' + name + '@' + range + '...',
          c('cyan'), c('reset')
        );

        if (/^[.\/]/.test(name) || name.indexOf(':') > -1) {
          var source = name;
          return pm.install(source).then(function (result) {
            console.log(
              '%c✓%c Installed ' + result.manifest.name + '@' + result.manifest.version +
              ' (' + (result.manifest.size || '?') + 'b)',
              c('green'), c('reset')
            );
            return result;
          }).catch(function (err) {
            console.error('%c✗%c ' + name + ': ' + err.message, c('red'), c('reset'));
            throw err;
          });
        }

        if (!CONFIG.registry) {
          console.log(
            '%c!%c No registry configured. Trying local path: ./packages/' + name,
            c('yellow'), c('reset')
          );
          return pm.install('./packages/' + name).then(function (result) {
            console.log(
              '%c✓%c Installed ' + result.manifest.name + '@' + result.manifest.version +
              ' from local',
              c('green'), c('reset')
            );
            return result;
          }).catch(function () {
            console.error(
              '%c✗%c ' + name + ': not found locally. Set registry: glass.config({ registry: "http://..." })',
              c('red'), c('reset')
            );
            throw new Error('Package not found: ' + name);
          });
        }

        return resolveFromRegistry(name, range).then(function (resolved) {
          return pm.install(resolved.url).then(function (result) {
            console.log(
              '%c✓%c Installed ' + name + '@' + resolved.version +
              ' (' + (result.manifest.size || '?') + 'b)',
              c('green'), c('reset')
            );
            return result;
          });
        }).catch(function (err) {
          console.error('%c✗%c ' + name + ': ' + err.message, c('red'), c('reset'));
          throw err;
        });
      },

      uninstall: function (name) {
        if (!pm.has(name)) {
          console.log('%c!%c ' + name + ' is not installed', c('yellow'), c('reset'));
          return;
        }
        pm.uninstall(name);
        console.log('%c✓%c Removed ' + name, c('green'), c('reset'));
      },

      list: function () {
        var packages = pm.list();
        if (packages.length === 0) {
          console.log('%cNo packages installed.%c', c('dim'), c('reset'));
          return packages;
        }

        table(
          ['NAME', 'VERSION', 'TYPE', 'SIZE', 'DEPS'],
          packages.map(function (p) {
            return [
              p.name,
              p.version,
              p.type,
              p.size ? (p.size / 1024).toFixed(1) + 'KB' : '?',
              Object.keys(p.dependencies || {}).length
            ];
          })
        );
        return packages;
      },

      outdated: function () {
        var packages = pm.list();
        var results = [];
        var chain = Promise.resolve();

        packages.forEach(function (pkg) {
          if (!CONFIG.registry) return;
          chain = chain.then(function () {
            return fetchRegistryJSON(pkg.name).then(function (data) {
              var latest = data.version || (data.versions && data.versions[data.versions.length - 1]);
              if (latest && cmpVersions(latest, pkg.version) > 0) {
                results.push({ name: pkg.name, current: pkg.version, latest: latest });
              }
            }).catch(function () {});
          });
        });

        return chain.then(function () {
          if (results.length === 0) {
            console.log('%cAll packages up to date.%c', c('dim'), c('reset'));
            return results;
          }
          table(
            ['NAME', 'CURRENT', 'LATEST'],
            results.map(function (r) { return [r.name, r.current, r.latest]; })
          );
          return results;
        });
      },

      search: function (query) {
        if (!CONFIG.registry) {
          console.log('%c!%c No registry configured for search', c('yellow'), c('reset'));
          return Promise.resolve([]);
        }

        return fetchRegistryJSON('-/search?q=' + encodeURIComponent(query)).then(function (results) {
          if (!results || results.length === 0) {
            console.log('%cNo results for "' + query + '"%c', c('dim'), c('reset'));
            return [];
          }
          table(
            ['NAME', 'VERSION', 'DESCRIPTION'],
            results.map(function (r) {
              return [r.name, r.version || '?', r.description || ''];
            })
          );
          return results;
        }).catch(function (err) {
          console.error('%cSearch failed:%c ' + err.message, c('red'), c('reset'));
          return [];
        });
      },

      info: function (name) {
        var pkg = pm.get(name);
        if (!pkg) {
          console.log('%cPackage "' + name + '" not installed%c', c('yellow'), c('reset'));
          return;
        }
        console.log('%c' + name + '%c@%c' + pkg.version, c('bold'), c('reset'), c('cyan'));
        console.log('  Type:        ' + pkg.type);
        console.log('  Size:        ' + (pkg.size ? (pkg.size / 1024).toFixed(1) + 'KB' : '?'));
        console.log('  Installed:   ' + new Date(pkg.installedAt).toISOString());
        if (pkg.dependencies && Object.keys(pkg.dependencies).length > 0) {
          console.log('  Dependencies:');
          Object.keys(pkg.dependencies).forEach(function (dep) {
            console.log('    ' + dep + ' @ ' + pkg.dependencies[dep]);
          });
        }
        return pkg;
      },

      scaffold: function (source) {
        var scaffolder;
        try {
          scaffolder = GlassHouse.require('package-scaffold');
        } catch (e) {
          console.error('%c✗%c Scaffolder not available', c('red'), c('reset'));
          throw e;
        }

        console.log('%c🔨%c Scaffolding ' + source + '...', c('yellow'), c('reset'));
        return scaffolder.scaffold(source).then(function (result) {
          console.log(
            '%c✓%c Scaffolded ' + result.name + ' (' + result.type + ')',
            c('green'), c('reset')
          );
          if (result.diagnostics && result.diagnostics.length > 0) {
            result.diagnostics.forEach(function (d) {
              console.log('  %c' + d.severity + ':%c ' + d.message,
                d.severity === 'error' ? c('red') : c('yellow'), c('reset'));
            });
          }
          return result;
        });
      },

      watch: function (dir, files, interval) {
        var scaffolder;
        try {
          scaffolder = GlassHouse.require('package-scaffold');
        } catch (e) {
          throw e;
        }
        console.log('%c👀%c Watching ' + dir + '...', c('yellow'), c('reset'));
        return scaffolder.watch(dir, files, interval).onChange(function (changed) {
          changed.forEach(function (c) {
            console.log('%c↻%c ' + c.file + ' → ' + c.package, c('blue'), c('reset'));
          });
        });
      },

      handlers: function () {
        var list;
        try {
          list = GlassHouse.listHandlers();
        } catch (e) {
          console.log('%cNo handlers registered.%c', c('dim'), c('reset'));
          return [];
        }

        if (list.length === 0) {
          console.log('%cNo handlers registered.%c', c('dim'), c('reset'));
          return [];
        }

        table(
          ['NAME', 'VERSION', 'EXPORTS', 'DESCRIPTION'],
          list.map(function (h) {
            return [
              h.name,
              h.version,
              h.exports.join(', '),
              h.description.substring(0, 60)
            ];
          })
        );
        return list;
      },

      handler: function (name) {
        try {
          var hm = GlassHouse.require('handler');
          var info = hm.info(name);
          if (!info) {
            console.log('%cHandler "' + name + '" not found%c', c('yellow'), c('reset'));
            return;
          }

          console.log('%c' + info.name + '%c@%c' + info.version, c('bold'), c('reset'), c('cyan'));
          console.log('  ' + info.description);
          console.log('');

          var exportKeys = Object.keys(info.exports);
          if (exportKeys.length > 0) {
            console.log('  %cExports:%c', c('bold'), c('reset'));
            exportKeys.forEach(function (key) {
              var e = info.exports[key];
              console.log('    ' + key + '(' + (e.params || []).join(', ') + '): ' + (e.returns || 'void'));
            });
            console.log('');
          }

          if (info.similar && info.similar.length > 0) {
            console.log('  %cSimilar handlers:%c', c('yellow'), c('reset'));
            info.similar.forEach(function (s) {
              console.log('    ' + s.name + ' (' + s.similarity + '% match)');
            });
            console.log('');
          }

          if (info.overlapping && info.overlapping.length > 0) {
            console.log('  %cOverlapping exports:%c', c('yellow'), c('reset'));
            info.overlapping.forEach(function (o) {
              console.log('    ' + o.name + ': ' + o.overlapping.join(', '));
            });
            console.log('');
          }
        } catch (e) {
          console.error('%c✗%c ' + e.message, c('red'), c('reset'));
        }
      },

      searchHandler: function (query) {
        try {
          var hm = GlassHouse.require('handler');
          var results = hm.searchExports(query);
          if (results.length === 0) {
            console.log('%cNo handlers match "' + query + '"%c', c('dim'), c('reset'));
            return [];
          }

          console.log('%cHandlers matching "' + query + '":%c', c('bold'), c('reset'));
          console.log('');
          results.forEach(function (r) {
            console.log('  %c' + r.name + '%c@%c' + r.version, c('bold'), c('reset'), c('cyan'));
            console.log('    ' + r.description);
            if (r.matchingExports.length > 0) {
              console.log('    Exports: ' + r.matchingExports.join(', '));
            }
            console.log('');
          });
          return results;
        } catch (e) {
          console.error('%c✗%c ' + e.message, c('red'), c('reset'));
        }
      },

      dupes: function (threshold) {
        try {
          var hm = GlassHouse.require('handler');
          var dups = hm.duplicates(threshold);
          if (dups.length === 0) {
            console.log('%cNo duplicate handlers found.%c', c('dim'), c('reset'));
            return [];
          }

          console.log('%cPotential duplicates (≥' + ((threshold || 80)) + '%):%c', c('yellow'), c('reset'));
          console.log('');
          table(
            ['HANDLER A', 'HANDLER B', 'SIMILARITY'],
            dups.map(function (d) {
              return [d.a, d.b, d.similarity + '%'];
            })
          );
          return dups;
        } catch (e) {
          console.error('%c✗%c ' + e.message, c('red'), c('reset'));
        }
      },

      build: function (options) {
        var opts = options || {};
        var dev = opts.dev || false;

        console.log(
          '%c\u2692%c Building Glass House' + (dev ? ' (dev mode)' : ' (production)') + '...',
          c('magenta'), c('reset')
        );

        var t0 = performance.now();
        var report = builderModule.build({ dev: dev, entries: opts.entries || null });

        console.log('');
        console.log('%cBuild Report%c  %c' + report.totalSizeKB + 'KB%c  %c' + report.totalTime + 'ms%c',
          c('bold'), c('reset'), c('cyan'), c('reset'), c('dim'), c('reset'));
        console.log('');

        table(
          ['STAGE', 'TIME', 'RESULT'],
          report.stages.map(function (s) {
            var result = '';
            switch (s.stage) {
              case 'resolve':    result = s.blocks + ' blocks'; break;
              case 'tree-shake':  result = s.kept + ' kept, ' + s.removed + ' removed (' + (s.removedSize ? formatSize(s.removedSize) : '-') + ')'; break;
              case 'type-erase':  result = s.blocksCompiled + ' compiled'; break;
              case 'hyper-compact':result = s.identifiersRenamed + ' ids renamed, ' + (s.reduction || 0) + '% smaller'; break;
              case 'bundle':      result = formatSize(s.bundleSize); break;
              case 'rom':         result = s.entries + ' entries (' + formatSize(s.romSize || 0) + ')'; break;
              default: result = '';
            }
            return [s.stage, s.duration + 'ms', result];
          })
        );

        console.log('');

        if (report.identMap && Object.keys(report.identMap).length > 0) {
          var ids = Object.keys(report.identMap).slice(0, 10);
          console.log('%cTop identifiers:%c ' + ids.join(', ') +
            (Object.keys(report.identMap).length > 10 ? ' ...' : ''),
            c('dim'), c('reset'));
        }

        function formatSize(bytes) {
          return bytes >= 1024 ? (bytes / 1024).toFixed(1) + 'KB' : bytes + 'B';
        }

        console.log('');
        console.log('%c  Bundle ready. %cglass.download()%c to save or %cglass.copy()%c to clipboard.',
          c('green'), c('blue'), c('reset'), c('blue'), c('reset'));

        glass._lastBuild = report;

        return report;
      },

      download: function (filename) {
        if (!glass._lastBuild) {
          console.log('%c!%c No build yet. Run glass.build() first.', c('yellow'), c('reset'));
          return;
        }
        builderModule.download(glass._lastBuild, filename || 'glasshouse.bundle');
        console.log('%c✓%c Bundle downloaded.', c('green'), c('reset'));
      },

      copy: function () {
        if (!glass._lastBuild) {
          console.log('%c!%c No build yet. Run glass.build() first.', c('yellow'), c('reset'));
          return;
        }
        var ta = document.createElement('textarea');
        ta.value = glass._lastBuild.bundle;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        console.log('%c✓%c Bundle copied to clipboard (' + glass._lastBuild.totalSizeKB + 'KB).', c('green'), c('reset'));
      },

      run: function (scriptName, args) {
        var script = glass._scripts[scriptName];
        if (!script) {
          console.log(
            '%c!%c Script "' + scriptName + '" not found. Use glass.addScript(name, fn) to register.',
            c('yellow'), c('reset')
          );
          return;
        }

        console.log(
          '%c▶%c Running script: ' + scriptName,
          c('cyan'), c('reset')
        );

        var t0 = performance.now();
        try {
          script.fn(args || {});
          var elapsed = parseFloat((performance.now() - t0).toFixed(2));
          console.log(
            '%c✓%c Script "' + scriptName + '" completed in ' + elapsed + 'ms',
            c('green'), c('reset')
          );
        } catch (e) {
          console.error(
            '%c✗%c Script "' + scriptName + '" failed: ' + e.message,
            c('red'), c('reset')
          );
        }
      },

      addScript: function (name, fn, description) {
        glass._scripts[name] = { fn: fn, description: description || '' };
        console.log(
          '%c+%c Script registered: glass.run("' + name + '")',
          c('green'), c('reset')
        );
      },

      removeScript: function (name) {
        delete glass._scripts[name];
      },

      scripts: function () {
        var names = Object.keys(glass._scripts);
        if (names.length === 0) {
          console.log('%cNo scripts registered.%c', c('dim'), c('reset'));
          return [];
        }
        table(
          ['NAME', 'DESCRIPTION'],
          names.map(function (n) {
            return [n, glass._scripts[n].description || '-'];
          })
        );
        return names;
      },

      dev: function () {
        if (glass._devMode.active) {
          console.log('%c!%c Dev mode already active', c('yellow'), c('reset'));
          return glass._devMode;
        }

        glass._devMode.active = true;
        glass._devMode.startTime = Date.now();

        console.log(
          '%c\u25C9%c Dev mode started. %cglass.dev.stop()%c to exit.',
          c('magenta'), c('reset'), c('blue'), c('reset')
        );

        try {
          var scaffolder = GlassHouse.require('package-scaffold');
          glass._devMode.watcher = scaffolder.watch(
            './packages/',
            ['hello-pebble/index.js', 'default-theme/index.js'],
            3000
          );
          glass._devMode.watcher.onChange(function (changed) {
            changed.forEach(function (c) {
              console.log(
                '%c↻%c Watch: ' + c.file + ' → ' + (c.package || 'reload'),
                c('blue'), c('reset')
              );
            });
          });

          console.log('%c  Watching ./packages/ for changes (3s poll)%c', c('dim'), c('reset'));
        } catch (e) {
          console.log('%c  Watcher not available: ' + e.message + '%c', c('dim'), c('reset'));
        }

        glass._devMode.statsInterval = setInterval(function () {
          var stats = GlassHouse.stats();
          var lint = null;
          try { lint = GlassHouse.require('lint'); } catch (e) {}

          console.groupCollapsed(
            '%c⟳%c Dev stats [' + new Date().toLocaleTimeString() + '] ' +
            stats.activeBlocks + ' blocks / ' + stats.totalSizeKB + 'KB',
            c('cyan'), c('reset')
          );
          console.log('Blocks defined:', stats.totalBlocks);
          console.log('Blocks active:', stats.activeBlocks);
          console.log('Total size:', stats.totalSizeKB + 'KB');
          console.log('Packages installed:', pm.list().length);
          if (lint) {
            console.log('Lint errors:', lint.errors().length);
            console.log('Lint warnings:', lint.warnings().length);
          }
          console.groupEnd();
        }, 10000);

        console.log('%c  Stats reporting every 10s%c', c('dim'), c('reset'));
        console.log('%c  Use glass.dev.stop() to exit dev mode%c', c('dim'), c('reset'));

        return glass._devMode;
      },

      help: function () {
        console.log('%c  Glass House CLI (glass)%c', c('bold'), c('reset'));
        console.log('');
        console.log('  %cglass install "name" { version: "^1.0", force: true }%c', c('blue'), c('reset'));
        console.log('    Install a package. Shorthand: glass.install("name@1.2.3")');
        console.log('');
        console.log('  %cglass build%c', c('blue'), c('reset'));
        console.log('    Production build (resolve → tree-shake → compact → bundle).');
        console.log('    %cglass build --dev%c for readable output. %cglass.download()%c to save.');
        console.log('');
        console.log('  %cglass uninstall "name"%c', c('blue'), c('reset'));
        console.log('    Remove an installed package.');
        console.log('');
        console.log('  %cglass list%c', c('blue'), c('reset'));
        console.log('    List all installed packages.');
        console.log('');
        console.log('  %cglass search "query"%c', c('blue'), c('reset'));
        console.log('    Search the registry.');
        console.log('');
        console.log('  %cglass outdated%c', c('blue'), c('reset'));
        console.log('    Show packages with available updates.');
        console.log('');
        console.log('  %cglass info "name"%c', c('blue'), c('reset'));
        console.log('    Show detailed package information.');
        console.log('');
        console.log('  %cglass scaffold "./file.ts"%c', c('blue'), c('reset'));
        console.log('    Scaffold a package from a .ts file.');
        console.log('');
        console.log('  %cglass watch "./packages/" [...files]%c', c('blue'), c('reset'));
        console.log('    Watch and auto-scaffold packages.');
        console.log('');
        console.log('  %cglass handlers%c', c('blue'), c('reset'));
        console.log('    List all installed handlers with exports.');
        console.log('');
        console.log('  %cglass handler "name"%c', c('blue'), c('reset'));
        console.log('    Show handler details (exports, dependencies, duplicates).');
        console.log('');
        console.log('  %cglass searchHandler "query"%c', c('blue'), c('reset'));
        console.log('    Find handlers by export name or description.');
        console.log('');
        console.log('  %cglass dupes%c', c('blue'), c('reset'));
        console.log('    Find handlers with similar functionality (default ≥80%).');
        console.log('');
        console.log('  %cglass run "script-name"%c', c('blue'), c('reset'));
        console.log('    Run a registered script.');
        console.log('');
        console.log('  %cglass scripts%c', c('blue'), c('reset'));
        console.log('    List all registered scripts.');
        console.log('');
        console.log('  %cglass.dev()%c', c('blue'), c('reset'));
        console.log('    Start development mode (watcher + live stats). glass.dev.stop() to exit.');
        console.log('');
        console.log('  %cglass.config({ registry: "http://..." })%c', c('blue'), c('reset'));
        console.log('    Configure CLI settings.');
        console.log('');
        console.log('  %cglass.help()%c', c('blue'), c('reset'));
        console.log('    Show this help.');
      }
    };

    glass._scripts = {};

    glass._devMode = {
      active: false,
      startTime: null,
      watcher: null,
      statsInterval: null,
      stop: function () {
        if (!glass._devMode.active) return;

        if (glass._devMode.watcher && typeof glass._devMode.watcher.stop === 'function') {
          glass._devMode.watcher.stop();
        }
        if (glass._devMode.statsInterval) {
          clearInterval(glass._devMode.statsInterval);
        }

        glass._devMode.active = false;
        glass._devMode.watcher = null;
        glass._devMode.statsInterval = null;

        console.log(
          '%c\u25CB%c Dev mode stopped. Ran for ' +
          ((Date.now() - glass._devMode.startTime) / 1000).toFixed(0) + 's.',
          c('magenta'), c('reset')
        );
      }
    };

    Object.freeze(glass);

    console.log(
      '%c\u25A0%c glass CLI ready. %cglass.help()%c for commands.',
      c('bold'), c('reset'), c('blue'), c('reset')
    );

    return glass;
  });
})();
