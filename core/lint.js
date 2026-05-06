(function () {
  'use strict';

  GlassHouse.define('lint', [], function () {

    var checks = [];
    var violations = [];
    var loadTimes = Object.create(null);

    function formatBytes(bytes) {
      if (bytes < 1024) return bytes + 'B';
      return (bytes / 1024).toFixed(2) + 'KB';
    }

    function checkSize(name, factory) {
      var str = factory.toString();
      var size = new Blob([str]).size;

      loadTimes[name] = { size: size, checkedAt: Date.now() };

      if (size > GlassHouse.MAX_BLOCK_SIZE) {
        violations.push({
          block: name,
          rule: 'MAX_BLOCK_SIZE',
          message: 'Block "' + name + '" is ' + formatBytes(size) +
            ' (max: ' + formatBytes(GlassHouse.MAX_BLOCK_SIZE) + ')',
          severity: 'error',
          timestamp: Date.now()
        });
        return false;
      }

      return true;
    }

    function checkSecurity(name, factory) {
      var src = factory.toString();
      var secure = true;

      var dangerous = [
        { pattern: /\beval\s*\(/, name: 'eval()' },
        { pattern: /\bnew\s+Function\s*\(/, name: 'new Function()' },
        { pattern: /document\.write\s*\(/, name: 'document.write()' },
        { pattern: /innerHTML\s*=/, name: 'innerHTML assignment' },
        { pattern: /outerHTML\s*=/, name: 'outerHTML assignment' }
      ];

      for (var i = 0; i < dangerous.length; i++) {
        if (dangerous[i].pattern.test(src)) {
          violations.push({
            block: name,
            rule: 'SECURITY',
            message: 'Block "' + name + '" uses forbidden: ' + dangerous[i].name,
            severity: 'error',
            timestamp: Date.now()
          });
          secure = false;
        }
      }

      var warnPatterns = [
        { pattern: /setTimeout\s*\(\s*['"][^'"]*['"]/, name: 'setTimeout with string' },
        { pattern: /setInterval\s*\(\s*['"][^'"]*['"]/, name: 'setInterval with string' }
      ];

      for (var i = 0; i < warnPatterns.length; i++) {
        if (warnPatterns[i].pattern.test(src)) {
          violations.push({
            block: name,
            rule: 'SECURITY',
            message: 'Block "' + name + '" uses risky: ' + warnPatterns[i].name,
            severity: 'warning',
            timestamp: Date.now()
          });
        }
      }

      return secure;
    }

    function checkDependencies(name, deps) {
      for (var i = 0; i < deps.length; i++) {
        var dep = deps[i];
        if (!loadTimes[dep]) {
          violations.push({
            block: name,
            rule: 'DEPENDENCY',
            message: 'Block "' + name + '" depends on "' + dep +
              '" which is not yet defined (load order issue)',
            severity: 'error',
            timestamp: Date.now()
          });
          return false;
        }
      }
      return true;
    }

    function checkTypes(name, factory) {
      var src = factory.toString();

      if (/\bPebble\b/.test(src) || /\bShine\b/.test(src)) {
        if (!/\bpropTypes\b/.test(src)) {
          violations.push({
            block: name,
            rule: 'TYPE_SAFETY',
            message: 'Block "' + name + '" is a Pebble/Shine without propTypes',
            severity: 'error',
            timestamp: Date.now()
          });
        }
        if (!/\bstateTypes\b/.test(src) && /\bthis\.setState\b/.test(src)) {
          violations.push({
            block: name,
            rule: 'TYPE_SAFETY',
            message: 'Block "' + name + '" uses setState without stateTypes',
            severity: 'warning',
            timestamp: Date.now()
          });
        }
      }
    }

    function checkHandlerUsage(name, factory) {
      var src = factory.toString();

      if (!/\bPebble\b/.test(src)) return;

      var handlerErrors = [
        { re: /\bfetch\s*\(/,             name: 'fetch() call',                        msg: 'Network requests should be in a handler via this.use("api")' },
        { re: /\bXMLHttpRequest\b/,        name: 'XMLHttpRequest',                      msg: 'Network requests should be in a handler via this.use("api")' },
        { re: /\blocalStorage\s*\./,       name: 'localStorage access',                 msg: 'Storage operations should be in a handler via this.use("storage")' },
        { re: /\bsessionStorage\s*\./,     name: 'sessionStorage access',               msg: 'Storage operations should be in a handler' },
        { re: /\bdocument\.cookie\b/,      name: 'document.cookie',                     msg: 'Cookie operations should be in a handler' },
        { re: /[^.]\balert\s*\(/,          name: 'alert() call',                        msg: 'User prompts should be in a handler via this.use("ui")' },
        { re: /\bconfirm\s*\(/,            name: 'confirm() call',                      msg: 'User prompts should be in a handler' },
        { re: /\bprompt\s*\(/,             name: 'prompt() call',                       msg: 'User prompts should be in a handler' },
      ];

      for (var i = 0; i < handlerErrors.length; i++) {
        if (handlerErrors[i].re.test(src)) {
          violations.push({
            block: name,
            rule: 'HANDLER_LOGIC',
            message: 'Pebble "' + name + '" contains ' + handlerErrors[i].name + '. ' + handlerErrors[i].msg,
            severity: 'error',
            timestamp: Date.now()
          });
        }
      }

      var validationPatterns = [
        { re: /\bemail\s*[=:!]|\b[A-Z_]+_EMAIL\b|validate.*email|email.*valid/i,
          msg: 'Email validation should be in a handler' },
        { re: /\b(phone|tel)\s*[=:!]|validate.*phone/i,
          msg: 'Phone validation should be in a handler' },
        { re: /\burl\s*[=:!]|validate.*url/i,
          msg: 'URL validation should be in a handler' },
      ];

      for (var i = 0; i < validationPatterns.length; i++) {
        if (validationPatterns[i].re.test(src)) {
          violations.push({
            block: name,
            rule: 'HANDLER_VALIDATION',
            message: 'Pebble "' + name + '" contains validation logic. ' + validationPatterns[i].msg,
            severity: 'warning',
            timestamp: Date.now()
          });
        }
      }

      if (/\bthis\.use\s*\(/.test(src) && !/\bhandlers\s*:/.test(src)) {
        violations.push({
          block: name,
          rule: 'HANDLER_UNDECLARED',
          message: 'Pebble "' + name + '" uses this.use() without declaring handlers: [...]',
          severity: 'error',
          timestamp: Date.now()
        });
      }
    }

    function createTimer(name) {
      var start = performance.now();
      var result = loadTimes[name] || { size: 0, checkedAt: Date.now() };
      loadTimes[name] = result;

      return {
        stop: function () {
          var elapsed = parseFloat((performance.now() - start).toFixed(2));
          result.loadTime = elapsed;

          if (elapsed > 50) {
            violations.push({
              block: name,
              rule: 'LOAD_TIME',
              message: 'Block "' + name + '" load time: ' + elapsed +
                'ms (threshold: 50ms)',
              severity: 'warning',
              timestamp: Date.now()
            });
          }

          return elapsed;
        }
      };
    }

    var lint = {
      defineBlock: function (name, deps, factory) {
        var allPassed = true;

        if (!checkSize(name, factory)) allPassed = false;
        if (!checkSecurity(name, factory)) allPassed = false;
        if (!checkDependencies(name, deps)) allPassed = false;
        checkTypes(name, factory);
        checkHandlerUsage(name, factory);

        return allPassed;
      },

      measure: function (name) {
        return createTimer(name);
      },

      violations: function () {
        return violations.slice();
      },

      errors: function () {
        return violations.filter(function (v) { return v.severity === 'error'; });
      },

      warnings: function () {
        return violations.filter(function (v) { return v.severity === 'warning'; });
      },

      report: function () {
        var errs = lint.errors();
        var warns = lint.warnings();

        var report = [];
        report.push('=== GlassHouse Lint Report ===');
        report.push('Blocks total: ' + Object.keys(loadTimes).length);
        report.push('Errors: ' + errs.length);
        report.push('Warnings: ' + warns.length);
        report.push('');

        var totalSize = 0;
        var keys = Object.keys(loadTimes);
        for (var i = 0; i < keys.length; i++) {
          totalSize += loadTimes[keys[i]].size;
        }
        report.push('Total defined size: ' + formatBytes(totalSize));
        report.push('Max allowed: ' + formatBytes(GlassHouse.MAX_TOTAL_SIZE));
        report.push('');

        if (errs.length > 0) {
          report.push('--- Errors ---');
          for (var i = 0; i < errs.length; i++) {
            report.push('[' + errs[i].block + '] ' + errs[i].message);
          }
          report.push('');
        }

        if (warns.length > 0) {
          report.push('--- Warnings ---');
          for (var i = 0; i < warns.length; i++) {
            report.push('[' + warns[i].block + '] ' + warns[i].message);
          }
          report.push('');
        }

        var typeViolations = violations.filter(function (v) {
          return v.rule === 'TYPE_SAFETY';
        });
        if (typeViolations.length > 0) {
          report.push('--- Type Safety ---');
          for (var i = 0; i < typeViolations.length; i++) {
            report.push('[' + typeViolations[i].block + '] ' + typeViolations[i].message);
          }
          report.push('');
        }

        if (errs.length === 0 && warns.length === 0) {
          report.push('All checks passed. Clean build.');
        }

        return report.join('\n');
      },

      clear: function () {
        violations = [];
      },

      reset: function () {
        violations = [];
        loadTimes = Object.create(null);
      }
    };

    return lint;
  });
})();
