(function () {
  'use strict';

  GlassHouse.define('ts-checker', [], function () {

    var diagnostics = [];

    function reset() { diagnostics = []; }

    function diag(severity, message, node) {
      var d = { severity: severity, message: message, line: node ? (node.loc ? node.loc.start.line : '?') : '?' };
      diagnostics.push(d);
    }

    function typeToString(t) {
      if (!t) return 'any';
      if (t.type === 'TypeReference' && t.typeName) return t.typeName.name;
      if (t.type === 'UnionType') return t.types.map(typeToString).join(' | ');
      if (t.type === 'IntersectionType') return t.types.map(typeToString).join(' & ');
      if (t.type === 'ArrayType') return typeToString(t.elementType) + '[]';
      if (t.type === 'LiteralType') return JSON.stringify(t.literal.value);
      if (t.type === 'FunctionType') return '(...) => ' + typeToString(t.returnType);
      if (t.type === 'ObjectType') return '{ ... }';
      if (t.type === 'TupleType') return '[' + t.elementTypes.map(typeToString).join(', ') + ']';
      return t.type || '?';
    }

    function isTypeCompatible(source, target, typeParams) {
      if (!source || !target) return true;
      if (target.typeName && target.typeName.name === 'any') return true;
      if (source.typeName && source.typeName.name === 'never') return true;

      if (source.typeName && source.typeName.name === 'void' && target.typeName && target.typeName.name === 'void') return true;

      if (source.typeName && target.typeName && source.typeName.name === target.typeName.name) return true;

      if (source.type === 'UnionType') {
        return source.types.every(function (t) { return isTypeCompatible(t, target, typeParams); });
      }

      if (target.type === 'UnionType') {
        return target.types.some(function (t) { return isTypeCompatible(source, t, typeParams); });
      }

      if (source.type === 'LiteralType' && target.type && target.typeName) {
        var tn = target.typeName.name;
        if (tn === 'string' && typeof source.literal.value === 'string') return true;
        if (tn === 'number' && typeof source.literal.value === 'number') return true;
        if (tn === 'boolean' && typeof source.literal.value === 'boolean') return true;
      }

      return false;
    }

    function resolveTypeAlias(typeName, types) {
      if (!types[typeName]) return null;
      var ta = types[typeName];
      if (!ta.typeAnnotation) return null;
      return resolveTypeNode(ta.typeAnnotation, types);
    }

    function resolveTypeNode(typeNode, types) {
      if (!typeNode) return typeNode;
      if (typeNode.type === 'TypeReference' && typeNode.typeName && !typeNode.typeArguments) {
        var resolved = resolveTypeAlias(typeNode.typeName.name, types);
        if (resolved) return resolved;
      }
      if (typeNode.type === 'UnionType') {
        var r = { type: 'UnionType', types: [] };
        for (var i = 0; i < typeNode.types.length; i++) {
          r.types.push(resolveTypeNode(typeNode.types[i], types));
        }
        return r;
      }
      return typeNode;
    }

    function extractTypeMetadata(ast, bindResult) {
      var metadata = {
        interfaces: {},
        types: {},
        functions: {},
        classes: {},
        enums: {}
      };

      var interfacesSep = bindResult.interfaces || {};
      Object.keys(interfacesSep).forEach(function (name) {
        var decl = interfacesSep[name];
        var props = {};
        if (decl.body) {
          decl.body.forEach(function (member) {
            if (member.type === 'PropertySignature' && member.key) {
              var keyName = member.key.name || member.key.value;
              props[keyName] = {
                type: typeToString(member.typeAnnotation),
                optional: !!member.optional,
                rawType: member.typeAnnotation
              };
            }
          });
        }
        metadata.interfaces[name] = {
          extends: (decl.extends || []).map(typeToString),
          properties: props
        };
      });

      var typesSep = bindResult.types || {};
      Object.keys(typesSep).forEach(function (name) {
        var decl = typesSep[name];
        metadata.types[name] = {
          type: typeToString(decl.typeAnnotation),
          hasGenerics: !!(decl.typeParameters && decl.typeParameters.length)
        };
      });

      var funcsSep = bindResult.functions || {};
      Object.keys(funcsSep).forEach(function (name) {
        var decl = funcsSep[name];
        var params = [];
        if (decl.params) {
          decl.params.forEach(function (p) {
            params.push({
              name: p.name || (p.argument && p.argument.name) || '',
              type: p.typeAnnotation ? typeToString(p.typeAnnotation) : 'any',
              optional: !!p.optional
            });
          });
        }
        metadata.functions[name] = {
          params: params,
          returnType: decl.returnType ? typeToString(decl.returnType) : 'void'
        };
      });

      var classesSep = bindResult.classes || {};
      Object.keys(classesSep).forEach(function (name) {
        var decl = classesSep[name];
        metadata.classes[name] = {
          superClass: decl.superClass ? typeToString(decl.superClass) : null,
          implements: (decl.implements || []).map(typeToString)
        };
      });

      var enumsSep = bindResult.enums || {};
      Object.keys(enumsSep).forEach(function (name) {
        var decl = enumsSep[name];
        metadata.enums[name] = {
          members: (decl.members || []).map(function (m) {
            return m.id ? m.id.name : '';
          })
        };
      });

      return metadata;
    }

    function check(ast, bindResult) {
      reset();

      var interfaces = bindResult.interfaces || {};
      var types = bindResult.types || {};
      var classes = bindResult.classes || {};

      Object.keys(classes).forEach(function (className) {
        var cls = classes[className];
        if (!cls.implements) return;

        cls.implements.forEach(function (ifaceNode) {
          var ifaceName = ifaceNode.typeName ? ifaceNode.typeName.name : '';
          var iface = interfaces[ifaceName];
          if (!iface) {
            diag('error', 'Class "' + className + '" implements non-existent interface "' + ifaceName + '"', cls);
            return;
          }

          if (iface.body) {
            var implementedProps = {};
            if (cls.body) {
              cls.body.forEach(function (member) {
                if (member.type === 'PropertyDefinition' && member.key) {
                  var n = member.key.name || member.key.value;
                  implementedProps[n] = member;
                }
              });
            }

            iface.body.forEach(function (ifaceMember) {
              if (ifaceMember.type === 'PropertySignature') {
                var propName = ifaceMember.key ? (ifaceMember.key.name || ifaceMember.key.value) : '';
                if (!implementedProps[propName]) {
                  diag('error', 'Class "' + className + '" missing property "' + propName + '" from interface "' + ifaceName + '"', cls);
                } else {
                  var impl = implementedProps[propName];
                  var match = isTypeCompatible(impl.typeAnnotation, ifaceMember.typeAnnotation, {});
                  if (!match) {
                    diag('warning', 'Property "' + propName + '" type mismatch: class has ' +
                      typeToString(impl.typeAnnotation) + ' vs interface ' + typeToString(ifaceMember.typeAnnotation), impl);
                  }
                }
              }
            });
          }
        });
      });

      return { diagnostics: diagnostics, passed: diagnostics.filter(function (d) { return d.severity === 'error'; }).length === 0 };
    }

    var checker = {
      check: check,
      extractTypeMetadata: extractTypeMetadata,
      typeToString: typeToString,
      isTypeCompatible: isTypeCompatible,
      resolveTypeNode: resolveTypeNode,
      diagnostics: function () { return diagnostics; },
      reset: reset
    };

    return checker;
  });
})();
