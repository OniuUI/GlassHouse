(function () {
  'use strict';

  GlassHouse.define('tree-shaker', [], function () {

    function shake(resolvedOrder, resolvedGraph, blockSources) {
      var kept = Object.create(null);
      for (var i = 0; i < resolvedOrder.length; i++) {
        kept[resolvedOrder[i]] = true;
      }

      var removed = [];
      var sourceNames = Object.keys(blockSources);
      for (var i = 0; i < sourceNames.length; i++) {
        if (!kept[sourceNames[i]]) {
          removed.push(sourceNames[i]);
        }
      }

      return {
        kept: resolvedOrder.slice(),
        removed: removed,
        keptCount: resolvedOrder.length,
        removedCount: removed.length
      };
    }

    function collectSources(resolvedOrder) {
      var sources = Object.create(null);
      var blocks = GlassHouse.listBlocks();
      var blockMap = Object.create(null);

      for (var i = 0; i < blocks.length; i++) {
        blockMap[blocks[i].name] = blocks[i];
      }

      for (var i = 0; i < resolvedOrder.length; i++) {
        var name = resolvedOrder[i];
        var block = blockMap[name];
        if (!block) continue;

        try {
          var instance = GlassHouse.require(name);
          if (instance && typeof instance.toString === 'function') {
            sources[name] = { name: name, size: block.size, deps: block.deps };
          }
        } catch (e) {
          sources[name] = { name: name, size: block.size, deps: block.deps, error: e.message };
        }
      }

      return sources;
    }

    function analyze(blockSources, resolvedGraph) {
      var report = {
        total: Object.keys(blockSources).length,
        kept: resolvedGraph ? Object.keys(resolvedGraph).length : Object.keys(blockSources).length,
        removed: 0,
        totalSize: 0,
        keptSize: 0,
        removedBlocks: [],
        largestRemoved: null
      };

      var keptNames = resolvedGraph ? Object.keys(resolvedGraph) : Object.keys(blockSources);
      var keptSet = Object.create(null);
      for (var i = 0; i < keptNames.length; i++) keptSet[keptNames[i]] = true;

      var sourceNames = Object.keys(blockSources);
      for (var i = 0; i < sourceNames.length; i++) {
        var n = sourceNames[i];
        report.totalSize += blockSources[n].size || 0;
        if (keptSet[n]) {
          report.keptSize += blockSources[n].size || 0;
        } else {
          report.removed++;
          report.removedBlocks.push(n);
          if (!report.largestRemoved || (blockSources[n].size || 0) > (blockSources[report.largestRemoved].size || 0)) {
            report.largestRemoved = n;
          }
        }
      }

      return report;
    }

    var shaker = {
      shake: shake,
      collectSources: collectSources,
      analyze: analyze
    };

    return shaker;
  });
})();
