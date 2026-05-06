(function () {
  'use strict';

  GlassHouse.define('handler', [], function () {

    var handlers = Object.create(null);
    var fingerprints = {};
    var handlerBlocks = Object.create(null);

    function HandlerRegistry(name, config) {
      this.name = name;
      this.version = config.version || '0.1.0';
      this.description = config.description || '';
      this.exports = config.exports || {};
      this.dependencies = config.dependencies || [];
      this.factory = config.factory || null;
      this.instance = null;
      this.loaded = false;
      this.fingerprint = null;
      this.registeredAt = Date.now();
    }

    HandlerRegistry.prototype.load = function () {
      if (this.loaded && this.instance) return this.instance;

      var self = this;

      for (var i = 0; i < self.dependencies.length; i++) {
        var dep = self.dependencies[i];
        if (!handlers[dep]) {
          throw new Error(
            'Handler "' + self.name + '" depends on "' + dep + '" which is not registered'
          );
        }
        if (!handlers[dep].loaded) {
          handlers[dep].load();
        }
      }

      if (typeof self.factory !== 'function') {
        throw new Error('Handler "' + self.name + '" has no factory function');
      }

      self.instance = self.factory();
      self.loaded = true;
      validateExports(self);

      return self.instance;
    };

    HandlerRegistry.prototype.getFingerprint = function () {
      if (this.fingerprint) return this.fingerprint;
      if (!this.factory) return null;

      this.fingerprint = computeFingerprint(this.factory);
      return this.fingerprint;
    };

    function validateExports(handler) {
      if (!handler.instance) return;

      var exportKeys = Object.keys(handler.exports);
      for (var i = 0; i < exportKeys.length; i++) {
        var key = exportKeys[i];
        if (typeof handler.instance[key] !== 'function') {
          throw new Error(
            'Handler "' + handler.name + '" declares export "' + key +
            '" but factory does not provide it'
          );
        }
      }
    }

    // --- Fingerprinting ---

    function normalizeSource(fn) {
      var src = fn.toString();
      var idMap = {};
      var nextId = 0;

      src = src.replace(/\/\/.*$/gm, '');
      src = src.replace(/\/\*[\s\S]*?\*\//g, '');
      src = src.replace(/'(?:[^'\\]|\\.)*'/g, function (m) { return "'_'"; });
      src = src.replace(/"(?:[^"\\]|\\.)*"/g, function (m) { return '"_"'; });

      src = src.replace(/\b[a-zA-Z_$][a-zA-Z0-9_$]*\b/g, function (id) {
        var reserved = [
          'function', 'return', 'if', 'else', 'for', 'while', 'do', 'switch',
          'case', 'break', 'continue', 'throw', 'try', 'catch', 'finally',
          'new', 'delete', 'typeof', 'instanceof', 'in', 'of', 'void',
          'var', 'let', 'const', 'class', 'extends', 'this', 'true', 'false',
          'null', 'undefined', 'async', 'await', 'yield', 'import', 'export'
        ];
        if (reserved.indexOf(id) !== -1) return id;
        if (!idMap[id]) {
          idMap[id] = 'v' + (nextId++);
        }
        return idMap[id];
      });

      src = src.replace(/\s+/g, ' ').trim();

      return { normalized: src, idCount: nextId };
    }

    function hash64(str) {
      var h1 = 0xdeadbeef;
      var h2 = 0x41c6ce57;
      for (var i = 0; i < str.length; i++) {
        var ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
      }
      h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
      h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
      return ((h2 & 0xffffffff) >>> 0).toString(16).padStart(8, '0') +
             ((h1 & 0xffffffff) >>> 0).toString(16).padStart(8, '0');
    }

    function computeFingerprint(factory) {
      var normalized = normalizeSource(factory);
      var hash = hash64(normalized.normalized);
      return {
        hash: hash,
        idCount: normalized.idCount,
        length: normalized.normalized.length,
        computedAt: Date.now()
      };
    }

    function similarity(fp1, fp2) {
      if (!fp1 || !fp2) return 0;
      var matches = 0;
      var total = Math.min(fp1.hash.length, fp2.hash.length);
      for (var i = 0; i < total; i++) {
        if (fp1.hash[i] === fp2.hash[i]) matches++;
      }
      var hashSim = matches / total;

      var idSim = fp1.idCount > 0 && fp2.idCount > 0
        ? Math.min(fp1.idCount, fp2.idCount) / Math.max(fp1.idCount, fp2.idCount)
        : 0;

      var lenSim = Math.min(fp1.length, fp2.length) / Math.max(fp1.length, fp2.length);

      return hashSim * 0.5 + idSim * 0.3 + lenSim * 0.2;
    }

    function findSimilar(handlerName, threshold) {
      threshold = threshold || 0.7;
      var handler = handlers[handlerName];
      if (!handler) return [];

      var fp = handler.getFingerprint();
      if (!fp) return [];

      var results = [];
      var names = Object.keys(handlers);
      for (var i = 0; i < names.length; i++) {
        var other = names[i];
        if (other === handlerName) continue;
        var otherFP = handlers[other].getFingerprint();
        if (!otherFP) continue;

        var sim = similarity(fp, otherFP);
        if (sim >= threshold) {
          results.push({ name: other, similarity: parseFloat((sim * 100).toFixed(0)) });
        }
      }

      results.sort(function (a, b) { return b.similarity - a.similarity; });
      return results;
    }

    function findOverlappingExports(handlerName) {
      var handler = handlers[handlerName];
      if (!handler) return [];

      var exports = Object.keys(handler.exports);
      var results = [];
      var names = Object.keys(handlers);

      for (var i = 0; i < names.length; i++) {
        var other = names[i];
        if (other === handlerName) continue;
        var otherExports = Object.keys(handlers[other].exports);
        var overlap = exports.filter(function (e) { return otherExports.indexOf(e) !== -1; });
        if (overlap.length > 0) {
          results.push({ name: other, overlapping: overlap });
        }
      }

      return results;
    }

    // --- API ---

    function register(name, config) {
      if (handlers[name]) {
        throw new Error('Handler "' + name + '" is already registered');
      }

      var handler = new HandlerRegistry(name, config);
      handlers[name] = handler;

      if (config.factory) {
        handler.getFingerprint();
      }

      var similar = findSimilar(name, 0.8);
      if (similar.length > 0) {
        console.warn(
          '%cHandler Warning:%c "' + name + '" is structurally similar to: ' +
          similar.map(function (s) { return s.name + ' (' + s.similarity + '%)'; }).join(', ') +
          '. Consider reusing instead.',
          'color:#d97706;font-weight:bold', 'color:inherit'
        );
      }

      var overlap = findOverlappingExports(name);
      if (overlap.length > 0) {
        console.warn(
          '%cHandler Warning:%c "' + name + '" exports overlap with: ' +
          overlap.map(function (o) { return o.name + ' [' + o.overlapping.join(', ') + ']'; }).join('; '),
          'color:#d97706;font-weight:bold', 'color:inherit'
        );
      }

      return handler;
    }

    function get(name) {
      if (!handlers[name]) {
        throw new Error('Handler "' + name + '" is not registered. Available: ' +
          Object.keys(handlers).join(', '));
      }

      if (!handlers[name].loaded) {
        handlers[name].load();
      }

      return handlers[name].instance;
    }

    function isRegistered(name) {
      return !!handlers[name];
    }

    function list() {
      return Object.keys(handlers).map(function (name) {
        var h = handlers[name];
        return {
          name: name,
          version: h.version,
          description: h.description,
          exports: Object.keys(h.exports),
          dependencies: h.dependencies,
          loaded: h.loaded,
          fingerprint: h.fingerprint ? h.fingerprint.hash : null
        };
      });
    }

    function info(name) {
      var h = handlers[name];
      if (!h) return null;

      return {
        name: h.name,
        version: h.version,
        description: h.description,
        exports: h.exports,
        dependencies: h.dependencies,
        loaded: h.loaded,
        fingerprint: h.fingerprint,
        similar: findSimilar(name, 0.7),
        overlapping: findOverlappingExports(name)
      };
    }

    function duplicates(threshold) {
      threshold = threshold || 0.8;
      var names = Object.keys(handlers);
      var results = [];
      var checked = {};

      for (var i = 0; i < names.length; i++) {
        var similar = findSimilar(names[i], threshold);
        for (var j = 0; j < similar.length; j++) {
          var pair = [names[i], similar[j].name].sort().join('::');
          if (!checked[pair]) {
            checked[pair] = true;
            results.push({
              a: names[i],
              b: similar[j].name,
              similarity: similar[j].similarity
            });
          }
        }
      }

      return results;
    }

    function searchExports(query) {
      var q = query.toLowerCase();
      var results = [];
      var names = Object.keys(handlers);

      for (var i = 0; i < names.length; i++) {
        var h = handlers[names[i]];
        var matchExports = Object.keys(h.exports).filter(function (e) {
          return e.toLowerCase().indexOf(q) !== -1;
        });

        var descMatch = h.description.toLowerCase().indexOf(q) !== -1;
        var nameMatch = names[i].toLowerCase().indexOf(q) !== -1;

        if (matchExports.length > 0 || descMatch || nameMatch) {
          results.push({
            name: names[i],
            description: h.description,
            version: h.version,
            matchingExports: matchExports
          });
        }
      }

      return results;
    }

    var handlerModule = {
      register: register,
      get: get,
      isRegistered: isRegistered,
      list: list,
      info: info,
      findSimilar: findSimilar,
      findOverlappingExports: findOverlappingExports,
      duplicates: duplicates,
      searchExports: searchExports,
      computeFingerprint: computeFingerprint,
      similarity: similarity,
      normalizeSource: normalizeSource,
      _handlers: handlers,
      _fingerprints: fingerprints,
    };

    return handlerModule;
  });
})();
