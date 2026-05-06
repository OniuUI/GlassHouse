(function () {
  'use strict';

  GlassHouse.define('auditor', ['lint', 'types', 'wcag-validator'], function (lint, T, wcag) {

    function auditAll(options) {
      var opts = options || {};
      var report = {
        sections: [],
        totalErrors: 0,
        totalWarnings: 0,
        passed: true,
        timestamp: Date.now()
      };

      report.sections.push(auditStructure(opts));
      report.sections.push(auditSecurity(opts));
      report.sections.push(auditTypes(opts));
      report.sections.push(auditHandlers(opts));
      report.sections.push(auditWCAG(opts));
      report.sections.push(auditPerformance(opts));
      report.sections.push(auditDependencies(opts));

      for (var i = 0; i < report.sections.length; i++) {
        report.totalErrors += report.sections[i].errors.length;
        report.totalWarnings += report.sections[i].warnings.length;
      }

      report.passed = report.totalErrors === 0;

      return report;
    }

    function auditStructure() {
      var errors = [];
      var warnings = [];
      var required = ['glasshouse', 'packages', 'src', 'styles'];

      var blocks = GlassHouse.listBlocks();
      var blockNames = blocks.map(function (b) { return b.name; });

      if (blocks.length < 3) warnings.push('Few blocks registered — may indicate load failures');

      var hasPebble = blockNames.indexOf('pebble') !== -1;
      var hasShine = blockNames.indexOf('shine') !== -1;
      var hasHandler = blockNames.indexOf('handler') !== -1;

      if (!hasPebble) errors.push('Core block "pebble" not registered');
      if (!hasShine) warnings.push('Core block "shine" not registered — no theming available');
      if (!hasHandler) warnings.push('Core block "handler" not registered');

      return {
        name: 'Structure',
        passed: errors.length === 0,
        errors: errors,
        warnings: warnings,
        metrics: {
          totalBlocks: blocks.length,
          loadedBlocks: GlassHouse.stats().activeBlocks,
          packagesInstalled: GlassHouse.packages ? GlassHouse.packages.list().length : 0
        }
      };
    }

    function auditSecurity() {
      var errors = [];
      var warnings = [];
      var lintErrors = lint.errors();
      var lintWarnings = lint.warnings();

      // Check all registered blocks
      var blocks = GlassHouse.listBlocks();
      for (var i = 0; i < blocks.length; i++) {
        var b = blocks[i];
        var blockLintErrors = lintErrors.filter(function (e) { return e.block === b.name; });
        var blockLintWarns = lintWarnings.filter(function (w) { return w.block === b.name; });

        for (var j = 0; j < blockLintErrors.length; j++) {
          errors.push('[' + b.name + '] ' + blockLintErrors[j].message);
        }
        for (var j = 0; j < blockLintWarns.length; j++) {
          warnings.push('[' + b.name + '] ' + blockLintWarns[j].message);
        }
      }

      // Check for packages that may have security issues
      if (GlassHouse.packages) {
        var pkgs = GlassHouse.packages.list();
        for (var i = 0; i < pkgs.length; i++) {
          if (pkgs[i].size && pkgs[i].size > GlassHouse.MAX_BLOCK_SIZE) {
            warnings.push('[' + pkgs[i].name + '] Package size ' + pkgs[i].size + 'B exceeds block limit ' + GlassHouse.MAX_BLOCK_SIZE + 'B');
          }
        }
      }

      return {
        name: 'Security',
        passed: errors.length === 0,
        errors: errors,
        warnings: warnings,
        metrics: { lintErrors: lintErrors.length, lintWarnings: lintWarnings.length }
      };
    }

    function auditTypes() {
      var errors = [];
      var warnings = [];
      var coverage = { total: 0, withPropTypes: 0, withStateTypes: 0 };

      var blocks = GlassHouse.listBlocks();
      for (var i = 0; i < blocks.length; i++) {
        var b = blocks[i];
        try {
          var inst = GlassHouse.require(b.name);
          if (inst && typeof inst.propTypes !== 'undefined') {
            coverage.total++;
            if (inst.propTypes && Object.keys(inst.propTypes).length > 0) coverage.withPropTypes++;
          }
        } catch (e) {}
      }

      if (coverage.total > 0) {
        var pct = ((coverage.withPropTypes / coverage.total) * 100).toFixed(0);
        if (pct < 100) {
          errors.push('Type coverage: ' + pct + '% (' + coverage.withPropTypes + '/' + coverage.total + ' pebbles have propTypes)');
        }
      }

      return {
        name: 'Type Safety',
        passed: errors.length === 0,
        errors: errors,
        warnings: warnings,
        metrics: {
          totalPebbles: coverage.total,
          withPropTypes: coverage.withPropTypes,
          withStateTypes: coverage.withStateTypes,
          coveragePct: coverage.total > 0 ? ((coverage.withPropTypes / coverage.total) * 100).toFixed(0) : 100
        }
      };
    }

    function auditHandlers() {
      var errors = [];
      var warnings = [];

      var allHandlers = GlassHouse.listHandlers();
      var handlerExports = {};
      var hasDuplicates = false;

      for (var i = 0; i < allHandlers.length; i++) {
        var h = allHandlers[i];
        for (var j = 0; j < h.exports.length; j++) {
          var exp = h.exports[j];
          if (handlerExports[exp]) {
            warnings.push('Export "' + exp + '" defined in both "' + handlerExports[exp] + '" and "' + h.name + '"');
            hasDuplicates = true;
          } else {
            handlerExports[exp] = h.name;
          }
        }
      }

      if (hasDuplicates) {
        errors.push('Duplicate handler exports detected');
      }

      // Check inline logic in pebbles
      var lintErrors = lint.errors().filter(function (e) { return e.rule === 'HANDLER_LOGIC'; });
      var lintWarns = lint.warnings().filter(function (w) { return w.rule === 'HANDLER_VALIDATION'; });

      for (var i = 0; i < lintErrors.length; i++) {
        errors.push(lintErrors[i].message);
      }
      for (var i = 0; i < lintWarns.length; i++) {
        warnings.push(lintWarns[i].message);
      }

      return {
        name: 'Handlers',
        passed: errors.length === 0,
        errors: errors,
        warnings: warnings,
        metrics: {
          totalHandlers: allHandlers.length,
          totalExports: Object.keys(handlerExports).length,
          duplicateExports: hasDuplicates ? Object.keys(handlerExports).length - new Set(Object.values(handlerExports)).size : 0
        }
      };
    }

    function auditWCAG() {
      var errors = [];
      var warnings = [];

      try {
        var Shine = GlassHouse.require('shine');
        var shines = Shine.getAll();

        for (var i = 0; i < shines.length; i++) {
          var theme = shines[i].getTheme();
          var result = wcag.validateTheme(theme);

          for (var j = 0; j < result.errors.length; j++) {
            errors.push('[' + shines[i]._name + '] ' + result.errors[j].message);
          }
          for (var j = 0; j < result.warnings.length; j++) {
            warnings.push('[' + shines[i]._name + '] ' + result.warnings[j].message);
          }
        }

        // Check CSS output
        for (var i = 0; i < shines.length; i++) {
          var css = shines[i].getCSS();
          var cssResult = wcag.validateCSS(css);
          for (var j = 0; j < cssResult.errors.length; j++) {
            errors.push('[' + shines[i]._name + ' CSS] ' + cssResult.errors[j].message);
          }
        }

        if (shines.length === 0) {
          warnings.push('No Shines installed — consider adding WCAG-compliant theming');
        }
      } catch (e) {
        warnings.push('WCAG check unavailable: ' + e.message);
      }

      return {
        name: 'WCAG Accessibility',
        passed: errors.length === 0,
        errors: errors,
        warnings: warnings,
        metrics: {
          shinesChecked: GlassHouse.require ? 0 : 0
        }
      };
    }

    function auditPerformance() {
      var errors = [];
      var warnings = [];
      var stats = GlassHouse.stats();

      if (stats.memoryPressure > 75) {
        warnings.push('Memory pressure: ' + stats.memoryPressure + '% — consider reducing loaded blocks');
      }

      if (stats.staleCandidates > stats.activeBlocks * 0.5) {
        warnings.push(stats.staleCandidates + ' blocks are stale candidates — may indicate unused code');
      }

      if (stats.detachedBlocks > 0) {
        warnings.push(stats.detachedBlocks + ' blocks have detached DOM — may indicate memory leaks');
      }

      if (stats.totalSize > stats.maxTotalSize * 0.8) {
        errors.push('Total size ' + stats.totalSizeKB + 'KB approaching limit of ' + (stats.maxTotalSize / 1024).toFixed(0) + 'KB');
      }

      var blocks = GlassHouse.listBlocks();
      for (var i = 0; i < blocks.length; i++) {
        if (blocks[i].size > stats.maxBlockSize * 0.9) {
          warnings.push('[' + blocks[i].name + '] Size ' + (blocks[i].size / 1024).toFixed(1) + 'KB near limit of ' + (stats.maxBlockSize / 1024).toFixed(0) + 'KB');
        }
      }

      return {
        name: 'Performance',
        passed: errors.length === 0,
        errors: errors,
        warnings: warnings,
        metrics: {
          memoryPressure: stats.memoryPressure,
          staleCandidates: stats.staleCandidates,
          detachedBlocks: stats.detachedBlocks,
          totalSizeKB: stats.totalSizeKB
        }
      };
    }

    function auditDependencies() {
      var errors = [];
      var warnings = [];

      var blocks = GlassHouse.listBlocks();
      var blockSet = {};
      for (var i = 0; i < blocks.length; i++) blockSet[blocks[i].name] = true;

      // Check all block deps exist
      for (var i = 0; i < blocks.length; i++) {
        var b = blocks[i];
        for (var j = 0; j < b.deps.length; j++) {
          if (!blockSet[b.deps[j]]) {
            errors.push('[' + b.name + '] Missing dependency: ' + b.deps[j]);
          }
        }
      }

      // Check for unused dependencies
      for (var i = 0; i < blocks.length; i++) {
        var b = blocks[i];
        if (b.deps.length > 0 && !b.loaded) {
          warnings.push('[' + b.name + '] Has dependencies but is not loaded — possibly unused block');
        }
      }

      // Package checks
      if (GlassHouse.packages) {
        var pkgs = GlassHouse.packages.list();
        for (var i = 0; i < pkgs.length; i++) {
          var deps = pkgs[i].dependencies || {};
          var depNames = Object.keys(deps);
          for (var j = 0; j < depNames.length; j++) {
            if (!GlassHouse.packages.has(depNames[j])) {
              warnings.push('[' + pkgs[i].name + '] Package depends on "' + depNames[j] + '" which is not installed');
            }
          }
        }
      }

      return {
        name: 'Dependencies',
        passed: errors.length === 0,
        errors: errors,
        warnings: warnings,
        metrics: { totalBlocks: blocks.length, loadedBlocks: GlassHouse.stats().activeBlocks }
      };
    }

    function formatReport(report) {
      var lines = [];
      lines.push('╔══════════════════════════════════════╗');
      lines.push('║   Glass House Audit Report          ║');
      lines.push('╚══════════════════════════════════════╝');
      lines.push('');

      for (var i = 0; i < report.sections.length; i++) {
        var s = report.sections[i];
        var icon = s.passed ? '\u2713' : '\u2717';
        if (icon === '\u2717' && s.errors.length === 0) icon = '\u26A0';
        lines.push(icon + ' ' + s.name + ' (' + s.errors.length + ' errors, ' + s.warnings.length + ' warnings)');

        for (var j = 0; j < s.errors.length; j++) {
          lines.push('  \u2717 ' + s.errors[j]);
        }
        for (var j = 0; j < s.warnings.length && j < 3; j++) {
          lines.push('  \u26A0 ' + s.warnings[j]);
        }
        if (s.warnings.length > 3) {
          lines.push('  ... and ' + (s.warnings.length - 3) + ' more warnings');
        }
        lines.push('');
      }

      lines.push('Total: ' + report.totalErrors + ' error(s), ' + report.totalWarnings + ' warning(s)');
      lines.push(report.passed ? 'Audit PASSED' : 'Audit FAILED');

      return lines.join('\n');
    }

    function autoFix(report) {
      var fixes = [];
      var reportStr = formatReport(report);

      if (report.totalWarnings > 0 && report.totalErrors === 0) {
        fixes.push('No hard errors to fix — review ' + report.totalWarnings + ' warnings manually');
      }

      return { fixes: fixes, report: reportStr };
    }

    var auditor = {
      auditAll: auditAll,
      auditStructure: auditStructure,
      auditSecurity: auditSecurity,
      auditTypes: auditTypes,
      auditHandlers: auditHandlers,
      auditWCAG: auditWCAG,
      auditPerformance: auditPerformance,
      auditDependencies: auditDependencies,
      formatReport: formatReport,
      autoFix: autoFix
    };

    return auditor;
  });
})();
