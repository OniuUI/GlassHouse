(function () {
  'use strict';

  GlassHouse.define('decompressor', [], function () {

    var MAGIC = [0x47, 0x48, 0x43, 0x32]; // GHC2

    function validate(buffer) {
      if (!buffer || buffer.length < 8) return false;
      for (var i = 0; i < 4; i++) if (buffer[i] !== MAGIC[i]) return false;
      // Verify checksum
      var csLen = buffer.length - 2;
      var sum1 = 0; var sum2 = 0;
      for (var i = 0; i < csLen; i++) { sum1 = (sum1 + buffer[i]) % 255; sum2 = (sum2 + sum1) % 255; }
      return sum1 === buffer[csLen] && sum2 === buffer[csLen + 1];
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

    function decode(buffer) {
      if (!validate(buffer)) throw new Error('Invalid or corrupted GHC2 bundle (bad magic or checksum)');

      var pos = 5;
      var bcResult = readVarLen(buffer, pos); pos += bcResult.bytes;
      var blockCount = bcResult.value;

      var pcResult = readVarLen(buffer, pos); pos += pcResult.bytes;
      var poolCount = pcResult.value;

      // String pool
      var pool = [];
      for (var i = 0; i < poolCount; i++) {
        var slResult = readVarLen(buffer, pos); pos += slResult.bytes;
        var s = '';
        for (var j = 0; j < slResult.value; j++) s += String.fromCharCode(buffer[pos + j]);
        pos += slResult.value;
        pool.push(s);
      }

      // Block index
      var blocks = [];
      for (var i = 0; i < blockCount; i++) {
        var id = String.fromCharCode(buffer[pos++]);
        var nlResult = readVarLen(buffer, pos); pos += nlResult.bytes;
        var name = '';
        for (var j = 0; j < nlResult.value; j++) name += String.fromCharCode(buffer[pos + j]);
        pos += nlResult.value;
        var slResult = readVarLen(buffer, pos); pos += slResult.bytes;
        blocks.push({ id: id, name: name, length: slResult.value });
      }

      // Block sources + expand pool refs
      var sources = Object.create(null);
      var csLen = buffer.length - 2;

      for (var i = 0; i < blockCount; i++) {
        var b = blocks[i];
        var src = '';
        for (var j = 0; j < b.length && pos + j < csLen; j++) {
          src += String.fromCharCode(buffer[pos + j]);
        }
        pos += b.length;

        // Expand \x01<N>\x02 → pool[N]
        src = src.replace(/\x01(\d+)\x02/g, function (_, idx) {
          var i = parseInt(idx, 10);
          return pool[i] !== undefined ? pool[i] : ('\x01' + idx + '\x02');
        });

        sources[b.id] = { name: b.name, source: src };
      }

      return { version: 2, blocks: sources, pool: pool, blockCount: blockCount };
    }

    function load(buffer, scopeObj) {
      var decoded = decode(buffer);
      var blockIds = Object.keys(decoded.blocks);
      var loaded = [];
      var failed = [];

      for (var i = 0; i < blockIds.length; i++) {
        var id = blockIds[i];
        var blk = decoded.blocks[id];
        try {
          var fn = new Function(
            'GlassHouse', 'scope',
            '"use strict";\n' + blk.source
          );
          fn(GlassHouse, scopeObj || {});
          loaded.push(blk.name);
        } catch (e) {
          failed.push({ name: blk.name, error: e.message });
          console.warn('[decompressor] Block "' + blk.name + '" failed: ' + e.message);
        }
      }

      return { decoded: decoded, loaded: loaded, failed: failed, success: failed.length === 0 };
    }

    function loadFromBase64(b64, scopeObj) {
      var binary = atob(b64);
      var buffer = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i);
      return load(buffer, scopeObj);
    }

    function toBase64(buffer) {
      var binary = '';
      for (var i = 0; i < buffer.length; i++) binary += String.fromCharCode(buffer[i]);
      return btoa(binary);
    }

    function fromBase64(b64) {
      var binary = atob(b64);
      var buffer = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i);
      return buffer;
    }

    var decompressor = {
      validate: validate,
      decode: decode,
      load: load,
      loadFromBase64: loadFromBase64,
      toBase64: toBase64,
      fromBase64: fromBase64,
      MAGIC: MAGIC
    };

    return decompressor;
  });
})();
