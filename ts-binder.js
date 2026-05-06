(function () {
  'use strict';

  GlassHouse.define('ts-binder', ['ts-parser'], function (parserModule) {

    function Scope(parent) {
      this.parent = parent || null;
      this.symbols = Object.create(null);
      this.children = [];
    }

    Scope.prototype.declare = function (name, node) {
      if (this.symbols[name]) {
        return this.symbols[name];
      }
      var sym = { name: name, declarations: [], references: [], type: null };
      this.symbols[name] = sym;
      if (node) sym.declarations.push(node);
      return sym;
    };

    Scope.prototype.lookup = function (name) {
      if (this.symbols[name]) return this.symbols[name];
      if (this.parent) return this.parent.lookup(name);
      return null;
    };

    Scope.prototype.lookupLocal = function (name) {
      return this.symbols[name] || null;
    };

    function Binder() {
      this.globalScope = new Scope(null);
      this.currentScope = this.globalScope;
      this.interfaces = Object.create(null);
      this.types = Object.create(null);
      this.functions = Object.create(null);
      this.classes = Object.create(null);
      this.enums = Object.create(null);
    }

    var BP = Binder.prototype;

    BP.pushScope = function () {
      var scope = new Scope(this.currentScope);
      this.currentScope.children.push(scope);
      this.currentScope = scope;
      return scope;
    };

    BP.popScope = function () {
      if (this.currentScope.parent) {
        this.currentScope = this.currentScope.parent;
      }
    };

    BP.run = function (ast) {
      this._bindNode(ast);
      return {
        globalScope: this.globalScope,
        interfaces: this.interfaces,
        types: this.types,
        functions: this.functions,
        classes: this.classes,
        enums: this.enums
      };
    };

    BP._bindNode = function (node) {
      if (!node || typeof node !== 'object') return;
      var handler = bindHandlers[node.type];
      if (handler) handler.call(this, node);
    };

    BP._bindList = function (nodes) {
      if (!nodes) return;
      for (var i = 0; i < nodes.length; i++) {
        this._bindNode(nodes[i]);
      }
    };

    var bindHandlers = {
      Program: function (node) { this._bindList(node.body); },

      VariableDeclaration: function (node) {
        var self = this;
        node.declarations.forEach(function (decl) {
          if (decl.id && decl.id.name) {
            self.currentScope.declare(decl.id.name, decl);
          }
          if (decl.init) self._bindNode(decl.init);
        });
      },

      FunctionDeclaration: function (node) {
        if (node.id) {
          this.currentScope.declare(node.id.name, node);
          this.functions[node.id.name] = node;
        }
        this.pushScope();
        node.params.forEach(function (p) {
          if (p.name) this.currentScope.declare(p.name, p);
          else if (p.type === 'RestElement' && p.argument && p.argument.name) {
            this.currentScope.declare(p.argument.name, p);
          }
        }.bind(this));
        this._bindNode(node.body);
        this.popScope();
      },

      FunctionExpression: function (node) {
        if (node.id) this.currentScope.declare(node.id.name, node);
        this.pushScope();
        node.params.forEach(function (p) {
          if (p.name) this.currentScope.declare(p.name, p);
        }.bind(this));
        this._bindNode(node.body);
        this.popScope();
      },

      ArrowFunctionExpression: function (node) {
        this.pushScope();
        node.params.forEach(function (p) {
          if (p.name) this.currentScope.declare(p.name, p);
        }.bind(this));
        this._bindNode(node.body);
        this.popScope();
      },

      ClassDeclaration: function (node) {
        if (node.id) {
          this.currentScope.declare(node.id.name, node);
          this.classes[node.id.name] = node;
        }
        this.pushScope();
        this._bindList(node.body);
        this.popScope();
      },

      InterfaceDeclaration: function (node) {
        if (node.id) {
          this.currentScope.declare(node.id.name, node);
          this.interfaces[node.id.name] = node;
        }
      },

      TypeAliasDeclaration: function (node) {
        if (node.id) {
          this.currentScope.declare(node.id.name, node);
          this.types[node.id.name] = node;
        }
      },

      EnumDeclaration: function (node) {
        if (node.id) {
          this.currentScope.declare(node.id.name, node);
          this.enums[node.id.name] = node;
        }
        node.members.forEach(function (m) {
          if (m.id) this.currentScope.declare(m.id.name, m);
        }.bind(this));
      },

      BlockStatement: function (node) {
        this.pushScope();
        this._bindList(node.body);
        this.popScope();
      },

      ForStatement: function (node) {
        this.pushScope();
        if (node.init) this._bindNode(node.init);
        if (node.test) this._bindNode(node.test);
        if (node.update) this._bindNode(node.update);
        this._bindNode(node.body);
        this.popScope();
      },

      ForOfStatement: function (node) {
        this.pushScope();
        if (node.left && node.left.name) this.currentScope.declare(node.left.name, node);
        this._bindNode(node.right);
        this._bindNode(node.body);
        this.popScope();
      },

      CatchClause: function (node) {
        this.pushScope();
        if (node.param && node.param.name) this.currentScope.declare(node.param.name, node);
        this._bindNode(node.body);
        this.popScope();
      },

      IfStatement: function (node) {
        this._bindNode(node.test);
        this._bindNode(node.consequent);
        if (node.alternate) this._bindNode(node.alternate);
      },

      WhileStatement: function (node) {
        this._bindNode(node.test);
        this._bindNode(node.body);
      },

      ReturnStatement: function (node) {
        if (node.argument) this._bindNode(node.argument);
      },

      ThrowStatement: function (node) {
        if (node.argument) this._bindNode(node.argument);
      },

      TryStatement: function (node) {
        this._bindNode(node.block);
        if (node.handler) this._bindNode(node.handler);
        if (node.finalizer) this._bindNode(node.finalizer);
      },

      ExpressionStatement: function (node) {
        this._bindNode(node.expression);
      },

      CallExpression: function (node) {
        this._bindNode(node.callee);
        this._bindList(node.arguments);
      },

      MemberExpression: function (node) {
        this._bindNode(node.object);
        if (!node.computed) return;
        this._bindNode(node.property);
      },

      Identifier: function (node) {
        var sym = this.currentScope.lookup(node.name);
        if (sym && sym.declarations.indexOf(node) === -1) {
          sym.references.push(node);
        }
      },

      BinaryExpression: function (node) {
        this._bindNode(node.left);
        this._bindNode(node.right);
      },

      UnaryExpression: function (node) {
        this._bindNode(node.argument);
      },

      ConditionalExpression: function (node) {
        this._bindNode(node.test);
        this._bindNode(node.consequent);
        this._bindNode(node.alternate);
      },

      AssignmentExpression: function (node) {
        this._bindNode(node.left);
        this._bindNode(node.right);
      },

      ObjectExpression: function (node) {
        this._bindList(node.properties);
      },

      Property: function (node) {
        this._bindNode(node.value);
      },

      SpreadElement: function (node) {
        this._bindNode(node.argument);
      },

      ArrayExpression: function (node) {
        this._bindList(node.elements);
      },

      NewExpression: function (node) {
        this._bindNode(node.callee);
        this._bindList(node.arguments);
      },

      TemplateLiteral: function (node) {
        this._bindList(node.expressions);
      },

      TypeAssertion: function (node) {
        this._bindNode(node.expression);
      },

      ExportNamedDeclaration: function (node) {
        if (node.declaration) this._bindNode(node.declaration);
      },

      ExportDefaultDeclaration: function (node) {
        if (node.declaration) this._bindNode(node.declaration);
      },

      ImportDeclaration: function (node) {
        var self = this;
        node.specifiers.forEach(function (s) {
          if (s.local) self.currentScope.declare(s.local.name, s);
        });
      },
    };

    var binder = {
      Binder: Binder,
      bind: function (ast) { return new Binder().run(ast); }
    };

    return binder;
  });
})();
