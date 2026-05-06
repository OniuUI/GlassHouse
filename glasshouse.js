(function () {
  'use strict';

  const MAX_BLOCK_SIZE = 40960;
  const MAX_TOTAL_SIZE = 262144;
  const STALE_TIMEOUT = 30000;
  const CLEANUP_INTERVAL = 15000;

  const blocks = Object.create(null);
  const loaded = Object.create(null);
  const sizes = Object.create(null);

  let totalSize = 0;
  let activeBlockCount = 0;
  let _lastRequire = null;
  let globalCycle = 0;

  const STALE_CYCLE_WINDOW = 5;
  const STALE_CYCLE_THRESHOLD = 2;
  const STALE_FREQ_THRESHOLD = 0.2;
  const MEMORY_PRESSURE_THRESHOLD = 0.75;
  const PREDICT_TRANSITION_MIN = 3;

  function measureSize(fn) {
    const str = fn.toString();
    let bytes = str.length;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      if (c > 0x7f) bytes += (c > 0x7ff) ? 2 : 1;
    }
    return bytes;
  }

  function checkSize(name, factory) {
    const size = measureSize(factory);
    if (size > MAX_BLOCK_SIZE) {
      throw new Error(
        'Block "' + name + '" exceeds MAX_BLOCK_SIZE: ' +
        size + 'B / ' + MAX_BLOCK_SIZE + 'B'
      );
    }
    if (totalSize + size > MAX_TOTAL_SIZE) {
      throw new Error(
        'Total block size would exceed MAX_TOTAL_SIZE: ' +
        (totalSize + size) + 'B / ' + MAX_TOTAL_SIZE + 'B'
      );
    }
    return size;
  }

  function loadDependencies(name, deps) {
    for (let i = 0; i < deps.length; i++) {
      const dep = deps[i];
      if (!blocks[dep]) {
        throw new Error(
          'Block "' + name + '" requires "' + dep + '" which is not defined'
        );
      }
      if (!loaded[dep]) {
        loadBlock(dep);
      }
    }
  }

  function loadBlock(name) {
    const block = blocks[name];
    if (loaded[name]) return loaded[name];

    loadDependencies(name, block.deps);

    const depInstances = block.deps.map(function (dep) {
      return loaded[dep].instance;
    });

    const start = performance.now();
    const instance = block.factory.apply(null, depInstances);
    const loadTime = (performance.now() - start).toFixed(2);

    loaded[name] = {
      name: name,
      instance: instance,
      lastUsed: Date.now(),
      loadTime: parseFloat(loadTime),
      isStale: false,
      accessCount: 0,
      cycleHits: [0, 0, 0, 0, 0],
      cycleIdx: 0,
      freqDecay: 0.0,
      attached: true,
      lastAccessor: null,
      transitions: Object.create(null)
    };
    activeBlockCount++;

    if (typeof instance._onGlassHouseLoad === 'function') {
      instance._onGlassHouseLoad();
    }

    return loaded[name];
  }

  function markUsed(name, accessor) {
    if (!loaded[name]) return;

    var entry = loaded[name];

    // Basic timestamp
    entry.lastUsed = Date.now();
    entry.isStale = false;

    // Access counter
    entry.accessCount++;

    // Transition tracking
    if (entry.lastAccessor && entry.lastAccessor !== name) {
      var trans = loaded[entry.lastAccessor];
      if (trans) {
        trans.transitions[name] = (trans.transitions[name] || 0) + 1;
      }
    }
    entry.lastAccessor = accessor || null;

    // Cycle tracking (increment global cycle periodically)
    var cycleLen = globalCycle % STALE_CYCLE_WINDOW;
    if (entry.cycleIdx !== cycleLen) {
      entry.cycleHits[cycleLen] = entry.cycleHits[cycleLen] || 0;
      entry.cycleIdx = cycleLen;
    }
    entry.cycleHits[entry.cycleIdx]++;

    // Frequency decay (EMA with alpha=0.25)
    var alpha = 0.25;
    if (entry.freqDecay === 0) {
      entry.freqDecay = 1.0;
    } else {
      entry.freqDecay = alpha * 1.0 + (1 - alpha) * entry.freqDecay;
    }
  }

  function isStaleBlock(name) {
    var entry = loaded[name];
    if (!entry) return false;

    // 1. DOM detached → stale immediately
    if (entry.attached === false) return true;

    // 2. Not used in recent cycles
    var cycleSum = 0;
    for (var i = 0; i < STALE_CYCLE_WINDOW; i++) {
      cycleSum += entry.cycleHits[i] || 0;
    }
    if (cycleSum < STALE_CYCLE_THRESHOLD && entry.accessCount > 3) return true;

    // 3. Frequency decay below threshold
    if (entry.freqDecay < STALE_FREQ_THRESHOLD && entry.accessCount > 3) return true;

    // 4. Still within TTL grace period
    if (Date.now() - entry.lastUsed < STALE_TIMEOUT) return false;

    return true;
  }

  function getColdestBlock() {
    var coldest = null;
    var coldestTime = Infinity;
    var names = Object.keys(loaded);

    for (var i = 0; i < names.length; i++) {
      var entry = loaded[names[i]];
      if (!entry || entry.attached === false) continue;
      if (blocks[names[i]] && blocks[names[i]].canStale === false) continue;
      if (entry.lastUsed < coldestTime) {
        coldestTime = entry.lastUsed;
        coldest = names[i];
      }
    }
    return coldest;
  }

  function evictColdest(count) {
    for (var i = 0; i < (count || 1); i++) {
      var coldest = getColdestBlock();
      if (coldest && isStaleBlock(coldest)) {
        unloadBlock(coldest);
      } else {
        break;
      }
    }
  }

  function predictNext(currentName) {
    var entry = loaded[currentName];
    if (!entry || !entry.transitions) return null;

    var best = null;
    var bestCount = 0;
    var names = Object.keys(entry.transitions);
    for (var i = 0; i < names.length; i++) {
      if (entry.transitions[names[i]] > bestCount) {
        bestCount = entry.transitions[names[i]];
        best = names[i];
      }
    }
    return bestCount >= PREDICT_TRANSITION_MIN ? best : null;
  }

  function unloadBlock(name) {
    if (!loaded[name]) return;

    const entry = loaded[name];

    if (typeof entry.instance.destroy === 'function') {
      entry.instance.destroy();
    }
    if (typeof entry.instance._onGlassHouseUnload === 'function') {
      entry.instance._onGlassHouseUnload();
    }

    delete loaded[name];
    activeBlockCount--;
  }

  function collectStale() {
    globalCycle++;

    var keys = Object.keys(loaded);
    for (var i = 0; i < keys.length; i++) {
      var name = keys[i];
      if (loaded[name] && isStaleBlock(name)) {
        loaded[name].isStale = true;
      }
    }

    keys = Object.keys(loaded);
    for (var i = 0; i < keys.length; i++) {
      var name = keys[i];
      var entry = loaded[name];
      if (entry && entry.isStale) {
        var block = blocks[name];
        if (block && block.canStale !== false) {
          unloadBlock(name);
        }
      }
    }

    // Memory pressure eviction
    var activeSize = 0;
    for (var i = 0; i < keys.length; i++) {
      if (loaded[keys[i]]) activeSize += (sizes[keys[i]] || 0);
    }
    if (activeSize > MAX_TOTAL_SIZE * MEMORY_PRESSURE_THRESHOLD) {
      evictColdest(Math.ceil(loadedCount() * 0.1));
    }
  }

  function loadedCount() {
    return Object.keys(loaded).filter(function (n) { return !!loaded[n]; }).length;
  }

  const GlassHouse = {
    MAX_BLOCK_SIZE: MAX_BLOCK_SIZE,
    MAX_TOTAL_SIZE: MAX_TOTAL_SIZE,
    STALE_TIMEOUT: STALE_TIMEOUT,

    define: function (name, deps, factory) {
      if (blocks[name]) {
        throw new Error('Block "' + name + '" is already defined');
      }

      const size = checkSize(name, factory);

      blocks[name] = {
        name: name,
        deps: deps || [],
        factory: factory,
        size: size,
        canStale: true,
        definedAt: Date.now()
      };

      sizes[name] = size;
      totalSize += size;

      return GlassHouse;
    },

    handler: function (name, config) {
      var hm = GlassHouse.require('handler');
      return hm.register(name, config);
    },

    getHandler: function (name) {
      try {
        var hm = require('handler');
        return hm.get(name);
      } catch (e) {
        throw new Error('Handler "' + name + '" not found or handler system not loaded.');
      }
    },

    listHandlers: function () {
      try {
        var hm = require('handler');
        return hm.list();
      } catch (e) {
        return [];
      }
    },

    require: function (name) {
      if (!blocks[name]) {
        throw new Error(
          'Block "' + name + '" does not exist. Available: ' +
          Object.keys(blocks).join(', ')
        );
      }

      if (!loaded[name]) {
        loadBlock(name);
      }

      markUsed(name, _lastRequire ? _lastRequire : name);
      _lastRequire = name;
      return loaded[name].instance;
    },

    isLoaded: function (name) {
      return !!loaded[name];
    },

    isStale: function (name) {
      return loaded[name] ? loaded[name].isStale : false;
    },

    unload: function (name) {
      unloadBlock(name);
    },

    stats: function () {
      const totalSizeKB = (totalSize / 1024).toFixed(2);
      const activeSize = Object.keys(loaded).reduce(function (sum, name) {
        return sum + (sizes[name] || 0);
      }, 0);
      const activeSizeKB = (activeSize / 1024).toFixed(2);
      const memoryPressure = activeSize / MAX_TOTAL_SIZE;
      const staleCandidates = Object.keys(loaded).filter(function (n) {
        return loaded[n] && isStaleBlock(n);
      }).length;
      const detachedCount = Object.keys(loaded).filter(function (n) {
        return loaded[n] && loaded[n].attached === false;
      }).length;

      return {
        totalBlocks: Object.keys(blocks).length,
        activeBlocks: activeBlockCount,
        staleBlocks: Object.keys(loaded).filter(function (n) {
          return loaded[n] && loaded[n].isStale;
        }).length,
        staleCandidates: staleCandidates,
        detachedBlocks: detachedCount,
        memoryPressure: parseFloat((memoryPressure * 100).toFixed(0)),
        predictedNext: _lastRequire ? predictNext(_lastRequire) : null,
        totalSize: totalSize,
        totalSizeKB: totalSizeKB,
        activeSize: activeSize,
        activeSizeKB: activeSizeKB,
        maxBlockSize: MAX_BLOCK_SIZE,
        maxTotalSize: MAX_TOTAL_SIZE
      };
    },

    listBlocks: function () {
      return Object.keys(blocks).map(function (name) {
        var b = blocks[name];
        return {
          name: name,
          size: b.size,
          deps: b.deps.slice(),
          loaded: !!loaded[name],
          stale: loaded[name] ? loaded[name].isStale : false,
          loadTime: loaded[name] ? loaded[name].loadTime : null
        };
      });
    },

    ready: function (fn) {
      if (document.readyState === 'complete' ||
          document.readyState === 'interactive') {
        setTimeout(fn, 0);
      } else {
        document.addEventListener('DOMContentLoaded', fn);
      }
    },

    get packages() {
      return _packages;
    },

    have: function (name) {
      return (!!blocks[name] || (_packages && _packages.has(name)));
    },

    importTS: function (url) {
      return new Promise(function (resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.onload = function () {
          if (xhr.status < 200 || xhr.status >= 400) {
            reject(new Error('Failed to load ' + url + ': ' + xhr.status));
            return;
          }
          var tsSource = xhr.responseText;
          try {
            var compiler = GlassHouse.require('ts-compiler');
            var result = compiler.compile(tsSource);
            if (!result.js) {
              reject(new Error('TS compilation failed for ' + url));
              return;
            }
            var script = document.createElement('script');
            script.textContent = result.js;
            script.setAttribute('data-source', url);
            document.head.appendChild(script);
            resolve(result);
          } catch (e) {
            reject(new Error('TS loader error for ' + url + ': ' + e.message));
          }
        };
        xhr.onerror = function () {
          reject(new Error('Network error loading ' + url));
        };
        xhr.send();
      });
    }
  };

  let _packages = null;

  Object.defineProperty(GlassHouse, 'packages', {
    get: function () { return _packages; },
    set: function (v) {
      if (_packages !== null) {
        throw new Error('GlassHouse.packages is already configured');
      }
      _packages = v;
    },
    enumerable: true,
    configurable: false
  });

  Object.freeze(GlassHouse);
  Object.freeze(GlassHouse.stats);
  Object.freeze(GlassHouse.listBlocks);

  window.GlassHouse = GlassHouse;

  setInterval(collectStale, CLEANUP_INTERVAL);

  if (typeof window.__GlassHouse_BOOT__ === 'function') {
    window.__GlassHouse_BOOT__();
  }
})();
