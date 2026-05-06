(function () {
  'use strict';

  GlassHouse.define('package-validator', ['types', 'lint'], function (T, lint) {

    var DANGEROUS_PATTERNS = [
      { re: /\beval\s*\(/,                  name: 'eval()' },
      { re: /\bnew\s+Function\s*\(/,         name: 'new Function()' },
      { re: /document\.write\s*\(/,          name: 'document.write()' },
      { re: /\.innerHTML\s*=/,               name: 'innerHTML assignment' },
      { re: /\.outerHTML\s*=/,               name: 'outerHTML assignment' },
      { re: /setTimeout\s*\(\s*['"]/,        name: 'setTimeout(string)' },
      { re: /setInterval\s*\(\s*['"]/,       name: 'setInterval(string)' },
      { re: /javascript\s*:/,                name: 'javascript: URL' },
      { re: /on\w+\s*=\s*['"][^'"]*['"]/,    name: 'inline event handler' },
    ];

    var GLOBAL_POLLUTANTS = [
      'window', 'document', 'navigator', 'location', 'history',
      'localStorage', 'sessionStorage', 'console', 'alert', 'fetch',
      'XMLHttpRequest', 'setTimeout', 'setInterval'
    ];

    function measureSourceSize(source) {
      return new Blob([source]).size;
    }

    function securityScan(source) {
      var errors = [];

      for (var i = 0; i < DANGEROUS_PATTERNS.length; i++) {
        if (DANGEROUS_PATTERNS[i].re.test(source)) {
          errors.push('SECURITY: Uses ' + DANGEROUS_PATTERNS[i].name);
        }
      }

      if (source.indexOf("'use strict'") === -1 && source.indexOf('"use strict"') === -1) {
        errors.push('MISSING: "use strict" directive');
      }

      return errors;
    }

    function validateVNodeReturn(source) {
      var errors = [];

      // Check for string template returns (deprecated)
      var templateMatch = source.match(/template\s*:\s*function\s*\([^)]*\)\s*\{([\s\S]*?)\}/);
      var renderMatch = source.match(/render\s*:\s*function\s*\([^)]*\)\s*\{([\s\S]*?)\}/);
      var body = templateMatch ? templateMatch[1] : (renderMatch ? renderMatch[1] : null);

      if (!body) return errors;

      // Check for string return (deprecated)
      if (/return\s+`/.test(body) || /return\s+['"]/.test(body)) {
        var retMatch = body.match(/return\s+(`[^`]*`|['"][^'"]*['"])/);
        if (retMatch) {
          errors.push('TEMPLATE: String template return is deprecated. ' +
            'Use VNode objects (this.v() or TSX). Found: ' +
            retMatch[1].substring(0, 50));
        }
      }

      // Check for legacy _t: 1 VNodes (should use vnode module)
      if (/_t\s*:\s*1/.test(body)) {
        errors.push('VNOTE: Legacy _t: 1 VNode detected. Use GlassHouse vnode module instead.');
      }

      return errors;
    }

    function validatePropTypes(propTypes) {
      if (!propTypes) return [];

      var result = T.validate(propTypes, T.record(T.string, T.shape({
        kind: T.string,
        check: T.fn,
        name: T.string,
        meta: T.any
      })));

      return result.errors.map(function (e) { return 'PROPTYPES: ' + e; });
    }

    function validateStateTypes(stateTypes) {
      if (!stateTypes) return [];
      return validatePropTypes(stateTypes);
    }

    function validateDelegates(delegates) {
      if (!delegates) return [];
      var errors = [];

      var keys = Object.keys(delegates);
      for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        var parts = key.split(/\s+/);
        var event = parts[0];
        var validEvents = [
          'click', 'dblclick', 'mousedown', 'mouseup', 'mousemove',
          'keydown', 'keyup', 'keypress', 'focus', 'blur', 'change',
          'input', 'submit', 'reset', 'scroll', 'touchstart', 'touchend',
          'touchmove', 'pointerdown', 'pointerup', 'pointermove'
        ];

        if (validEvents.indexOf(event) === -1) {
          errors.push('DELEGATES: Unknown event type "' + event + '" in key "' + key + '"');
        }

        if (typeof delegates[key] !== 'function') {
          errors.push('DELEGATES: Handler for "' + key + '" must be a function');
        }
      }

      return errors;
    }

    function validateTSX(tsxSource, tsCompiler) {
      var errors = [];

      if (!tsCompiler) {
        try { tsCompiler = GlassHouse.require('ts-compiler'); } catch (e) {}
      }
      if (!tsCompiler) return errors; // TS compiler not loaded, skip

      if (/\binterface\s+\w+\s*\{/.test(tsxSource) ||
          /\btype\s+\w+\s*=/.test(tsxSource) ||
          /\b:\s*(string|number|boolean|void|any|never|unknown)\b/.test(tsxSource) ||
          /<\w+[^>]*\/?>/.test(tsxSource)) {

        try {
          var result = tsCompiler.compile(tsxSource);
          if (!result.success) {
            for (var i = 0; i < result.diagnostics.length; i++) {
              if (result.diagnostics[i].severity === 'error') {
                errors.push('TSX: ' + result.diagnostics[i].message);
              }
            }
          }

          // Check that compiled output uses v() for JSX
          if (result.js && result.js.indexOf('v(') === -1 && /<\w+[^>]*\/?>/.test(tsxSource)) {
            // JSX present but no v() calls in output — means JSX was not compiled
            errors.push('TSX: JSX detected in source but not compiled to v() calls. ' +
              'Ensure the TS compiler handles JSX.');
          }
        } catch (e) {
          errors.push('TSX: Compilation error: ' + e.message);
        }
      }

      return errors;
    }

    function validatePackage(pkgDef, sourceCode) {
      var errors = [];

      if (!pkgDef || typeof pkgDef !== 'object') {
        return { passed: false, errors: ['Package definition must be an object'] };
      }

      if (!pkgDef.name || typeof pkgDef.name !== 'string') {
        errors.push('STRUCTURE: Package must have a "name" (string)');
      }

      if (!pkgDef.version || typeof pkgDef.version !== 'string') {
        errors.push('STRUCTURE: Package must have a "version" (string)');
      }

      if (pkgDef.version && !/^\d+\.\d+\.\d+/.test(pkgDef.version)) {
        errors.push('STRUCTURE: Version must be semver (x.y.z), got "' + pkgDef.version + '"');
      }

      if (!pkgDef.type || ['pebble', 'Shine', 'utility'].indexOf(pkgDef.type) === -1) {
        errors.push('STRUCTURE: Package type must be "pebble", "Shine", or "utility"');
      }

      if (sourceCode) {
        var size = measureSourceSize(sourceCode);
        if (size > GlassHouse.MAX_BLOCK_SIZE) {
          errors.push('SIZE: Package is ' + size + 'B (max ' + GlassHouse.MAX_BLOCK_SIZE + 'B)');
        }

        if (pkgDef.size && Math.abs(pkgDef.size - size) > 128) {
          errors.push('SIZE: Declared size ' + pkgDef.size + 'B does not match actual ' + size + 'B');
        }

        errors = errors.concat(securityScan(sourceCode));
        errors = errors.concat(validateVNodeReturn(sourceCode));
        errors = errors.concat(validateTSX(sourceCode, null));
      }

      if (pkgDef.propTypes) {
        errors = errors.concat(validatePropTypes(pkgDef.propTypes));
      }

      if (pkgDef.stateTypes) {
        errors = errors.concat(validateStateTypes(pkgDef.stateTypes));
      }

      if (pkgDef.delegates) {
        errors = errors.concat(validateDelegates(pkgDef.delegates));
      }

      if (pkgDef.dependencies) {
        if (!T.is(pkgDef.dependencies, T.record(T.string, T.string))) {
          errors.push('DEPENDENCIES: Must be an object of { name: version }');
        }
      }

      return {
        passed: errors.length === 0,
        errors: errors
      };
    }

    var validator = {
      validate: validatePackage,
      securityScan: securityScan,
      validateTSX: validateTSX,
      validateVNodeReturn: validateVNodeReturn,
      validatePropTypes: validatePropTypes,
      validateStateTypes: validateStateTypes,
      validateDelegates: validateDelegates,
    };

    Object.freeze(validator);

    return validator;
  });
})();
