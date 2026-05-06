(function () {
  'use strict';

  GlassHouse.define('test-runner', [], function () {
    'use strict';

    var suites = [];
    var currentSuite = null;
    var results = { passed: 0, failed: 0, skipped: 0, total: 0, suites: [], duration: 0 };
    var config = { timeout: 5000, verbose: false, filter: null };
    var hasVNode = false;

    // Try to detect VNode support (optional, works in both QuickJS and browser)
    try {
      GlassHouse.require('vnode');
      hasVNode = true;
    } catch (e) {
      hasVNode = false;
    }

    function describe(name, fn) {
      var suite = {
        name: name,
        tests: [],
        hooks: { beforeAll: [], afterAll: [], beforeEach: [], afterEach: [] },
        passed: 0, failed: 0, skipped: 0, error: null
      };
      suites.push(suite);
      var prevSuite = currentSuite;
      currentSuite = suite;
      try { fn(); } catch (e) {
        suite.error = e.message;
      }
      currentSuite = prevSuite;
    }

    function it(name, fn) {
      var test = { name: name, fn: fn, passed: false, error: null, duration: 0, skipped: false };
      if (currentSuite) { currentSuite.tests.push(test); }
    }

    function skip(name, fn) {
      var test = { name: name, fn: fn, passed: false, error: null, duration: 0, skipped: true };
      if (currentSuite) {
        currentSuite.tests.push(test);
        currentSuite.skipped++;
      }
    }

    function xit(name, fn) {
      skip(name, fn);
    }

    function beforeAll(fn) {
      if (currentSuite) { currentSuite.hooks.beforeAll.push(fn); }
    }
    function afterAll(fn) {
      if (currentSuite) { currentSuite.hooks.afterAll.push(fn); }
    }
    function beforeEach(fn) {
      if (currentSuite) { currentSuite.hooks.beforeEach.push(fn); }
    }
    function afterEach(fn) {
      if (currentSuite) { currentSuite.hooks.afterEach.push(fn); }
    }

    // -- deep equality --

    function deepEqual(a, b) {
      if (a === b) return true;
      if (a === null || b === null) return a === b;
      if (typeof a !== typeof b) return false;
      if (typeof a !== 'object') return a === b;

      if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
      if (a instanceof RegExp && b instanceof RegExp) return a.toString() === b.toString();

      if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false;
        for (var i = 0; i < a.length; i++) {
          if (!deepEqual(a[i], b[i])) return false;
        }
        return true;
      }

      if (Array.isArray(a) !== Array.isArray(b)) return false;

      // VNode check (optional)
      if (hasVNode) {
        var V = GlassHouse.require('vnode');
        if (V.isVNode(a) && V.isVNode(b)) return VNodeEqual(a, b);
        if (V.isVNode(a) !== V.isVNode(b)) return false;
      }

      var keysA = Object.keys(a).sort();
      var keysB = Object.keys(b).sort();
      if (keysA.length !== keysB.length) return false;
      for (var j = 0; j < keysA.length; j++) {
        if (keysA[j] !== keysB[j]) return false;
        if (!deepEqual(a[keysA[j]], b[keysA[j]])) return false;
      }
      return true;
    }

    function VNodeEqual(a, b) {
      if (a.tag !== b.tag) return false;
      if (!deepEqual(a.attrs, b.attrs)) return false;
      if (a.kids.length !== b.kids.length) return false;
      for (var i = 0; i < a.kids.length; i++) {
        if (!deepEqual(a.kids[i], b.kids[i])) return false;
      }
      return true;
    }

    // -- expectation --

    function expect(actual) {
      return new Expectation(actual);
    }

    function Expectation(actual) {
      this.actual = actual;
      this._not = false;
    }

    Object.defineProperty(Expectation.prototype, 'not', {
      get: function () {
        this._not = !this._not;
        return this;
      },
      enumerable: false,
      configurable: true
    });

    Expectation.prototype._assert = function (passed, message) {
      if (this._not) {
        passed = !passed;
        message = message.replace(' to ', ' to not ');
      }
      this._not = false;
      if (!passed) { throw new Error(message); }
      return true;
    };

    Expectation.prototype.toBe = function (expected) {
      return this._assert(this.actual === expected,
        'Expected ' + JSON.stringify(this.actual) + ' to be ' + JSON.stringify(expected));
    };

    Expectation.prototype.toEqual = function (expected) {
      return this._assert(deepEqual(this.actual, expected),
        'Expected ' + JSON.stringify(this.actual) + ' to equal ' + JSON.stringify(expected));
    };

    Expectation.prototype.toBeType = function (type) {
      var actualType = typeof this.actual;
      return this._assert(actualType === type,
        'Expected ' + JSON.stringify(this.actual) + ' to be type ' + type + ', got ' + actualType);
    };

    Expectation.prototype.toBeInstanceOf = function (Constructor) {
      var name = (Constructor && Constructor.name) || 'constructor';
      return this._assert(this.actual instanceof Constructor,
        'Expected value to be instance of ' + name);
    };

    Expectation.prototype.toThrow = function (expectedMessage) {
      if (typeof this.actual !== 'function') {
        throw new Error('Expected a function to test for thrown errors, got ' + typeof this.actual);
      }
      var threw = false;
      var error = null;
      try { this.actual(); } catch (e) { threw = true; error = e; }
      if (!threw) {
        throw new Error('Expected function to throw but it did not');
      }
      if (expectedMessage !== undefined) {
        var msgMatch = error.message.indexOf(expectedMessage) !== -1;
        if (!msgMatch) {
          throw new Error('Expected error message to contain "' + expectedMessage +
            '" but got "' + error.message + '"');
        }
      }
      return true;
    };

    Expectation.prototype.toHaveLength = function (n) {
      var len = (this.actual != null) ? this.actual.length : undefined;
      return this._assert(len === n,
        'Expected length ' + n + ', got ' + len);
    };

    Expectation.prototype.toContain = function (item) {
      var pass = this.actual != null && this.actual.indexOf(item) !== -1;
      return this._assert(pass,
        'Expected ' + JSON.stringify(this.actual) + ' to contain ' + JSON.stringify(item));
    };

    Expectation.prototype.toBeNull = function () {
      return this._assert(this.actual === null,
        'Expected ' + JSON.stringify(this.actual) + ' to be null');
    };

    Expectation.prototype.toBeUndefined = function () {
      return this._assert(this.actual === undefined,
        'Expected ' + JSON.stringify(this.actual) + ' to be undefined');
    };

    Expectation.prototype.toBeDefined = function () {
      return this._assert(this.actual !== undefined,
        'Expected value to be defined');
    };

    Expectation.prototype.toBeTruthy = function () {
      return this._assert(!!this.actual,
        'Expected ' + JSON.stringify(this.actual) + ' to be truthy');
    };

    Expectation.prototype.toBeFalsy = function () {
      return this._assert(!this.actual,
        'Expected ' + JSON.stringify(this.actual) + ' to be falsy');
    };

    Expectation.prototype.toMatch = function (regex) {
      return this._assert(regex.test(this.actual),
        'Expected ' + JSON.stringify(this.actual) + ' to match ' + regex.toString());
    };

    Expectation.prototype.toHaveProperty = function (prop) {
      var pass = this.actual !== null && this.actual !== undefined && prop in Object(this.actual);
      return this._assert(pass, 'Expected object to have property "' + prop + '"');
    };

    Expectation.prototype.toHaveKeys = function (keys) {
      var actualKeys = Object.keys(this.actual || {}).sort();
      var expectedKeys = keys.slice().sort();
      return this._assert(deepEqual(actualKeys, expectedKeys),
        'Expected keys ' + JSON.stringify(expectedKeys) + ', got ' + JSON.stringify(actualKeys));
    };

    // -- VNode matchers (active only when vnode is loaded) --

    function getV() {
      if (!hasVNode) throw new Error('VNode module not available. Load glasshouse/vnode.js first.');
      return GlassHouse.require('vnode');
    }

    Expectation.prototype.toBeVNode = function () {
      var V = getV();
      return this._assert(V.isVNode(this.actual),
        'Expected value to be a VNode');
    };

    Expectation.prototype.toHaveTag = function (tag) {
      var V = getV();
      if (!V.isVNode(this.actual)) {
        throw new Error('Expected a VNode, got ' + typeof this.actual);
      }
      return this._assert(this.actual.tag === tag,
        'Expected VNode tag "' + tag + '", got "' + this.actual.tag + '"');
    };

    Expectation.prototype.toHaveAttr = function (key, value) {
      var V = getV();
      if (!V.isVNode(this.actual)) {
        throw new Error('Expected a VNode, got ' + typeof this.actual);
      }
      if (value === undefined) {
        return this._assert(key in this.actual.attrs,
          'Expected VNode to have attribute "' + key + '"');
      }
      var pass = (key in this.actual.attrs) && deepEqual(this.actual.attrs[key], value);
      return this._assert(pass,
        'Expected VNode attr "' + key + '" to be ' + JSON.stringify(value) +
        ', got ' + JSON.stringify(this.actual.attrs[key]));
    };

    Expectation.prototype.toHaveChildCount = function (n) {
      var V = getV();
      if (!V.isVNode(this.actual)) {
        throw new Error('Expected a VNode, got ' + typeof this.actual);
      }
      return this._assert(this.actual.kids.length === n,
        'Expected VNode to have ' + n + ' children, got ' + this.actual.kids.length);
    };

    Expectation.prototype.toHaveText = function (text) {
      var V = getV();
      if (!V.isVNode(this.actual)) {
        throw new Error('Expected a VNode, got ' + typeof this.actual);
      }
      var txt = '';
      for (var i = 0; i < this.actual.kids.length; i++) {
        if (typeof this.actual.kids[i] === 'string') { txt += this.actual.kids[i]; }
        else if (typeof this.actual.kids[i] === 'number') { txt += String(this.actual.kids[i]); }
      }
      return this._assert(txt.indexOf(text) !== -1,
        'Expected VNode to contain text "' + text + '", got "' + txt + '"');
    };

    // -- color helpers (ANSI for terminal, stripped for browser) --

    var hasWindow = typeof window !== 'undefined';

    function colorize(str, color) {
      if (hasWindow) return str;
      var code = color === 'red' ? '31' : color === 'green' ? '32' :
                 color === 'yellow' ? '33' : color === 'bold' ? '1' : '0';
      return '\x1b[' + code + 'm' + str + '\x1b[0m';
    }

    // -- runner engine --

    function run(opts) {
      if (opts) {
        if (opts.timeout !== undefined) config.timeout = opts.timeout;
        if (opts.verbose !== undefined) config.verbose = opts.verbose;
        if (opts.filter !== undefined) config.filter = opts.filter;
      }

      results = { passed: 0, failed: 0, skipped: 0, total: 0, suites: [], duration: 0 };
      var startTime = Date.now();

      for (var s = 0; s < suites.length; s++) {
        var suite = suites[s];
        var sr = { name: suite.name, tests: [], passed: 0, failed: 0, skipped: 0, duration: 0 };

        if (suite.error) {
          sr.error = suite.error;
          sr.failed = suite.tests.length;
          results.failed += suite.tests.length;
          results.total += suite.tests.length;
          sr.duration = Date.now() - startTime;
          results.suites.push(sr);
          continue;
        }

        // Run beforeAll hooks once per suite
        runHooks(suite.hooks.beforeAll);

        for (var t = 0; t < suite.tests.length; t++) {
          var test = suite.tests[t];

          // Apply filter
          if (config.filter && test.name.indexOf(config.filter) === -1) {
            sr.skipped++;
            results.skipped++;
            results.total++;
            sr.tests.push({ name: test.name, passed: false, skipped: true, error: null, duration: 0 });
            continue;
          }

          if (test.skipped) {
            sr.skipped++;
            results.skipped++;
            results.total++;
            sr.tests.push({ name: test.name, passed: false, skipped: true, error: null, duration: 0 });
            continue;
          }

          // Run beforeEach hooks
          runHooks(suite.hooks.beforeEach);

          var testStart = Date.now();
          var testErr = null;
          var testPassed = true;

          try {
            test.fn();
          } catch (e) {
            testErr = e.message;
            if (e.stack) { testErr += '\n' + e.stack; }
            testPassed = false;
          }

          var testDuration = Date.now() - testStart;

          // Run afterEach hooks
          runHooks(suite.hooks.afterEach);

          if (testPassed) {
            sr.passed++;
            results.passed++;
          } else {
            sr.failed++;
            results.failed++;
          }

          results.total++;
          sr.tests.push({
            name: test.name,
            passed: testPassed,
            skipped: false,
            error: testErr,
            duration: testDuration
          });
        }

        // Run afterAll hooks once per suite
        runHooks(suite.hooks.afterAll);

        sr.duration = Date.now() - startTime;
        results.suites.push(sr);
      }

      results.duration = Date.now() - startTime;
      return results;
    }

    function runHooks(hookList) {
      for (var i = 0; i < hookList.length; i++) {
        try { hookList[i](); } catch (e) {
          // Hook errors are reported but do not fail the test
          if (config.verbose && hasWindow && typeof console !== 'undefined') {
            console.warn('Hook error:', e.message);
          }
        }
      }
    }

    // -- reporting --

    function report(format) {
      if (format === 'json') {
        return JSON.stringify(results, null, 2);
      }

      var r = results;
      var out = '\n=== Test Results ===\n\n';

      for (var i = 0; i < r.suites.length; i++) {
        var s = r.suites[i];
        out += '  ' + s.name + ' (' + s.passed + ' passed, ' + s.failed +
               ' failed, ' + s.skipped + ' skipped) ' + s.duration + 'ms\n';

        if (s.error) {
          out += '    ERROR: ' + s.error + '\n';
          continue;
        }

        for (var j = 0; j < s.tests.length; j++) {
          var t = s.tests[j];
          if (t.skipped) {
            out += '    - ' + t.name + ' (skipped)\n';
          } else if (t.passed) {
            out += '    ' + colorize('PASS', 'green') + ' ' + t.name + ' (' + t.duration + 'ms)\n';
          } else {
            out += '    ' + colorize('FAIL', 'red') + ' ' + t.name + '\n';
            if (t.error) {
              var errLines = t.error.replace(/\r/g, '').split('\n');
              for (var k = 0; k < errLines.length; k++) {
                out += '      ' + errLines[k] + '\n';
              }
            }
          }
        }
        out += '\n';
      }

      out += '  Total: ' + r.passed + ' passed, ' + r.failed + ' failed, ' +
             r.skipped + ' skipped (' + r.duration + 'ms)\n';

      if (r.failed > 0) {
        out += '\n  ' + colorize('SOME TESTS FAILED', 'red') + '\n';
      } else {
        out += '\n  ' + colorize('ALL TESTS PASSED', 'green') + '\n';
      }

      return out;
    }

    // -- reset --

    function reset() {
      suites = [];
      currentSuite = null;
      results = { passed: 0, failed: 0, skipped: 0, total: 0, suites: [], duration: 0 };
      config.timeout = 5000;
      config.verbose = false;
      config.filter = null;
    }

    // -- summary shortcut --

    function summary() {
      var r = results;
      return r.passed + '/' + r.total + ' passed' +
        (r.failed > 0 ? ', ' + r.failed + ' failed' : '') +
        (r.skipped > 0 ? ', ' + r.skipped + ' skipped' : '') +
        ' (' + r.duration + 'ms)';
    }

    return {
      describe: describe,
      it: it,
      xit: xit,
      skip: skip,
      expect: expect,
      beforeAll: beforeAll,
      afterAll: afterAll,
      beforeEach: beforeEach,
      afterEach: afterEach,
      run: run,
      report: report,
      reset: reset,
      summary: summary,
      deepEqual: deepEqual,
      get results() { return results; },
      get config() { return config; },
      get hasVNode() { return hasVNode; }
    };
  });
})();
