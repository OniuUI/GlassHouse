(function () {
  'use strict';

  GlassHouse.define('builder', [
    'resolver', 'tree-shaker', 'hyper-compactor', 'rom', 'decompressor', 'ts-compiler'
  ], function (resolver, shaker, compactor, rom, decompressor, tsCompiler) {

    function build(options) {
      var opts = options || {};
      var dev = opts.dev || false;
      var entries = opts.entries || null;
      var report = { stages: [], success: false, totalTime: 0, verified: false };
      var tStart = performance.now();

      // Stage 1: Resolve
      var t1 = performance.now();
      var resolved = resolver.resolveFromList(entries);
      report.stages.push({
        stage: 'resolve', duration: parseFloat((performance.now() - t1).toFixed(2)),
        blocks: resolved.totalBlocks
      });

      // Stage 2: Tree-shake
      var t2 = performance.now();
      var sources = shaker.collectSources(resolved.order);
      var shaken = shaker.shake(resolved.order, resolved.graph, sources);
      var analysis = shaker.analyze(sources, resolved.graph);
      report.stages.push({
        stage: 'tree-shake', duration: parseFloat((performance.now() - t2).toFixed(2)),
        kept: shaken.keptCount, removed: shaken.removedCount,
        removedBytes: analysis.totalSize - analysis.keptSize
      });

      // Stage 3: Collect real sources
      var t3 = performance.now();
      var blockSources = Object.create(null);
      var totalSourceLen = 0;

      for (var i = 0; i < shaken.kept.length; i++) {
        var name = shaken.kept[i];
        try {
          var inst = GlassHouse.require(name);
          if (inst && inst.constructor && typeof inst.constructor.toString === 'function') {
            var ctorSrc = inst.constructor.toString();
            if (ctorSrc.length > 20) { blockSources[name] = ctorSrc; totalSourceLen += ctorSrc.length; }
          }
        } catch (e) {}
        if (!blockSources[name]) {
          blockSources[name] = '(function(){/*' + name + '*/})();';
          totalSourceLen += blockSources[name].length;
        }
      }

      report.stages.push({
        stage: 'collect', duration: parseFloat((performance.now() - t3).toFixed(2)),
        sourceCount: Object.keys(blockSources).length, sourceBytes: totalSourceLen
      });

      // Stage 4: Hyper-compact
      var t4 = performance.now();
      var compactResult = null;
      var binaryB64 = null;
      var bundle = '';
      var identMap = {};

      if (!dev) {
        compactResult = compactor.compactAll(blockSources);

        if (compactResult && compactResult.binary) {
          binaryB64 = compactResult.binaryBase64;
          bundle = '/* Glass House GHC2 — ' + new Date().toISOString() + ' */\n';
          bundle += '/* ' + compactResult.blocks.count + ' blocks | ' +
            formatBytes(compactResult.binarySize) + ' binary | ' +
            compactResult.reduction + '% reduction */\n';
          bundle += 'var _GH="' + binaryB64 + '";\n';
          bundle += 'GlassHouse.require("decompressor").loadFromBase64(_GH);\n';

          identMap = compactResult.identMap || {};
          report.verified = compactResult.roundTrip && compactResult.roundTrip.passed;
          report.verification = compactResult.verification;
        } else {
          bundle = Object.values(blockSources).join('\n');
        }
      } else {
        bundle = Object.values(blockSources).join('\n');
        compactResult = { totalRenamed: 0, poolEntries: 0, reduction: 0 };
      }

      report.stages.push({
        stage: 'hyper-compact',
        duration: parseFloat((performance.now() - t4).toFixed(2)),
        renamed: compactResult ? compactResult.totalRenamed : 0,
        poolEntries: compactResult ? compactResult.poolEntries : 0,
        cleanedBytes: compactResult ? compactResult.cleanedSize : 0,
        tokenBytes: compactResult ? compactResult.tokenCompactedSize : 0,
        pooledBytes: compactResult ? compactResult.pooledSize : 0,
        binaryBytes: compactResult ? compactResult.binarySize : 0,
        reduction: compactResult ? compactResult.reduction : 0,
        reductionVsCleaned: compactResult ? compactResult.reductionVsCleaned : 0
      });

      // Stage 5: ROM
      var t5 = performance.now();
      if (Object.keys(identMap).length > 0) {
        var romBuffer = rom.build(identMap);
        var romB64 = rom.toBase64(romBuffer);
        var romLoader = rom.toEmbeddedLoader(romBuffer);
        bundle += '\n' + romLoader + '\n';
        report.rom = { buffer: romBuffer, base64: romB64, size: romBuffer.length, entries: Object.keys(identMap).length };
        report.stages.push({
          stage: 'rom', duration: parseFloat((performance.now() - t5).toFixed(2)),
          entries: Object.keys(identMap).length, size: romBuffer.length
        });
      } else {
        report.rom = null;
        report.stages.push({
          stage: 'rom', duration: parseFloat((performance.now() - t5).toFixed(2)),
          entries: 0, size: 0
        });
      }

      report.totalTime = parseFloat((performance.now() - tStart).toFixed(2));
      report.sourceBytes = totalSourceLen;
      report.bundleSize = bundle.length;
      report.bundleSizeKB = parseFloat((bundle.length / 1024).toFixed(2));
      report.success = true;
      report.bundle = bundle;
      report.binary = compactResult ? compactResult.binary : null;
      report.compactResult = compactResult;

      return report;
    }

    function download(report, filename) {
      if (!report || !report.bundle) return;
      var base = filename || 'glasshouse';

      var blob = new Blob([report.bundle], { type: 'application/javascript' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a'); a.href = url; a.download = base + '.bundle.js';
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);

      if (report.binary) {
        var bBlob = new Blob([report.binary], { type: 'application/octet-stream' });
        var bUrl = URL.createObjectURL(bBlob);
        var ba = document.createElement('a'); ba.href = bUrl; ba.download = base + '.ghb';
        document.body.appendChild(ba); ba.click(); document.body.removeChild(ba); URL.revokeObjectURL(bUrl);
      }

      if (report.rom && report.rom.buffer) {
        var rBlob = new Blob([report.rom.buffer], { type: 'application/octet-stream' });
        var rUrl = URL.createObjectURL(rBlob);
        var ra = document.createElement('a'); ra.href = rUrl; ra.download = base + '.rom';
        document.body.appendChild(ra); ra.click(); document.body.removeChild(ra); URL.revokeObjectURL(rUrl);
      }
    }

    function formatBytes(b) { return b >= 1024 ? (b / 1024).toFixed(1) + 'KB' : b + 'B'; }

    var builder = { build: build, download: download };
    return builder;
  });
})();
