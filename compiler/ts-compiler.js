(function () {
  'use strict';

  GlassHouse.define('ts-compiler', [
    'ts-lexer', 'ts-parser', 'ts-binder', 'ts-checker', 'ts-emitter'
  ], function (lexerModule, parserModule, binderModule, checkerModule, emitterModule) {

    function compile(source, options) {
      var opts = options || {};
      var result = {
        js: '',
        types: null,
        diagnostics: [],
        success: false,
        parseTime: 0,
        bindTime: 0,
        checkTime: 0,
        emitTime: 0
      };

      var t0 = performance.now();

      var ast;
      try {
        ast = parserModule.parse(source);
        result.parseTime = parseFloat((performance.now() - t0).toFixed(2));
      } catch (e) {
        result.diagnostics.push({
          severity: 'error',
          message: 'Parse error: ' + e.message,
          phase: 'parse'
        });
        return result;
      }

      var t1 = performance.now();
      var bindResult;
      try {
        bindResult = binderModule.bind(ast);
        result.bindTime = parseFloat((performance.now() - t1).toFixed(2));
      } catch (e) {
        result.diagnostics.push({
          severity: 'error',
          message: 'Bind error: ' + e.message,
          phase: 'bind'
        });
        return result;
      }

      var t2 = performance.now();
      var checkResult;
      try {
        checkResult = checkerModule.check(ast, bindResult);
        result.checkTime = parseFloat((performance.now() - t2).toFixed(2));
        result.diagnostics = result.diagnostics.concat(checkResult.diagnostics);
      } catch (e) {
        result.diagnostics.push({
          severity: 'error',
          message: 'Check error: ' + e.message,
          phase: 'check'
        });
      }

      var t3 = performance.now();
      try {
        result.types = checkerModule.extractTypeMetadata(ast, bindResult);
      } catch (e) {}

      try {
        result.js = emitterModule.emit(ast);
        result.emitTime = parseFloat((performance.now() - t3).toFixed(2));
      } catch (e) {
        result.diagnostics.push({
          severity: 'error',
          message: 'Emit error: ' + e.message,
          phase: 'emit'
        });
        return result;
      }

      result.totalTime = parseFloat((performance.now() - t0).toFixed(2));
      result.success = result.diagnostics.filter(function (d) { return d.severity === 'error'; }).length === 0;
      if (!result.success && result.js) {
        result.success = true;
      }

      return result;
    }

    function compileAndExecute(source, scopeObject) {
      var result = compile(source);
      if (!result.js) return result;

      try {
        var fn = new Function('exports', 'module', '__scope', result.js);
        var exports = {};
        var mod = { exports: exports };
        fn(exports, mod, scopeObject || {});
        result.exports = mod.exports;
      } catch (e) {
        result.diagnostics.push({
          severity: 'error',
          message: 'Runtime error: ' + e.message,
          phase: 'execute'
        });
        result.success = false;
      }

      return result;
    }

    function extractContracts(source) {
      var result = compile(source);
      if (!result.types) return {};

      var contracts = {
        propTypes: {},
        stateTypes: {},
        interfaces: result.types.interfaces || {},
        functions: result.types.functions || {}
      };

      var ifaces = result.types.interfaces || {};
      var propsIface = ifaces['Props'];
      var stateIface = ifaces['State'];

      if (propsIface && propsIface.properties) {
        Object.keys(propsIface.properties).forEach(function (key) {
          contracts.propTypes[key] = {
            type: propsIface.properties[key].type,
            optional: propsIface.properties[key].optional || false
          };
        });
      }

      if (stateIface && stateIface.properties) {
        Object.keys(stateIface.properties).forEach(function (key) {
          contracts.stateTypes[key] = {
            type: stateIface.properties[key].type,
            optional: stateIface.properties[key].optional || false
          };
        });
      }

      return contracts;
    }

    var compiler = {
      compile: compile,
      compileAndExecute: compileAndExecute,
      extractContracts: extractContracts,
    };

    Object.freeze(compiler);

    return compiler;
  });
})();
