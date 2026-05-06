(function () {
  'use strict';

  GlassHouse.define('resolver', [], function () {

    function resolve(entryBlocks, allBlocks) {
      var graph = Object.create(null);
      var visited = Object.create(null);
      var queue = entryBlocks.slice();
      var ordered = [];

      for (var i = 0; i < entryBlocks.length; i++) {
        visited[entryBlocks[i]] = true;
      }

      while (queue.length > 0) {
        var name = queue.shift();
        ordered.push(name);

        var block = allBlocks[name];
        if (!block) continue;

        graph[name] = { deps: block.deps.slice(), size: block.size, source: null };

        for (var j = 0; j < block.deps.length; j++) {
          var dep = block.deps[j];
          if (!visited[dep]) {
            visited[dep] = true;
            queue.push(dep);
          }
        }
      }

      return {
        order: ordered,
        graph: graph,
        totalBlocks: ordered.length,
        leafBlocks: ordered.filter(function (n) {
          return !graph[n] || graph[n].deps.length === 0;
        })
      };
    }

    function resolveFromList(entryNames) {
      var all = GlassHouse.listBlocks();
      var map = Object.create(null);
      for (var i = 0; i < all.length; i++) {
        map[all[i].name] = all[i];
      }

      var names = entryNames && entryNames.length > 0
        ? entryNames
        : all.filter(function (b) { return b.loaded; }).map(function (b) { return b.name; });

      return resolve(names, map);
    }

    function reverseTopological(order, graph) {
      var depsCount = Object.create(null);
      for (var i = 0; i < order.length; i++) {
        var n = order[i];
        depsCount[n] = graph[n] ? graph[n].deps.length : 0;
      }

      var sorted = [];
      var ready = order.filter(function (n) { return depsCount[n] === 0; });
      var queued = Object.create(null);

      while (ready.length > 0) {
        var name = ready.shift();
        if (queued[name]) continue;
        queued[name] = true;
        sorted.push(name);

        for (var i = 0; i < order.length; i++) {
          var other = order[i];
          if (graph[other] && graph[other].deps.indexOf(name) !== -1) {
            depsCount[other]--;
            if (depsCount[other] === 0) ready.push(other);
          }
        }
      }

      return sorted;
    }

    var resolver = {
      resolve: resolve,
      resolveFromList: resolveFromList,
      reverseTopological: reverseTopological
    };

    return resolver;
  });
})();
