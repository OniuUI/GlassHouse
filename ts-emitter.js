(function () {
  'use strict';

  GlassHouse.define('ts-emitter', [], function () {

    function emit(node, indent) {
      indent = indent || 0;
      if (!node) return '';

      var handler = emitters[node.type];
      if (handler) return handler(node, indent);

      return '/* unhandled: ' + node.type + ' */';
    }

    function emitList(nodes, indent, separator) {
      if (!nodes) return '';
      separator = separator || '\n';
      var out = [];
      for (var i = 0; i < nodes.length; i++) {
        out.push(emit(nodes[i], indent));
      }
      return out.join(separator);
    }

    function indentStr(n) {
      var s = '';
      for (var i = 0; i < n; i++) s += '  ';
      return s;
    }

    function stripTypeAnnotation(node) {
      return '';
    }

    var emitters = {

      Program: function (node, indent) {
        var out = emitList(node.body, indent);
        return out;
      },

      ExpressionStatement: function (node, indent) {
        return indentStr(indent) + emit(node.expression, indent) + ';';
      },

      VariableDeclaration: function (node, indent) {
        var parts = [];
        for (var i = 0; i < node.declarations.length; i++) {
          var d = node.declarations[i];
          var decl = '';
          if (d.id && d.id.name) {
            decl += d.id.name;
          }
          if (d.id && d.id.typeAnnotation) {
            decl += stripTypeAnnotation(d.id.typeAnnotation);
          }
          if (d.init) {
            decl += ' = ' + emit(d.init, indent);
          }
          parts.push(decl);
        }
        return indentStr(indent) + node.kind + ' ' + parts.join(', ') + ';';
      },

      FunctionDeclaration: function (node, indent) {
        var out = indentStr(indent);
        if (node.async) out += 'async ';
        out += 'function';
        if (node.id) out += ' ' + (node.generator ? '* ' : '') + emit(node.id, indent);
        out += '(';
        if (node.params) {
          out += node.params.map(function (p) { return emit(p, indent); }).join(', ');
        }
        out += ')';
        if (node.returnType) out += stripTypeAnnotation(node.returnType);
        out += ' ';
        out += emit(node.body, indent);
        return out;
      },

      FunctionExpression: function (node, indent) {
        var out = 'function';
        if (node.id) out += ' ' + emit(node.id, indent);
        out += '(';
        if (node.params) {
          out += node.params.map(function (p) { return emit(p, indent); }).join(', ');
        }
        out += ')';
        if (node.returnType) out += stripTypeAnnotation(node.returnType);
        out += ' ' + emit(node.body, indent);
        return out;
      },

      ArrowFunctionExpression: function (node, indent) {
        var out = '';
        if (node.params.length === 1 && !node.params[0].typeAnnotation) {
          out += emit(node.params[0], indent);
        } else {
          out += '(' + node.params.map(function (p) { return emit(p, indent); }).join(', ') + ')';
        }
        out += ' => ';
        if (node.body.type === 'BlockStatement') {
          out += emit(node.body, indent);
        } else {
          out += emit(node.body, indent);
        }
        return out;
      },

      BlockStatement: function (node, indent) {
        var body = node.body;
        if (!body || body.length === 0) return '{}';
        var out = '{\n';
        for (var i = 0; i < body.length; i++) {
          out += emit(body[i], indent + 1) + '\n';
        }
        out += indentStr(indent) + '}';
        return out;
      },

      ReturnStatement: function (node, indent) {
        var arg = node.argument ? ' ' + emit(node.argument, indent) : '';
        return indentStr(indent) + 'return' + arg + ';';
      },

      IfStatement: function (node, indent) {
        var out = indentStr(indent) + 'if (' + emit(node.test, indent) + ') ';
        out += emit(node.consequent, indent);
        if (node.alternate) {
          if (node.consequent.type === 'BlockStatement') out += ' ';
          out += 'else ' + emit(node.alternate, indent);
        }
        return out;
      },

      ForStatement: function (node, indent) {
        var init = node.init ? emit(node.init, indent).replace(/;$/, '') : '';
        var test = node.test ? emit(node.test, indent) : '';
        var update = node.update ? emit(node.update, indent) : '';
        return indentStr(indent) + 'for (' + init + '; ' + test + '; ' + update + ') ' + emit(node.body, indent);
      },

      ForOfStatement: function (node, indent) {
        return indentStr(indent) + 'for (' + emit(node.left, indent) + ' of ' + emit(node.right, indent) + ') ' + emit(node.body, indent);
      },

      WhileStatement: function (node, indent) {
        return indentStr(indent) + 'while (' + emit(node.test, indent) + ') ' + emit(node.body, indent);
      },

      ThrowStatement: function (node, indent) {
        return indentStr(indent) + 'throw ' + emit(node.argument, indent) + ';';
      },

      TryStatement: function (node, indent) {
        var out = indentStr(indent) + 'try ' + emit(node.block, indent);
        if (node.handler) {
          out += ' catch (' + (node.handler.param ? node.handler.param.name : '') + ') ';
          out += emit(node.handler.body, indent);
        }
        if (node.finalizer) {
          out += ' finally ' + emit(node.finalizer, indent);
        }
        return out;
      },

      ClassDeclaration: function (node, indent) {
        var out = indentStr(indent) + 'class ' + (node.id ? node.id.name : '');
        if (node.superClass) {
          out += ' extends ' + emit(node.superClass, indent);
        }
        out += ' {\n';
        if (node.body) {
          for (var i = 0; i < node.body.length; i++) {
            var m = node.body[i];
            if (m.type === 'PropertyDefinition') {
              out += indentStr(indent + 1);
              if (m.modifiers) out += m.modifiers.filter(function (x) { return x !== 'public' && x !== 'abstract'; }).join(' ') + ' ';
              out += (m.key ? (m.key.name || m.key.value) : '');
              if (m.value) out += ' = ' + emit(m.value, indent + 1);
              out += ';\n';
            } else {
              out += emit(m, indent + 1) + '\n';
            }
          }
        }
        out += indentStr(indent) + '}';
        return out;
      },

      BinaryExpression: function (node, indent) {
        return emit(node.left, indent) + ' ' + node.operator + ' ' + emit(node.right, indent);
      },

      UnaryExpression: function (node, indent) {
        if (node.prefix) return node.operator + emit(node.argument, indent);
        return emit(node.argument, indent) + node.operator;
      },

      ConditionalExpression: function (node, indent) {
        return emit(node.test, indent) + ' ? ' + emit(node.consequent, indent) + ' : ' + emit(node.alternate, indent);
      },

      AssignmentExpression: function (node, indent) {
        return emit(node.left, indent) + ' ' + node.operator + ' ' + emit(node.right, indent);
      },

      CallExpression: function (node, indent) {
        return emit(node.callee, indent) + '(' + node.arguments.map(function (a) { return emit(a, indent); }).join(', ') + ')';
      },

      MemberExpression: function (node, indent) {
        var obj = emit(node.object, indent);
        if (node.computed) return obj + '[' + emit(node.property, indent) + ']';
        if (node.optional) return obj + '?.' + (node.property ? node.property.name : '');
        return obj + '.' + (node.property ? node.property.name : '');
      },

      Identifier: function (node) {
        return node.name;
      },

      Literal: function (node) {
        if (typeof node.value === 'string') return JSON.stringify(node.value);
        if (node.value === null) return 'null';
        return String(node.value);
      },

      ThisExpression: function () { return 'this'; },

      ObjectExpression: function (node, indent) {
        if (!node.properties || node.properties.length === 0) return '{}';
        var out = '{\n';
        for (var i = 0; i < node.properties.length; i++) {
          var p = node.properties[i];
          if (p.type === 'SpreadElement') {
            out += indentStr(indent + 1) + '...' + emit(p.argument, indent + 1);
          } else if (p.shorthand) {
            out += indentStr(indent + 1) + emit(p.key, indent);
          } else if (p.method) {
            out += indentStr(indent + 1) + emit(p.key, indent) + '(' +
              p.value.params.map(function (pp) { return pp.name; }).join(', ') + ') ' +
              emit(p.value.body, indent + 1);
          } else {
            out += indentStr(indent + 1) + emit(p.key, indent) + ': ' + emit(p.value, indent);
          }
          if (i < node.properties.length - 1) out += ',';
          out += '\n';
        }
        out += indentStr(indent) + '}';
        return out;
      },

      Property: function (node, indent) {
        return emit(node.value, indent);
      },

      SpreadElement: function (node, indent) {
        return '...' + emit(node.argument, indent);
      },

      ArrayExpression: function (node, indent) {
        return '[' + node.elements.map(function (e) { return e ? emit(e, indent) : ''; }).join(', ') + ']';
      },

      NewExpression: function (node, indent) {
        return 'new ' + emit(node.callee, indent) + '(' + node.arguments.map(function (a) { return emit(a, indent); }).join(', ') + ')';
      },

      TemplateLiteral: function (node, indent) {
        var out = '`';
        for (var i = 0; i < node.quasis.length; i++) {
          out += node.quasis[i].value.raw || node.quasis[i].value.cooked || '';
          if (i < node.expressions.length) {
            out += '${' + emit(node.expressions[i], indent) + '}';
          }
        }
        out += '`';
        return out;
      },

      TypeAssertion: function (node, indent) {
        return emit(node.expression, indent);
      },

      ExportNamedDeclaration: function (node, indent) {
        if (node.declaration && node.declaration.type !== 'InterfaceDeclaration' &&
            node.declaration.type !== 'TypeAliasDeclaration') {
          return 'export ' + emit(node.declaration, indent);
        }
        return '';
      },

      ExportDefaultDeclaration: function (node, indent) {
        var decl = emit(node.declaration, indent);
        if (decl) return 'export default ' + decl;
        return '';
      },

      ImportDeclaration: function (node, indent) {
        var spec = '';
        var defaults = node.specifiers.filter(function (s) { return s.type === 'ImportDefaultSpecifier'; });
        var named = node.specifiers.filter(function (s) { return s.type === 'ImportSpecifier'; });

        if (defaults.length > 0) spec += defaults[0].local.name;
        if (named.length > 0) {
          spec += (defaults.length > 0 ? ', ' : '') + '{ ' + named.map(function (s) { return s.local.name; }).join(', ') + ' }';
        }
        return indentStr(indent) + 'import ' + (spec || '') + ' from ' + JSON.stringify(node.source.value) + ';';
      },

      InterfaceDeclaration: function () { return ''; },
      TypeAliasDeclaration: function () { return ''; },
      EnumDeclaration: function (node, indent) {
        var out = indentStr(indent) + 'var ' + node.id.name + ';\n';
        out += indentStr(indent) + '(function (' + node.id.name + ') {\n';
        for (var i = 0; i < node.members.length; i++) {
          var m = node.members[i];
          var val = m.initializer ? emit(m.initializer, indent + 1) : i;
          out += indentStr(indent + 1) + node.id.name + '[' + node.id.name + '["' + m.id.name + '"] = ' + val + '] = "' + m.id.name + '";\n';
        }
        out += indentStr(indent) + '})(' + node.id.name + ' || (' + node.id.name + ' = {}));';
        return out;
      },

      // --- JSX Emitters ---

      JSXElement: function (node, indent) {
        var tagExpr = emitJSXTag(node.tag, indent);
        var attrsExpr = emitJSXAttrs(node.attrs, indent);
        var children = node.children || [];

        if (children.length === 0) {
          return 'v(' + tagExpr + ', ' + attrsExpr + ')';
        }

        var parts = ['v(' + tagExpr + ', ' + attrsExpr];
        for (var i = 0; i < children.length; i++) {
          var childCode = emit(children[i], indent);
          if (childCode) {
            parts.push(', ' + childCode);
          }
        }
        parts.push(')');
        return parts.join('');
      },

      JSXText: function (node) {
        return JSON.stringify(node.value);
      },

      JSXExpression: function (node) {
        return emit(node.expression, 0);
      },
    };

    // Emit the tag portion of a JSX element
    function emitJSXTag(tag, indent) {
      if (!tag) return "''";
      if (tag.type === 'Identifier') return JSON.stringify(tag.name);
      if (tag.type === 'MemberExpression') {
        return emit(tag, indent);
      }
      return JSON.stringify(String(tag));
    }

    // Emit the attrs portion of a JSX element
    function emitJSXAttrs(attrs, indent) {
      if (!attrs || attrs.length === 0) return '{}';

      var props = [];
      for (var i = 0; i < attrs.length; i++) {
        var attr = attrs[i];

        if (attr.type === 'JSXSpreadAttribute') {
          // Spread attributes: ...{expression}
          // For now, emit Object.assign() call in the runtime
          // NYI in pure v() calls — emit a helper call comment
          props.push('/* JSXSpreadAttribute not directly supported by v() */');
          continue;
        }

        if (attr.type === 'JSXAttribute') {
          var name = attr.name;
          var value = attr.value;

          if (!value) {
            // Boolean attribute
            props.push(JSON.stringify(name) + ': true');
          } else if (value.type === 'Literal') {
            if (typeof value.value === 'string') {
              props.push(JSON.stringify(name) + ': ' + JSON.stringify(value.value));
            } else {
              props.push(JSON.stringify(name) + ': ' + String(value.value));
            }
          } else {
            // Expression value
            props.push(JSON.stringify(name) + ': ' + emit(value, indent));
          }
        }
      }

      return '{ ' + props.join(', ') + ' }';
    }

    var _hasJSX = false;

    function emitJS(ast) {
      _hasJSX = false;
      var code = emit(ast, 0);
      if (_hasJSX) {
        code = "var v = GlassHouse.require('vnode').v;\n" + code;
      }
      return code;
    }

    // Override JSXElement emitter to flag JSX usage
    var _origJSXElement = emitters.JSXElement;
    emitters.JSXElement = function (node, indent) {
      _hasJSX = true;
      return _origJSXElement(node, indent);
    };

    var emitter = {
      emit: emitJS
    };

    return emitter;
  });
})();
