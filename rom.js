(function () {
  'use strict';

  GlassHouse.define('rom', [], function () {

    var MAGIC = [0x47, 0x48, 0x52, 0x4F]; // 'GHRO'
    var VERSION = 1;

    function stringToBytes(str) {
      var bytes = [];
      for (var i = 0; i < str.length; i++) {
        var code = str.charCodeAt(i);
        if (code < 0x80) {
          bytes.push(code);
        } else if (code < 0x800) {
          bytes.push(0xC0 | (code >> 6));
          bytes.push(0x80 | (code & 0x3F));
        } else {
          bytes.push(0xE0 | (code >> 12));
          bytes.push(0x80 | ((code >> 6) & 0x3F));
          bytes.push(0x80 | (code & 0x3F));
        }
      }
      return bytes;
    }

    function bytesToString(bytes, offset, length) {
      var result = '';
      var end = offset + length;
      for (var i = offset; i < end; i++) {
        var b = bytes[i];
        if (b < 0x80) {
          result += String.fromCharCode(b);
        } else if (b < 0xE0) {
          result += String.fromCharCode(((b & 0x1F) << 6) | (bytes[++i] & 0x3F));
        } else {
          result += String.fromCharCode(((b & 0x0F) << 12) | ((bytes[++i] & 0x3F) << 6) | (bytes[++i] & 0x3F));
        }
      }
      return result;
    }

    function write16(arr, pos, value) {
      arr[pos] = (value >> 8) & 0xFF;
      arr[pos + 1] = value & 0xFF;
    }

    function write32(arr, pos, value) {
      arr[pos] = (value >> 24) & 0xFF;
      arr[pos + 1] = (value >> 16) & 0xFF;
      arr[pos + 2] = (value >> 8) & 0xFF;
      arr[pos + 3] = value & 0xFF;
    }

    function read16(arr, pos) {
      return ((arr[pos] << 8) | arr[pos + 1]) >>> 0;
    }

    function read32(arr, pos) {
      return ((arr[pos] << 24) | (arr[pos + 1] << 16) | (arr[pos + 2] << 8) | arr[pos + 3]) >>> 0;
    }

    function estimateSize(identMap) {
      var keys = Object.keys(identMap);
      var total = 10; // header
      for (var i = 0; i < keys.length; i++) {
        var code = keys[i];
        var name = identMap[code];
        total += 4 + stringToBytes(code).length + stringToBytes(name).length;
      }
      return total;
    }

    function build(identMap) {
      var keys = Object.keys(identMap);
      var entries = [];

      for (var i = 0; i < keys.length; i++) {
        entries.push({
          byteCode: keys[i],
          originalName: identMap[keys[i]]
        });
      }

      var size = estimateSize(identMap);
      var buffer = new Uint8Array(size);
      var pos = 0;

      for (var i = 0; i < MAGIC.length; i++) buffer[pos++] = MAGIC[i];

      write16(buffer, pos, VERSION); pos += 2;
      write32(buffer, pos, entries.length); pos += 4;

      for (var i = 0; i < entries.length; i++) {
        var codeBytes = stringToBytes(entries[i].byteCode);
        var nameBytes = stringToBytes(entries[i].originalName);

        write16(buffer, pos, codeBytes.length); pos += 2;
        for (var j = 0; j < codeBytes.length; j++) buffer[pos++] = codeBytes[j];

        write16(buffer, pos, nameBytes.length); pos += 2;
        for (var j = 0; j < nameBytes.length; j++) buffer[pos++] = nameBytes[j];
      }

      return buffer.slice(0, pos);
    }

    function lookup(romBuffer, byteCode) {
      if (romBuffer.length < 10) return null;

      for (var i = 0; i < MAGIC.length; i++) {
        if (romBuffer[i] !== MAGIC[i]) return null;
      }

      var offset = 10;
      var entryCount = read32(romBuffer, 6);

      for (var i = 0; i < entryCount; i++) {
        var codeLen = read16(romBuffer, offset); offset += 2;
        var code = bytesToString(romBuffer, offset, codeLen); offset += codeLen;
        var nameLen = read16(romBuffer, offset); offset += 2;
        var name = bytesToString(romBuffer, offset, nameLen); offset += nameLen;

        if (code === byteCode) return name;
      }

      return null;
    }

    function decode(romBuffer) {
      if (romBuffer.length < 10) return Object.create(null);

      for (var i = 0; i < MAGIC.length; i++) {
        if (romBuffer[i] !== MAGIC[i]) return null;
      }

      var map = Object.create(null);
      var entryCount = read32(romBuffer, 6);
      var offset = 10;

      for (var i = 0; i < entryCount; i++) {
        var codeLen = read16(romBuffer, offset); offset += 2;
        var code = bytesToString(romBuffer, offset, codeLen); offset += codeLen;
        var nameLen = read16(romBuffer, offset); offset += 2;
        var name = bytesToString(romBuffer, offset, nameLen); offset += nameLen;

        map[code] = name;
      }

      return map;
    }

    function toBase64(buffer) {
      var binary = '';
      for (var i = 0; i < buffer.length; i++) {
        binary += String.fromCharCode(buffer[i]);
      }
      return btoa(binary);
    }

    function fromBase64(b64) {
      var binary = atob(b64);
      var buffer = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i++) {
        buffer[i] = binary.charCodeAt(i);
      }
      return buffer;
    }

    function toEmbeddedLoader(romBuffer) {
      var b64 = toBase64(romBuffer);
      return [
        '(function(){',
        'var _ghRom="'+b64+'";',
        'var _rom=null;window.__ghRom=function(c){',
        'if(!_rom){var b=atob(_ghRom);var a=new Uint8Array(b.length);',
        'for(var i=0;i<b.length;i++)a[i]=b.charCodeAt(i);_rom=a;}',
        'return _rom;}',
        '})();'
      ].join('');
    }

    var rom = {
      build: build,
      lookup: lookup,
      decode: decode,
      toBase64: toBase64,
      fromBase64: fromBase64,
      toEmbeddedLoader: toEmbeddedLoader,
      estimateSize: estimateSize,
      MAGIC: MAGIC,
      VERSION: VERSION
    };

    return rom;
  });
})();
