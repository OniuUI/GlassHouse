(function () {
  'use strict';

  GlassHouse.define('hyper-compactor', ['ts-lexer'], function (lexerModule) {

    var RESERVED = {
      'break':1,'case':1,'catch':1,'continue':1,'debugger':1,'default':1,'delete':1,'do':1,
      'else':1,'finally':1,'for':1,'function':1,'if':1,'in':1,'instanceof':1,'new':1,
      'return':1,'switch':1,'this':1,'throw':1,'try':1,'typeof':1,'var':1,'void':1,
      'while':1,'with':1,'class':1,'const':1,'enum':1,'export':1,'extends':1,'import':1,
      'super':1,'let':1,'yield':1,'async':1,'await':1,'static':1,'get':1,'set':1,'of':1,
      'from':1,'as':1,'true':1,'false':1,'null':1,'undefined':1,'NaN':1,'Infinity':1,
      'arguments':1,'eval':1,'constructor':1,'prototype':1
    };

    var GLOBALS = {
      'window':1,'document':1,'console':1,'Math':1,'JSON':1,'Date':1,'Array':1,'Object':1,
      'String':1,'Number':1,'Boolean':1,'RegExp':1,'Error':1,'Promise':1,'Map':1,'Set':1,
      'WeakMap':1,'WeakSet':1,'Symbol':1,'parseInt':1,'parseFloat':1,'isNaN':1,'isFinite':1,
      'setTimeout':1,'clearTimeout':1,'setInterval':1,'clearInterval':1,
      'performance':1,'localStorage':1,'sessionStorage':1,'XMLHttpRequest':1,
      'Blob':1,'URL':1,'TextEncoder':1,'TextDecoder':1,'Uint8Array':1,
      'GlassHouse':1,'location':1,'history':1,'navigator':1,'fetch':1
    };

    function isReserved(name) { return !!RESERVED[name] || !!GLOBALS[name]; }

    function charCode(index) {
      var pool = 'abcdefghijklmnopqrstuvwxyz';
      if (index < 26) return pool[index];
      pool = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      if (index < 52) return pool[index - 26];
      var base = 52;
      var offset = index - base;
      var prefix = ['_','$','0'][offset % 3];
      var suffix = Math.floor(offset / 3);
      return prefix + suffix;
    }

    function writeVarLen(arr, val) {
      if (val < 128) { arr.push(val & 0xFF); return 1; }
      if (val < 16384) { arr.push((val >> 7) | 0x80); arr.push(val & 0x7F); return 2; }
      if (val < 2097152) { arr.push((val >> 14) | 0x80); arr.push(((val >> 7) & 0x7F) | 0x80); arr.push(val & 0x7F); return 3; }
      arr.push((val >> 28) | 0x80); arr.push(((val >> 21) & 0x7F) | 0x80);
      arr.push(((val >> 14) & 0x7F) | 0x80); arr.push(((val >> 7) & 0x7F) | 0x80); arr.push(val & 0x7F);
      return 5;
    }

    function readVarLen(arr, pos) {
      var val = 0; var shift = 0; var bytes = 0;
      while (pos + bytes < arr.length && bytes < 5) {
        var b = arr[pos + bytes]; bytes++;
        val |= (b & 0x7F) << shift;
        if ((b & 0x80) === 0) break;
        shift += 7;
      }
      return { value: val >>> 0, bytes: bytes };
    }

    function stripComments(source) {
      var out = '';
      var i = 0;
      while (i < source.length) {
        if (source[i] === '/' && source[i + 1] === '/') {
          while (i < source.length && source[i] !== '\n') i++;
          if (i < source.length) i++;
          continue;
        }
        if (source[i] === '/' && source[i + 1] === '*') {
          i += 2;
          while (i < source.length - 1 && !(source[i] === '*' && source[i + 1] === '/')) i++;
          i += 2;
          continue;
        }
        if (source[i] === '"' || source[i] === "'" || source[i] === '`') {
          var quote = source[i];
          out += quote; i++;
          while (i < source.length) {
            if (source[i] === '\\') { out += source[i] + source[i + 1]; i += 2; continue; }
            if (source[i] === quote) { out += quote; i++; break; }
            out += source[i]; i++;
          }
          continue;
        }
        out += source[i]; i++;
      }
      return out;
    }

    function compressWhitespace(source) {
      var out = '';
      var inString = false;
      var stringChar = '';
      var lastWasSpace = false;
      for (var i = 0; i < source.length; i++) {
        var c = source[i];
        if (c === '"' || c === "'" || c === '`') {
          if (!inString) { inString = true; stringChar = c; out += c; continue; }
          if (c === stringChar) { inString = false; out += c; continue; }
          out += c; continue;
        }
        if (inString) { out += c; continue; }
        if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
          if (!lastWasSpace) { out += ' '; lastWasSpace = true; }
          continue;
        }
        lastWasSpace = false;
        out += c;
      }
      return out.trim();
    }

    function compactTokens(source, globalPool) {
      var tokens;
      try { tokens = lexerModule.tokenize(source); } catch (e) {
        return { source: source, map: {}, renamed: 0, origSize: source.length, compSize: source.length };
      }
      var freq = Object.create(null);
      var ordered = [];
      for (var i = 0; i < tokens.length; i++) {
        var tok = tokens[i];
        if (tok.type === lexerModule.T.IDENT && !isReserved(tok.value)) {
          if (!freq[tok.value]) { freq[tok.value] = 0; ordered.push(tok.value); }
          freq[tok.value]++;
        }
      }
      ordered.sort(function (a, b) { return freq[b] - freq[a] || a.length - b.length; });
      var identMap = Object.create(null);
      var reverseMap = Object.create(null);
      var nextIdx = (globalPool && globalPool.nextIdx) ? globalPool.nextIdx : 0;
      for (var i = 0; i < ordered.length; i++) {
        var code = charCode(nextIdx++);
        while (isReserved(code) || reverseMap[code]) code = charCode(nextIdx++);
        identMap[ordered[i]] = code;
        reverseMap[code] = ordered[i];
      }
      if (globalPool) globalPool.nextIdx = nextIdx;
      var output = '';
      for (var i = 0; i < tokens.length; i++) {
        var t = tokens[i];
        if (t.type === lexerModule.T.IDENT && identMap[t.value]) {
          output += identMap[t.value];
        } else if (t.value !== null && t.value !== undefined) {
          output += t.value;
        }
      }
      return { source: output, map: reverseMap, renamed: ordered.length, origSize: source.length, compSize: output.length };
    }

    function buildStringPool(sources) {
      var pool = [];
      var poolMap = Object.create(null);
      var strRe = /'[^'\\]*(?:\\.[^'\\]*)*'|"[^"\\]*(?:\\.[^"\\]*)*"/g;
      var freq = Object.create(null);
      var names = Object.keys(sources);
      for (var i = 0; i < names.length; i++) {
        var text = sources[names[i]];
        var match;
        strRe.lastIndex = 0;
        while ((match = strRe.exec(text)) !== null) {
          var s = match[0];
          if (s.length >= 8) freq[s] = (freq[s] || 0) + 1;
        }
      }
      var safePatterns = ['"use strict"','GlassHouse.require(','GlassHouse.define(','Object.create(null)','performance.now()','Object.keys('];
      for (var i = 0; i < safePatterns.length; i++) {
        var p = safePatterns[i];
        var count = 0;
        for (var j = 0; j < names.length; j++) {
          var src = sources[names[j]];
          var idx = 0;
          while ((idx = src.indexOf(p, idx)) !== -1) { count++; idx += p.length; }
        }
        if (count >= 2) freq[p] = count;
      }
      var patterns = [];
      var pKeys = Object.keys(freq);
      for (var i = 0; i < pKeys.length; i++) {
        if (freq[pKeys[i]] >= 2) patterns.push({ pattern: pKeys[i], count: freq[pKeys[i]], saving: (freq[pKeys[i]] - 1) * (pKeys[i].length - 2) });
      }
      patterns.sort(function (a, b) { return b.saving - a.saving; });
      var taken = patterns.slice(0, 200);
      for (var i = 0; i < taken.length; i++) { pool.push(taken[i].pattern); poolMap[taken[i].pattern] = i; }
      return { pool: pool, map: poolMap };
    }

    function applyStringPool(source, pool, poolMap) {
      var entries = [];
      var pKeys = Object.keys(poolMap);
      for (var i = 0; i < pKeys.length; i++) { entries.push({ pattern: pKeys[i], idx: poolMap[pKeys[i]] }); }
      entries.sort(function (a, b) { return b.pattern.length - a.pattern.length; });
      var result = source;
      for (var i = 0; i < entries.length; i++) {
        var e = entries[i];
        var escaped = e.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        var re = new RegExp('(^|[^"\'`])(' + escaped + ')', 'g');
        result = result.replace(re, function (m, prefix) { return prefix + '\x01' + e.idx + '\x02'; });
      }
      return result;
    }

    function expandStringPool(source, pool) {
      return source.replace(/\x01(\d+)\x02/g, function (_, idx) { var i = parseInt(idx, 10); return pool[i] !== undefined ? pool[i] : ('\x01' + idx + '\x02'); });
    }

    function indexBlocks(compactedSources) {
      var blockData = [];
      var nextId = 0;
      var names = Object.keys(compactedSources);
      for (var i = 0; i < names.length; i++) {
        var code = charCode(nextId++);
        blockData.push({ id: code, name: names[i], source: compactedSources[names[i]] });
      }
      return { blocks: blockData, count: names.length };
    }

    function binaryEncode(bundle) {
      var out = [];
      out.push(0x47); out.push(0x48); out.push(0x43); out.push(0x32);
      out.push(2);
      writeVarLen(out, bundle.blocks.length);
      writeVarLen(out, bundle.stringPool.length);
      for (var i = 0; i < bundle.stringPool.length; i++) {
        var s = bundle.stringPool[i];
        writeVarLen(out, s.length);
        for (var j = 0; j < s.length; j++) out.push(s.charCodeAt(j) & 0xFF);
      }
      for (var i = 0; i < bundle.blocks.length; i++) {
        var b = bundle.blocks[i];
        out.push(b.id.charCodeAt(0) || 0);
        writeVarLen(out, b.name.length);
        for (var j = 0; j < b.name.length; j++) out.push(b.name.charCodeAt(j) & 0xFF);
        writeVarLen(out, b.source.length);
      }
      for (var i = 0; i < bundle.blocks.length; i++) {
        var src = bundle.blocks[i].source;
        for (var j = 0; j < src.length; j++) out.push(src.charCodeAt(j) & 0xFF);
      }
      var sum1 = 0; var sum2 = 0;
      for (var i = 0; i < out.length; i++) { sum1 = (sum1 + out[i]) % 255; sum2 = (sum2 + sum1) % 255; }
      out.push(sum1); out.push(sum2);
      return new Uint8Array(out);
    }

    function toBase64(buffer) { var b = ''; for (var i = 0; i < buffer.length; i++) b += String.fromCharCode(buffer[i]); return btoa(b); }

    function compactAll(sources) {
      var t0 = performance.now();
      var globalPool = { nextIdx: 0 };
      var cleaned = Object.create(null);
      var names = Object.keys(sources);
      for (var i = 0; i < names.length; i++) {
        var s = sources[names[i]];
        s = stripComments(s);
        s = compressWhitespace(s);
        cleaned[names[i]] = s;
      }
      var compacted = Object.create(null);
      var allMaps = Object.create(null);
      var totalComp = 0;
      var totalRenamed = 0;
      for (var i = 0; i < names.length; i++) {
        var result = compactTokens(cleaned[names[i]], globalPool);
        compacted[names[i]] = result.source;
        Object.assign(allMaps, result.map);
        totalComp += result.compSize;
        totalRenamed += result.renamed;
      }
      var poolResult = buildStringPool(compacted);
      var pooled = Object.create(null);
      for (var i = 0; i < names.length; i++) {
        pooled[names[i]] = applyStringPool(compacted[names[i]], poolResult.pool, poolResult.map);
      }
      var indexed = indexBlocks(pooled);
      var assembly = { blocks: indexed.blocks, stringPool: poolResult.pool, originalSize: 0, compactedSize: 0 };
      var binary = binaryEncode(assembly);
      var b64 = toBase64(binary);
      var totalOrig = 0;
      for (var i = 0; i < names.length; i++) totalOrig += sources[names[i]].length;
      return {
        binary: binary, binaryBase64: b64, binarySize: binary.length,
        originalSize: totalOrig, tokenCompactedSize: totalComp,
        totalRenamed: totalRenamed, poolEntries: poolResult.pool.length,
        reduction: totalOrig > 0 ? parseFloat(((1 - (binary.length / totalOrig)) * 100).toFixed(1)) : 0,
        identMap: allMaps, time: parseFloat((performance.now() - t0).toFixed(2))
      };
    }

    var compactor = { compactAll: compactAll, binaryEncode: binaryEncode, toBase64: toBase64, compactTokens: compactTokens, stripComments: stripComments, compressWhitespace: compressWhitespace, buildStringPool: buildStringPool, applyStringPool: applyStringPool, expandStringPool: expandStringPool, isReserved: isReserved };
    return compactor;
  });
})();
