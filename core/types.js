(function () {
  'use strict';

  GlassHouse.define('types', [], function () {

    function Type(kind, check, name, meta) {
      this.kind = kind;
      this.check = check;
      this.name = name || kind;
      this.meta = meta || null;
    }

    Type.prototype.toString = function () {
      return 'Type<' + this.name + '>';
    };

    function create(kind, check, name, meta) {
      return new Type(kind, check, name, meta);
    }

    function label(t, suffix) {
      if (t.name) return t.name;
      if (t.kind === 'array') return label(t.meta, 'suffix') + '[]';
      if (t.kind === 'shape') return '{' + Object.keys(t.meta).map(function (k) {
        return k + ': ' + label(t.meta[k], 'suffix');
      }).join(', ') + '}';
      if (t.kind === 'union') return t.meta.map(function (u) {
        return label(u, 'suffix');
      }).join(' | ');
      if (t.kind === 'literal') return JSON.stringify(t.meta);
      return t.kind;
    }

    // --- Primitives ---

    var Primitives = {
      string:   create('string',   function (v) { return typeof v === 'string'; },      'string'),
      number:   create('number',   function (v) { return typeof v === 'number' && !isNaN(v); }, 'number'),
      boolean:  create('boolean',  function (v) { return typeof v === 'boolean'; },     'boolean'),
      bigint:   create('bigint',   function (v) { return typeof v === 'bigint'; },      'bigint'),
      symbol:   create('symbol',   function (v) { return typeof v === 'symbol'; },      'symbol'),
      fn:       create('function', function (v) { return typeof v === 'function'; },     'function'),
      any:      create('any',      function ()  { return true; },                       'any'),
      unknown:  create('unknown',  function ()  { return true; },                       'unknown'),
      never:    create('never',    function ()  { return false; },                      'never'),
      null_:    create('null',     function (v) { return v === null; },                 'null'),
      void_:    create('void',     function (v) { return v === undefined; },            'void'),
    };

    // --- Parameterized ---

    function literal(val) {
      return create('literal', function (v) { return v === val; }, JSON.stringify(val), val);
    }

    function oneOf(values) {
      var set = {};
      for (var i = 0; i < values.length; i++) set[values[i]] = true;
      return create('oneOf', function (v) { return !!set[v]; },
        values.map(JSON.stringify).join(' | '), values);
    }

    function instanceOf(Constructor) {
      return create('instanceOf', function (v) { return v instanceof Constructor; },
        Constructor.name || 'Instance', Constructor);
    }

    // --- Compounds ---

    function arrayOf(itemType) {
      return create('array', function (v) {
        if (!Array.isArray(v)) return false;
        for (var i = 0; i < v.length; i++) {
          if (!itemType.check(v[i])) return false;
        }
        return true;
      }, 'Array<' + itemType.name + '>', itemType);
    }

    function tuple(types) {
      return create('tuple', function (v) {
        if (!Array.isArray(v)) return false;
        if (v.length !== types.length) return false;
        for (var i = 0; i < types.length; i++) {
          if (!types[i].check(v[i])) return false;
        }
        return true;
      }, '[' + types.map(function (t) { return t.name; }).join(', ') + ']', types);
    }

    function shape(schema) {
      var keys = Object.keys(schema);
      return create('shape', function (v) {
        if (v === null || v === undefined) return false;
        if (typeof v !== 'object') return false;
        for (var i = 0; i < keys.length; i++) {
          if (!schema[keys[i]].check(v[keys[i]])) return false;
        }
        return true;
      }, '{ ' + keys.map(function (k) { return k + ': ' + schema[k].name; }).join(', ') + ' }', schema);
    }

    function record(keyType, valueType) {
      return create('record', function (v) {
        if (v === null || v === undefined) return false;
        if (typeof v !== 'object') return false;
        var ks = Object.keys(v);
        for (var i = 0; i < ks.length; i++) {
          if (!keyType.check(ks[i])) return false;
          if (!valueType.check(v[ks[i]])) return false;
        }
        return true;
      }, 'Record<' + keyType.name + ', ' + valueType.name + '>', { key: keyType, value: valueType });
    }

    // --- Union / Intersection ---

    function union(types) {
      return create('union', function (v) {
        for (var i = 0; i < types.length; i++) {
          if (types[i].check(v)) return true;
        }
        return false;
      }, types.map(function (t) { return t.name; }).join(' | '), types);
    }

    function intersection(types) {
      return create('intersection', function (v) {
        for (var i = 0; i < types.length; i++) {
          if (!types[i].check(v)) return false;
        }
        return true;
      }, types.map(function (t) { return t.name; }).join(' & '), types);
    }

    // --- Utility types ---

    function optional(t) {
      var opt = create('optional', function (v) {
        return v === undefined || v === null || t.check(v);
      }, t.name + '?', t);
      return opt;
    }

    function nullable(t) {
      return union([t, Primitives.null_]);
    }

    function partial(shapeType) {
      if (shapeType.kind !== 'shape') {
        throw new Error('partial() requires a shape type, got ' + shapeType.kind);
      }
      var schema = shapeType.meta;
      var partialSchema = {};
      var ks = Object.keys(schema);
      for (var i = 0; i < ks.length; i++) {
        partialSchema[ks[i]] = optional(schema[ks[i]]);
      }
      return shape(partialSchema);
    }

    function required(shapeType) {
      if (shapeType.kind !== 'shape') {
        throw new Error('required() requires a shape type, got ' + shapeType.kind);
      }
      return shape(shapeType.meta);
    }

    function pick(shapeType, pickedKeys) {
      if (shapeType.kind !== 'shape') {
        throw new Error('pick() requires a shape type, got ' + shapeType.kind);
      }
      var schema = {};
      for (var i = 0; i < pickedKeys.length; i++) {
        var k = pickedKeys[i];
        if (shapeType.meta[k]) schema[k] = shapeType.meta[k];
      }
      return shape(schema);
    }

    function omit(shapeType, omittedKeys) {
      if (shapeType.kind !== 'shape') {
        throw new Error('omit() requires a shape type, got ' + shapeType.kind);
      }
      var omitSet = {};
      for (var i = 0; i < omittedKeys.length; i++) omitSet[omittedKeys[i]] = true;
      var schema = {};
      var ks = Object.keys(shapeType.meta);
      for (var i = 0; i < ks.length; i++) {
        if (!omitSet[ks[i]]) schema[ks[i]] = shapeType.meta[ks[i]];
      }
      return shape(schema);
    }

    // --- CSS types ---

    var HEX_RE = /^#[0-9a-fA-F]{3,8}$/;
    var RGB_RE = /^(rgb|rgba|hsl|hsla|hwb|lab|lch|oklch|oklab|color)\s*\(/;
    var COLOR_NAMES = {
      transparent:1, currentColor:1, inherit:1, initial:1, unset:1, revert:1,
      black:1, white:1, red:1, green:1, blue:1, yellow:1, orange:1, purple:1,
      pink:1, gray:1, grey:1, brown:1, cyan:1, magenta:1, lime:1, navy:1, teal:1,
      aqua:1, maroon:1, olive:1, silver:1, gold:1, coral:1, indigo:1, violet:1,
      turquoise:1, salmon:1, tomato:1, skyblue:1, darkblue:1, lightgray:1
    };

    var CSS = {
      color: create('cssColor', function (v) {
        if (typeof v !== 'string') return false;
        if (HEX_RE.test(v)) return true;
        if (RGB_RE.test(v)) return true;
        return !!COLOR_NAMES[v.toLowerCase()];
      }, 'CSSColor'),

      cssLength: create('cssLength', function (v) {
        return typeof v === 'string' && /^(0|\d+(\.\d+)?(px|rem|em|%|vh|vw|vmin|vmax|ch|ex|cm|mm|in|pt|pc))$/.test(v);
      }, 'CSSLength'),

      cssTime: create('cssTime', function (v) {
        return typeof v === 'string' && /^\d+(\.\d+)?(s|ms)$/.test(v);
      }, 'CSSTime'),

      cssEasing: create('cssEasing', function (v) {
        return typeof v === 'string' && /^(ease|linear|ease-in|ease-out|ease-in-out|step-start|step-end|cubic-bezier\(|steps\()/.test(v);
      }, 'CSSEasing'),

      cssFont: create('cssFont', function (v) {
        return typeof v === 'string' && v.length > 0;
      }, 'CSSFont'),

      elNode: create('elNode', function (v) {
        return v && typeof v === 'object' && v._t === 1 &&
               typeof v.tag === 'string' && typeof v.attr === 'object' &&
               Array.isArray(v.kids);
      }, 'ElNode'),
    };

    // --- Validation ---

    function pathName(parts) {
      if (parts.length === 0) return 'value';
      var s = parts[0];
      for (var i = 1; i < parts.length; i++) {
        if (typeof parts[i] === 'number') {
          s += '[' + parts[i] + ']';
        } else {
          s += '.' + parts[i];
        }
      }
      return s;
    }

    function validateDeep(value, type, path) {
      var errors = [];

      if (!type.check(value)) {

        function explain() {
          if (type.kind === 'shape') {
            if (value === null || value === undefined) {
              errors.push(pathName(path) + ' must be an object, got ' + String(value));
            } else if (typeof value !== 'object') {
              errors.push(pathName(path) + ' must be an object, got ' + typeof value);
            } else {
              var keys = Object.keys(type.meta);
              for (var i = 0; i < keys.length; i++) {
                var k = keys[i];
                var subErrors = validateDeep(value[k], type.meta[k], path.concat(k));
                for (var j = 0; j < subErrors.length; j++) errors.push(subErrors[j]);
              }
            }
          } else if (type.kind === 'array') {
            if (!Array.isArray(value)) {
              errors.push(pathName(path) + ' must be an array, got ' + typeof value);
            } else {
              for (var i = 0; i < value.length; i++) {
                var se = validateDeep(value[i], type.meta, path.concat(i));
                for (var j = 0; j < se.length; j++) errors.push(se[j]);
              }
            }
          } else if (type.kind === 'tuple') {
            if (!Array.isArray(value)) {
              errors.push(pathName(path) + ' must be a tuple array, got ' + typeof value);
            } else {
              for (var i = 0; i < type.meta.length; i++) {
                var te = validateDeep(value[i], type.meta[i], path.concat(i));
                for (var j = 0; j < te.length; j++) errors.push(te[j]);
              }
            }
          } else if (type.kind === 'union') {
            var passed = false;
            for (var i = 0; i < type.meta.length; i++) {
              if (type.meta[i].check(value)) { passed = true; break; }
            }
            if (!passed) {
              errors.push(pathName(path) + ' must be ' + label(type, 'union') + ', got ' + JSON.stringify(value));
            }
          } else if (type.kind === 'literal') {
            errors.push(pathName(path) + ' must be ' + JSON.stringify(type.meta) + ', got ' + JSON.stringify(value));
          } else if (type.kind === 'oneOf') {
            errors.push(pathName(path) + ' must be one of ' + JSON.stringify(type.meta) + ', got ' + JSON.stringify(value));
          } else if (type.kind === 'record') {
            if (value === null || typeof value !== 'object') {
              errors.push(pathName(path) + ' must be an object, got ' + typeof value);
            } else {
              var ks = Object.keys(value);
              for (var i = 0; i < ks.length; i++) {
                if (!type.meta.key.check(ks[i])) {
                  errors.push(pathName(path) + ' key "' + ks[i] + '" must be ' + type.meta.key.name);
                }
                var re = validateDeep(value[ks[i]], type.meta.value, path.concat(ks[i]));
                for (var j = 0; j < re.length; j++) errors.push(re[j]);
              }
            }
          } else {
            errors.push(pathName(path) + ' must be ' + label(type, 'type') + ', got ' + (value === null ? 'null' : typeof value));
          }
        }

        explain();
      }

      return errors;
    }

    function validate(value, type) {
      var errors = validateDeep(value, type, []);
      return { valid: errors.length === 0, errors: errors };
    }

    function assert(value, type, label_) {
      var errors = validateDeep(value, type, []);
      if (errors.length > 0) {
        var prefix = label_ ? '[' + label_ + '] ' : '';
        throw new TypeError(prefix + errors.join('; '));
      }
    }

    function is(value, type) {
      return type.check(value);
    }

    // --- Exports ---

    var types = {
      string:    Primitives.string,
      number:    Primitives.number,
      boolean:   Primitives.boolean,
      bigint:    Primitives.bigint,
      symbol:    Primitives.symbol,
      fn:        Primitives.fn,
      any:       Primitives.any,
      unknown:   Primitives.unknown,
      never:     Primitives.never,
      null_:     Primitives.null_,
      void_:     Primitives.void_,

      literal:      literal,
      oneOf:        oneOf,
      instanceOf:   instanceOf,
      arrayOf:      arrayOf,
      tuple:        tuple,
      shape:        shape,
      record:       record,

      union:        union,
      intersection: intersection,

      optional:     optional,
      nullable:     nullable,
      partial:      partial,
      required:     required,
      pick:         pick,
      omit:         omit,

      color:        CSS.color,
      cssLength:    CSS.cssLength,
      cssTime:      CSS.cssTime,
      cssEasing:    CSS.cssEasing,
      cssFont:      CSS.cssFont,
      elNode:       CSS.elNode,

      validate:     validate,
      assert:       assert,
      is:           is,
    };

    Object.freeze(types);
    Object.freeze(Primitives);
    Object.freeze(CSS);

    return types;
  });
})();
