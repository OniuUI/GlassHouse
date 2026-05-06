(function () {
  'use strict';

  GlassHouse.define('ts-parser', ['ts-lexer'], function (L) {

    var T = L.T;

    function Parser(source) {
      this.lexer = new L.Lexer(source);
      this.tokens = [];
      this.pos = 0;
      this.current = null;
    }

    var PP = Parser.prototype;

    PP.tokenize = function () {
      this.tokens = this.lexer.scan();
      this.pos = 0;
      this.current = this.tokens[0];
    };

    PP.advance = function () {
      this.pos++;
      this.current = this.tokens[this.pos] || this.tokens[this.tokens.length - 1];
      return this._prev();
    };

    PP._prev = function () { return this.tokens[this.pos - 1]; };
    PP.peek = function (n) { return this.tokens[this.pos + (n || 0)]; };

    PP.is = function (type, value) {
      if (!this.current) return false;
      if (this.current.type !== type) return false;
      if (value !== undefined && this.current.value !== value) return false;
      return true;
    };

    PP.expect = function (type, value) {
      if (this.is(type, value)) return this.advance();
      throw this._error('Expected ' + type + (value ? ' ' + value : '') + ' got ' + this._tokenStr());
    };

    PP._error = function (msg) {
      var t = this.current || { line: 0, col: 0 };
      return new Error(msg + ' at ' + t.line + ':' + t.col + ' token=' + this._tokenStr());
    };

    PP._tokenStr = function () {
      var t = this.current;
      if (!t) return 'EOF';
      return t.type + (t.value !== null ? '(' + JSON.stringify(t.value) + ')' : '');
    };

    PP.parse = function () {
      this.tokenize();
      return this.parseProgram();
    };

    PP.parseProgram = function () {
      var body = [];
      while (!this.is(T.EOF)) body.push(this.parseStatement());
      return { type: 'Program', body: body };
    };

    PP.parseStatement = function () {
      switch (this.current.type) {
        case T.KEYWORD:
          switch (this.current.value) {
            case 'let': case 'const': case 'var': return this.parseVariableDeclaration();
            case 'function': return this.parseFunctionDeclaration();
            case 'class': return this.parseClassDeclaration();
            case 'interface': return this.parseInterfaceDeclaration();
            case 'type': return this.parseTypeAliasDeclaration();
            case 'enum': return this.parseEnumDeclaration();
            case 'if': return this.parseIfStatement();
            case 'for': return this.parseForStatement();
            case 'while': return this.parseWhileStatement();
            case 'return': return this.parseReturnStatement();
            case 'throw': return this.parseThrowStatement();
            case 'try': return this.parseTryStatement();
            case 'export': return this.parseExportDeclaration();
            case 'import': return this.parseImportDeclaration();
            default: return this.parseExpressionStatement();
          }
        case T.LB: return this.parseBlockStatement();
        case T.SEMI: this.advance(); return { type: 'EmptyStatement' };
        default: return this.parseExpressionStatement();
      }
    };

    PP.parseBlockStatement = function () {
      this.expect(T.LB);
      var body = [];
      while (!this.is(T.RB) && !this.is(T.EOF)) body.push(this.parseStatement());
      this.expect(T.RB);
      return { type: 'BlockStatement', body: body };
    };

    PP.parseVariableDeclaration = function () {
      var kind = this.current.value;
      this.advance();
      var declarations = [];
      do {
        if (this.is(T.COMMA)) this.advance();
        var id = this.expect(T.IDENT);
        var decl = { type: 'VariableDeclarator', id: { type: 'Identifier', name: id.value } };
        if (this.is(T.COLON)) { this.advance(); decl.id.typeAnnotation = this.parseType(); }
        if (this.is(T.EQ)) { this.advance(); decl.init = this.parseExpression(); }
        declarations.push(decl);
      } while (this.is(T.COMMA));
      if (!this.is(T.SEMI) && !this.is(T.RB) && !this.is(T.EOF) && !this.is(T.KEYWORD)) this.advance();
      else if (this.is(T.SEMI)) this.advance();
      return { type: 'VariableDeclaration', kind: kind, declarations: declarations };
    };

    PP.parseFunctionDeclaration = function () {
      this.advance();
      var id = this.is(T.IDENT) ? { type: 'Identifier', name: this.advance().value } : null;
      return this._parseFunction(id, 'FunctionDeclaration');
    };

    PP._parseFunction = function (id, nodeType) {
      var typeParams = this._maybeParseTypeParams();
      this.expect(T.LP);
      var params = this._parseParams();
      this.expect(T.RP);
      var returnType = null;
      if (this.is(T.COLON)) { this.advance(); returnType = this.parseType(); }
      var body;
      if (this.is(T.LB)) body = this.parseBlockStatement();
      else body = this.parseExpression();
      return {
        type: nodeType || 'FunctionDeclaration', id: id,
        typeParameters: typeParams, params: params,
        returnType: returnType, body: body, async: false, generator: false
      };
    };

    PP._parseParams = function () {
      var params = [];
      while (!this.is(T.RP)) {
        if (params.length > 0) this.expect(T.COMMA);
        if (this.is(T.DOT3)) {
          this.advance();
          var restId = this.expect(T.IDENT);
          params.push({ type: 'RestElement', argument: { type: 'Identifier', name: restId.value } });
          break;
        }
        var pid = this.expect(T.IDENT);
        var param = { type: 'Identifier', name: pid.value, optional: false, typeAnnotation: null };
        if (this.is(T.QUESTION)) { this.advance(); param.optional = true; }
        if (this.is(T.COLON)) { this.advance(); param.typeAnnotation = this.parseType(); }
        if (this.is(T.EQ)) { this.advance(); this.parseExpression(); }
        params.push(param);
      }
      return params;
    };

    PP._maybeParseTypeParams = function () {
      if (this.is(T.LT) && this._isTypeContext()) return this.parseTypeParams();
      return null;
    };

    PP._isTypeContext = function () {
      var tok = this.tokens, p = this.pos, depth = 0;
      while (p < tok.length - 1) {
        var t = tok[p];
        if (t.type === T.LT) depth++;
        if (t.type === T.GT) depth--;
        if (t.type === T.GT) return false;
        if (depth === 0 && (t.type === T.COMMA || t.type === T.RP || t.type === T.LB)) return false;
        if (t.type === T.EXTENDS || t.type === T.COLON || t.type === T.ARROW || t.type === T.EQ) return true;
        if (depth === 0) return false;
        p++;
      }
      return false;
    };

    PP.parseTypeParams = function () {
      this.expect(T.LT);
      var params = [];
      while (!this.is(T.GT) && !this.is(T.EOF)) {
        if (params.length > 0) this.expect(T.COMMA);
        var name = this.expect(T.IDENT);
        var constraint = null, defaultType = null;
        if (this.is(T.KEYWORD) && this.current.value === 'extends') { this.advance(); constraint = this.parseType(); }
        if (this.is(T.EQ)) { this.advance(); defaultType = this.parseType(); }
        params.push({ type: 'TypeParameter', name: { type: 'Identifier', name: name.value }, constraint: constraint, default: defaultType });
      }
      this.expect(T.GT);
      return params;
    };

    PP.parseClassDeclaration = function () {
      this.advance();
      var id = this.expect(T.IDENT);
      var typeParams = this._maybeParseTypeParams();
      var superClass = null;
      if (this.is(T.KEYWORD) && this.current.value === 'extends') { this.advance(); superClass = this.parseExpression(); }
      var implements_ = null;
      if (this.is(T.KEYWORD) && this.current.value === 'implements') {
        this.advance(); implements_ = [];
        do { if (implements_.length > 0) this.expect(T.COMMA); implements_.push(this.parseType()); } while (this.is(T.COMMA));
      }
      this.expect(T.LB);
      var body = [];
      while (!this.is(T.RB) && !this.is(T.EOF)) body.push(this.parseClassMember());
      this.expect(T.RB);
      return {
        type: 'ClassDeclaration', id: { type: 'Identifier', name: id.value },
        typeParameters: typeParams, superClass: superClass, implements: implements_, body: body
      };
    };

    PP.parseClassMember = function () {
      var mods = [];
      while (this.is(T.KEYWORD) && ['public','private','protected','static','readonly','abstract'].indexOf(this.current.value) !== -1)
        mods.push(this.advance().value);
      if (this.is(T.IDENT) || this.is(T.STR) || this.is(T.LK)) return this.parseClassProperty(mods);
      return this.parseStatement();
    };

    PP.parseClassProperty = function (mods) {
      var key = this.is(T.IDENT) ? { type: 'Identifier', name: this.advance().value } :
                this.is(T.STR) ? { type: 'Literal', value: this.advance().value } : this.parseExpression();
      var optional = false;
      if (this.is(T.QUESTION)) { this.advance(); optional = true; }
      var typeAnn = null;
      if (this.is(T.COLON)) { this.advance(); typeAnn = this.parseType(); }
      var value = null;
      if (this.is(T.EQ)) { this.advance(); value = this.parseExpression(); }
      if (this.is(T.SEMI)) this.advance();
      return { type: 'PropertyDefinition', key: key, modifiers: mods, optional: optional, typeAnnotation: typeAnn, value: value };
    };

    PP.parseInterfaceDeclaration = function () {
      this.advance();
      var id = this.expect(T.IDENT);
      var typeParams = this._maybeParseTypeParams();
      var extends_ = [];
      if (this.is(T.KEYWORD) && this.current.value === 'extends') {
        this.advance();
        do { if (extends_.length > 0) this.expect(T.COMMA); extends_.push(this.parseType()); } while (this.is(T.COMMA));
      }
      this.expect(T.LB);
      var body = [];
      while (!this.is(T.RB) && !this.is(T.EOF)) body.push(this.parseInterfaceMember());
      this.expect(T.RB);
      return { type: 'InterfaceDeclaration', id: { type: 'Identifier', name: id.value }, typeParameters: typeParams, extends: extends_, body: body };
    };

    PP.parseInterfaceMember = function () {
      var key = this.is(T.IDENT) ? { type: 'Identifier', name: this.advance().value } :
                this.is(T.STR) ? { type: 'Literal', value: this.advance().value } : this.parseExpression();
      var optional = false;
      if (this.is(T.QUESTION)) { this.advance(); optional = true; }
      if (this.is(T.LP)) return this._parseCallSignature(key);
      this.expect(T.COLON);
      var typeAnn = this.parseType();
      if (this.is(T.SEMI)) this.advance();
      return { type: 'PropertySignature', key: key, optional: optional, typeAnnotation: typeAnn };
    };

    PP._parseCallSignature = function (key) {
      this.expect(T.LP);
      var params = this._parseParams();
      this.expect(T.RP);
      var returnType = null;
      if (this.is(T.COLON)) { this.advance(); returnType = this.parseType(); }
      if (this.is(T.SEMI)) this.advance();
      return { type: 'MethodSignature', key: key, params: params, returnType: returnType };
    };

    PP.parseTypeAliasDeclaration = function () {
      this.advance();
      var id = this.expect(T.IDENT);
      var typeParams = this._maybeParseTypeParams();
      this.expect(T.EQ);
      var typeNode = this.parseType();
      if (this.is(T.SEMI)) this.advance();
      return { type: 'TypeAliasDeclaration', id: { type: 'Identifier', name: id.value }, typeParameters: typeParams, typeAnnotation: typeNode };
    };

    PP.parseEnumDeclaration = function () {
      this.advance();
      var id = this.expect(T.IDENT);
      this.expect(T.LB);
      var members = [];
      while (!this.is(T.RB) && !this.is(T.EOF)) {
        if (members.length > 0) this.expect(T.COMMA);
        var memId = this.expect(T.IDENT);
        var value = null;
        if (this.is(T.EQ)) { this.advance(); value = this.parseExpression(); }
        members.push({ type: 'EnumMember', id: { type: 'Identifier', name: memId.value }, initializer: value });
        if (this.is(T.COMMA) && this.peek(1) && this.peek(1).type === T.RB) this.advance();
      }
      this.expect(T.RB);
      return { type: 'EnumDeclaration', id: { type: 'Identifier', name: id.value }, members: members };
    };

    PP.parseIfStatement = function () {
      this.advance(); this.expect(T.LP);
      var test = this.parseExpression();
      this.expect(T.RP);
      var cons = this.parseStatement(), alt = null;
      if (this.is(T.KEYWORD) && this.current.value === 'else') { this.advance(); alt = this.parseStatement(); }
      return { type: 'IfStatement', test: test, consequent: cons, alternate: alt };
    };

    PP.parseForStatement = function () {
      this.advance(); this.expect(T.LP);
      var init, test, update;
      if (this.is(T.KEYWORD) && (this.current.value === 'let' || this.current.value === 'const' || this.current.value === 'var'))
        init = this.parseVariableDeclaration();
      else if (!this.is(T.SEMI)) init = this.parseExpression();
      if (this.is(T.KEYWORD) && this.current.value === 'of') {
        this.advance();
        var right = this.parseExpression();
        this.expect(T.RP);
        return { type: 'ForOfStatement', left: init.declarations ? init.declarations[0].id : init, right: right, body: this.parseStatement() };
      }
      this.expect(T.SEMI);
      test = this.is(T.SEMI) ? null : this.parseExpression();
      this.expect(T.SEMI);
      update = this.is(T.RP) ? null : this.parseExpression();
      this.expect(T.RP);
      return { type: 'ForStatement', init: init, test: test, update: update, body: this.parseStatement() };
    };

    PP.parseWhileStatement = function () {
      this.advance(); this.expect(T.LP);
      var test = this.parseExpression();
      this.expect(T.RP);
      return { type: 'WhileStatement', test: test, body: this.parseStatement() };
    };

    PP.parseReturnStatement = function () {
      this.advance();
      var arg = null;
      if (!this.is(T.SEMI) && !this.is(T.RB)) arg = this.parseExpression();
      if (this.is(T.SEMI)) this.advance();
      return { type: 'ReturnStatement', argument: arg };
    };

    PP.parseThrowStatement = function () {
      this.advance();
      var arg = this.parseExpression();
      if (this.is(T.SEMI)) this.advance();
      return { type: 'ThrowStatement', argument: arg };
    };

    PP.parseTryStatement = function () {
      this.advance();
      var block = this.parseBlockStatement();
      var handler = null, finalizer = null;
      if (this.is(T.KEYWORD) && this.current.value === 'catch') {
        this.advance();
        var param = null;
        if (this.is(T.LP)) { this.advance(); param = this.expect(T.IDENT); this.expect(T.RP); }
        handler = { type: 'CatchClause', param: param ? { type: 'Identifier', name: param.value } : null, body: this.parseBlockStatement() };
      }
      if (this.is(T.KEYWORD) && this.current.value === 'finally') { this.advance(); finalizer = this.parseBlockStatement(); }
      return { type: 'TryStatement', block: block, handler: handler, finalizer: finalizer };
    };

    PP.parseExportDeclaration = function () {
      this.advance();
      if (this.is(T.KEYWORD) && this.current.value === 'default') {
        this.advance();
        var decl = this.is(T.KEYWORD) && (this.current.value === 'function' || this.current.value === 'class') ?
          this.parseStatement() : this.parseExpression();
        if (this.is(T.SEMI)) this.advance();
        return { type: 'ExportDefaultDeclaration', declaration: decl };
      }
      var declaration = this.parseStatement();
      return { type: 'ExportNamedDeclaration', declaration: declaration };
    };

    PP.parseImportDeclaration = function () {
      this.advance();
      var specifiers = [];
      if (this.is(T.IDENT)) {
        specifiers.push({ type: 'ImportDefaultSpecifier', local: { type: 'Identifier', name: this.advance().value } });
        if (this.is(T.COMMA)) this.advance();
      }
      if (this.is(T.LB)) {
        this.advance();
        while (!this.is(T.RB)) {
          if (specifiers.length > 0) this.expect(T.COMMA);
          var impId = this.expect(T.IDENT);
          specifiers.push({ type: 'ImportSpecifier', imported: { type: 'Identifier', name: impId.value }, local: { type: 'Identifier', name: impId.value } });
        }
        this.expect(T.RB);
      }
      this.expect(T.KEYWORD, 'from');
      var source = this.expect(T.STR);
      if (this.is(T.SEMI)) this.advance();
      return { type: 'ImportDeclaration', specifiers: specifiers, source: { type: 'Literal', value: source.value } };
    };

    PP.parseExpressionStatement = function () {
      var expr = this.parseExpression();
      if (this.is(T.SEMI)) this.advance();
      return { type: 'ExpressionStatement', expression: expr };
    };

    PP.parseExpression = function () { return this.parseConditional(); };

    PP.parseConditional = function () {
      var expr = this.parseAssignment();
      if (this.is(T.QUESTION)) {
        this.advance();
        var cons = this.parseExpression();
        this.expect(T.COLON);
        var alt = this.parseExpression();
        return { type: 'ConditionalExpression', test: expr, consequent: cons, alternate: alt };
      }
      return expr;
    };

    PP.parseAssignment = function () {
      var expr = this.parseArrowOrBinary();
      if (this.is(T.EQ)) {
        var op = this.advance().value;
        return { type: 'AssignmentExpression', operator: op, left: expr, right: this.parseAssignment() };
      }
      return expr;
    };

    PP.parseArrowOrBinary = function () {
      if (this._looksLikeArrowParams()) {
        var params = this._parseArrowParams();
        this.expect(T.ARROW);
        var returnType = null;
        if (this.is(T.COLON) && !this.is(T.LB)) { this.advance(); returnType = this.parseType(); }
        var body = this.is(T.LB) ? this.parseBlockStatement() : this.parseExpression();
        return { type: 'ArrowFunctionExpression', params: params, returnType: returnType, body: body };
      }
      return this.parseBinary(0);
    };

    PP._looksLikeArrowParams = function () {
      if (!this.is(T.IDENT) && !this.is(T.LP)) return false;
      var p = this.pos, tok = this.tokens;
      if (tok[p].type === T.LP) {
        p++; var depth = 1;
        while (p < tok.length && depth > 0) {
          if (tok[p].type === T.LP) depth++;
          if (tok[p].type === T.RP) depth--;
          if (depth === 0) break;
          p++;
        }
        if (depth === 0) p++;
      } else { p++; }
      while (p < tok.length && tok[p].type === T.COLON) {
        p++; var d2 = 0;
        while (p < tok.length) {
          if (tok[p].type === T.LT || tok[p].type === T.LP || tok[p].type === T.LB) d2++;
          if (tok[p].type === T.GT || tok[p].type === T.RP || tok[p].type === T.RB) d2--;
          if (d2 < 0) break;
          p++;
          if (d2 === 0 && (tok[p] && (tok[p].type === T.COMMA || tok[p].type === T.ARROW || tok[p].type === T.RP || tok[p].type === T.EQ))) break;
        }
        if (d2 === 0) p++;
      }
      return p < tok.length && tok[p] && tok[p].type === T.ARROW;
    };

    PP._parseArrowParams = function () {
      if (this.is(T.LP)) {
        this.advance();
        if (this.is(T.RP)) { this.advance(); return []; }
        var params = this._parseParams();
        this.expect(T.RP);
        return params;
      }
      var id = this.expect(T.IDENT);
      return [{ type: 'Identifier', name: id.value, optional: false, typeAnnotation: null }];
    };

    var BINARY_PREC = {
      '||': 1, '??': 1, '&&': 2, '|': 3, '^': 4, '&': 5,
      '==': 6, '!=': 6, '===': 6, '!==': 6,
      '<': 7, '>': 7, '<=': 7, '>=': 7,
      '<<': 8, '>>': 8, '>>>': 8,
      '+': 9, '-': 9, '*': 10, '/': 10, '%': 10,
    };

    PP.parseBinary = function (minPrec) {
      var left = this.parseUnary();
      while (true) {
        var op = this._binaryOp();
        if (!op) break;
        var prec = BINARY_PREC[op] || 0;
        if (prec < minPrec) break;
        this.advance();
        var right = this.parseBinary(prec + 1);
        left = { type: 'BinaryExpression', operator: op, left: left, right: right };
      }
      return left;
    };

    PP._binaryOp = function () {
      if (!this.current) return null;
      var op = this.current.value;
      return BINARY_PREC[op] !== undefined ? op : null;
    };

    PP.parseUnary = function () {
      if (this.is(T.BANG) || this.is(T.TILDE) || this.is(T.MINUS) || this.is(T.PLUS)) {
        var op = this.advance().value;
        return { type: 'UnaryExpression', operator: op, argument: this.parseUnary(), prefix: true };
      }
      if (this.is(T.KEYWORD) && (this.current.value === 'typeof' || this.current.value === 'void' || this.current.value === 'delete')) {
        var kw = this.advance().value;
        return { type: 'UnaryExpression', operator: kw, argument: this.parseUnary(), prefix: true };
      }
      return this.parsePostfix();
    };

    PP.parsePostfix = function () {
      var expr = this.parsePrimary();
      while (true) {
        if (this.is(T.DOT)) {
          this.advance();
          var prop = this.expect(T.IDENT);
          expr = { type: 'MemberExpression', object: expr, property: { type: 'Identifier', name: prop.value }, computed: false, optional: false };
        } else if (this.is(T.QDOT)) {
          this.advance();
          var p = this.expect(T.IDENT);
          expr = { type: 'MemberExpression', object: expr, property: { type: 'Identifier', name: p.value }, computed: false, optional: true };
        } else if (this.is(T.LK)) {
          this.advance();
          var idx = this.parseExpression();
          this.expect(T.RK);
          expr = { type: 'MemberExpression', object: expr, property: idx, computed: true, optional: false };
        } else if (this.is(T.LP)) {
          expr = this._parseCall(expr);
        } else if (this.is(T.KEYWORD) && this.current.value === 'as') {
          this.advance();
          var type = this.parseType();
          expr = { type: 'TypeAssertion', expression: expr, typeAnnotation: type, asStyle: true };
        } else break;
      }
      return expr;
    };

    PP._parseCall = function (callee) {
      this.expect(T.LP);
      var args = [];
      if (!this.is(T.RP)) {
        args.push(this.parseExpression());
        while (this.is(T.COMMA)) { this.advance(); args.push(this.parseExpression()); }
      }
      this.expect(T.RP);
      return { type: 'CallExpression', callee: callee, arguments: args };
    };

    PP.parsePrimary = function () {
      if (this.is(T.JSX_TAG_OPEN)) return this.parseJSXElement();
      if (this.is(T.LP)) { this.advance(); var expr = this.parseExpression(); this.expect(T.RP); return expr; }
      if (this.is(T.NUM)) { var n = this.advance(); return { type: 'Literal', value: n.value, raw: String(n.value) }; }
      if (this.is(T.STR)) { var s = this.advance(); return { type: 'Literal', value: s.value, raw: '"' + s.value + '"' }; }
      if (this.is(T.TEMPLATE) || this.is(T.TEMPLATE_HEAD) || this.is(T.TEMPLATE_TAIL)) return this.parseTemplateLiteral();
      if (this.is(T.KEYWORD)) {
        switch (this.current.value) {
          case 'true': this.advance(); return { type: 'Literal', value: true, raw: 'true' };
          case 'false': this.advance(); return { type: 'Literal', value: false, raw: 'false' };
          case 'null': this.advance(); return { type: 'Literal', value: null, raw: 'null' };
          case 'undefined': this.advance(); return { type: 'Identifier', name: 'undefined' };
          case 'this': this.advance(); return { type: 'ThisExpression' };
          case 'new': return this.parseNewExpression();
          case 'function': return this.parseFunctionExpression();
          default: break;
        }
      }
      if (this.is(T.IDENT)) { var id = this.advance(); return { type: 'Identifier', name: id.value }; }
      if (this.is(T.LB)) return this.parseObjectExpression();
      if (this.is(T.LK)) return this.parseArrayExpression();
      throw this._error('Unexpected token in expression');
    };

    // --- JSX ---

    PP.parseJSXElement = function () {
      var opening = this.parseJSXOpeningElement();
      if (opening.selfClosing) return { type: 'JSXElement', tag: opening.tag, attrs: opening.attrs, children: [] };
      var children = [];
      var tagName = this._jsxTagName(opening.tag);
      while (true) {
        if (this.is(T.JSX_CLOSE_TAG)) {
          var ct = this.advance();
          if (this.is(T.JSX_TAG_CLOSE)) this.advance();
          if (tagName && ct.value !== tagName)
            throw this._error('Expected </' + tagName + '> but got </' + ct.value + '>');
          break;
        }
        if (this.is(T.EOF)) throw this._error('Unexpected EOF in JSX element');
        if (this.is(T.JSX_TEXT)) {
          var tt = this.advance();
          if (tt.value && tt.value.trim().length > 0) children.push({ type: 'JSXText', value: tt.value });
          continue;
        }
        if (this.is(T.JSX_TAG_OPEN)) { children.push(this.parseJSXElement()); continue; }
        if (this.is(T.JSX_EXPRESSION_START)) {
          this.advance();
          var exp = this.parseExpression();
          if (this.is(T.JSX_EXPRESSION_END)) this.advance();
          children.push({ type: 'JSXExpression', expression: exp });
          continue;
        }
        this.advance();
      }
      return { type: 'JSXElement', tag: opening.tag, attrs: opening.attrs, children: children };
    };

    PP._jsxTagName = function (tag) {
      if (!tag) return null;
      if (typeof tag === 'string') return tag;
      if (tag.type === 'Identifier') return tag.name;
      if (tag.type === 'MemberExpression')
        return (this._jsxTagName(tag.object) || '') + '.' + (tag.property ? tag.property.name : '');
      return null;
    };

    PP.parseJSXOpeningElement = function () {
      var tagToken = this.advance();
      var tag = { type: 'Identifier', name: tagToken.value };
      if (this.is(T.DOT)) {
        var parts = [tagToken.value];
        while (this.is(T.DOT)) { this.advance(); if (this.is(T.IDENT)) { parts.push(this.current.value); this.advance(); } else break; }
        tag = this._buildMemberTag(parts);
      }
      var attrs = [];
      while (true) {
        if (this.is(T.JSX_SPREAD)) {
          this.advance();
          var spreadArg = this.parseExpression();
          if (this.is(T.JSX_EXPRESSION_END) || this.is(T.RB)) this.advance();
          attrs.push({ type: 'JSXSpreadAttribute', argument: spreadArg });
          continue;
        }
        if (this.is(T.JSX_TAG_CLOSE)) { this.advance(); return { tag: tag, attrs: attrs, selfClosing: false }; }
        if (this.is(T.JSX_SELF_CLOSE)) { this.advance(); return { tag: tag, attrs: attrs, selfClosing: true }; }
        if (this.is(T.IDENT)) {
          var attrName = this.advance().value;
          if (!this.is(T.EQ)) { attrs.push({ type: 'JSXAttribute', name: attrName, value: { type: 'Literal', value: true, raw: 'true' } }); continue; }
          this.advance();
          if (this.is(T.STR)) {
            var sv = this.advance().value;
            attrs.push({ type: 'JSXAttribute', name: attrName, value: { type: 'Literal', value: sv, raw: JSON.stringify(sv) } });
          } else if (this.is(T.JSX_EXPRESSION_START)) {
            this.advance();
            var ev = this.parseExpression();
            if (this.is(T.JSX_EXPRESSION_END)) this.advance();
            attrs.push({ type: 'JSXAttribute', name: attrName, value: ev });
          }
          continue;
        }
        break;
      }
      return { tag: tag, attrs: attrs, selfClosing: true };
    };

    PP._buildMemberTag = function (parts) {
      if (parts.length === 0) return { type: 'Identifier', name: '' };
      if (parts.length === 1) return { type: 'Identifier', name: parts[0] };
      var obj = { type: 'Identifier', name: parts[0] };
      for (var i = 1; i < parts.length; i++)
        obj = { type: 'MemberExpression', object: obj, property: { type: 'Identifier', name: parts[i] }, computed: false, optional: false };
      return obj;
    };

    // --- Expressions (continued) ---

    PP.parseNewExpression = function () {
      this.advance();
      var callee = this.parsePrimary();
      var args = [];
      if (this.is(T.LP)) {
        this.advance();
        if (!this.is(T.RP)) { args.push(this.parseExpression()); while (this.is(T.COMMA)) { this.advance(); args.push(this.parseExpression()); } }
        this.expect(T.RP);
      }
      return { type: 'NewExpression', callee: callee, arguments: args };
    };

    PP.parseFunctionExpression = function () {
      this.advance();
      var id = this.is(T.IDENT) ? { type: 'Identifier', name: this.advance().value } : null;
      return this._parseFunction(id, 'FunctionExpression');
    };

    PP.parseTemplateLiteral = function () {
      var quasis = [], expressions = [];
      while (true) {
        var tok = this.current;
        if (tok.type === T.TEMPLATE) {
          quasis.push({ type: 'TemplateElement', value: { raw: tok.value, cooked: tok.value }, tail: true });
          this.advance(); break;
        } else if (tok.type === T.TEMPLATE_HEAD) {
          quasis.push({ type: 'TemplateElement', value: { raw: tok.value, cooked: tok.value }, tail: false });
          this.advance(); expressions.push(this.parseExpression());
        } else if (tok.type === T.TEMPLATE_TAIL) {
          quasis.push({ type: 'TemplateElement', value: { raw: tok.value, cooked: tok.value }, tail: true });
          this.advance(); break;
        } else break;
      }
      return { type: 'TemplateLiteral', expressions: expressions, quasis: quasis };
    };

    PP.parseObjectExpression = function () {
      this.expect(T.LB);
      var properties = [];
      while (!this.is(T.RB) && !this.is(T.EOF)) {
        if (properties.length > 0) this.expect(T.COMMA);
        if (this.is(T.DOT3)) { this.advance(); properties.push({ type: 'SpreadElement', argument: this.parseExpression() }); }
        else properties.push(this.parseObjectProperty());
        if (this.is(T.COMMA) && this.peek(1) && this.peek(1).type === T.RB) this.advance();
      }
      this.expect(T.RB);
      return { type: 'ObjectExpression', properties: properties };
    };

    PP.parseObjectProperty = function () {
      var key = this.is(T.IDENT) ? { type: 'Identifier', name: this.current.value } :
                this.is(T.STR) ? { type: 'Literal', value: this.current.value } : this.parseExpression();
      if (key.type === 'Identifier') this.advance();
      else if (key.type === 'Literal') this.advance();
      if (this.is(T.COLON)) { this.advance(); return { type: 'Property', key: key, value: this.parseExpression(), kind: 'init' }; }
      if (this.is(T.LP)) return this._parseMethod(key);
      return { type: 'Property', key: key, value: key, kind: 'init', shorthand: true };
    };

    PP._parseMethod = function (key) {
      this.advance();
      var params = this._parseParams();
      this.expect(T.RP);
      var returnType = null;
      if (this.is(T.COLON)) { this.advance(); returnType = this.parseType(); }
      var body = this.parseBlockStatement();
      return { type: 'Property', key: key, value: { type: 'FunctionExpression', params: params, returnType: returnType, body: body }, kind: 'init', method: true };
    };

    PP.parseArrayExpression = function () {
      this.expect(T.LK);
      var elements = [];
      while (!this.is(T.RK) && !this.is(T.EOF)) {
        if (elements.length > 0) this.expect(T.COMMA);
        if (this.is(T.COMMA)) { elements.push(null); continue; }
        elements.push(this.parseExpression());
        if (this.is(T.COMMA) && this.peek(1) && this.peek(1).type === T.RK) this.advance();
      }
      this.expect(T.RK);
      return { type: 'ArrayExpression', elements: elements };
    };

    // --- Types ---

    PP.parseType = function () { return this.parseUnionType(); };

    PP.parseUnionType = function () {
      var left = this.parseIntersectionType();
      while (this.is(T.PIPE)) { this.advance(); var r = this.parseIntersectionType(); left = left.type === 'UnionType' ? (left.types.push(r), left) : { type: 'UnionType', types: [left, r] }; }
      return left;
    };

    PP.parseIntersectionType = function () {
      var left = this.parseFunctionOrConditionalType();
      while (this.is(T.AMP)) { this.advance(); var r = this.parseFunctionOrConditionalType(); left = left.type === 'IntersectionType' ? { type: 'IntersectionType', types: left.types.concat([r]) } : { type: 'IntersectionType', types: [left, r] }; }
      return left;
    };

    PP.parseFunctionOrConditionalType = function () {
      if (this.is(T.LP)) {
        var p = this.pos; this.advance();
        if (this._looksLikeFunctionType()) { this.pos = p; this.current = this.tokens[p]; return this.parseFunctionType(); }
        this.pos = p; this.current = this.tokens[p];
        return this.parsePrimaryType();
      }
      var type = this.parsePrimaryType();
      if (this.is(T.KEYWORD) && this.current.value === 'extends') {
        this.advance(); var ext = this.parseType(); this.expect(T.QUESTION);
        var tb = this.parseType(); this.expect(T.COLON); var fb = this.parseType();
        return { type: 'ConditionalType', checkType: type, extendsType: ext, trueType: tb, falseType: fb };
      }
      return type;
    };

    PP._looksLikeFunctionType = function () {
      var i = this.pos, tok = this.tokens, depth = 1;
      while (i < tok.length && depth > 0) {
        if (tok[i].type === T.LP) depth++;
        if (tok[i].type === T.RP) depth--;
        if (depth === 0) { i++; break; }
        i++;
      }
      while (i < tok.length && tok[i].type === T.LK) {
        i++; var d2 = 1;
        while (i < tok.length && d2 > 0) {
          if (tok[i].type === T.LK) d2++;
          if (tok[i].type === T.RK) d2--;
          if (d2 === 0) { i++; break; }
          i++;
        }
      }
      return i < tok.length && tok[i] && tok[i].type === T.ARROW;
    };

    PP.parseFunctionType = function () {
      this.expect(T.LP); var params = [];
      if (!this.is(T.RP)) {
        do {
          if (params.length > 0) this.expect(T.COMMA);
          var pname = this.is(T.IDENT) ? { type: 'Identifier', name: this.advance().value, optional: false } : null;
          if (pname && this.is(T.QUESTION)) { this.advance(); pname.optional = true; }
          if (pname && this.is(T.COLON)) this.advance();
          var ptype = this.parseType();
          params.push({ type: 'FunctionTypeParam', name: pname, typeAnnotation: ptype });
        } while (this.is(T.COMMA));
      }
      this.expect(T.RP); this.expect(T.ARROW);
      return { type: 'FunctionType', params: params, returnType: this.parseType() };
    };

    PP.parsePrimaryType = function () {
      if (this.is(T.KEYWORD)) {
        switch (this.current.value) {
          case 'string': case 'number': case 'boolean': case 'void': case 'any': case 'unknown': case 'never':
            var kw = this.advance().value;
            return { type: 'TypeReference', typeName: { type: 'Identifier', name: kw }, typeArguments: null };
          case 'null': this.advance(); return { type: 'LiteralType', literal: { type: 'Literal', value: null } };
          case 'undefined': this.advance(); return { type: 'LiteralType', literal: { type: 'Identifier', name: 'undefined' } };
          case 'true': this.advance(); return { type: 'LiteralType', literal: { type: 'Literal', value: true } };
          case 'false': this.advance(); return { type: 'LiteralType', literal: { type: 'Literal', value: false } };
          case 'keyof': this.advance(); return { type: 'TypeOperator', operator: 'keyof', typeAnnotation: this.parsePrimaryType() };
          case 'typeof': this.advance(); return { type: 'TypeQuery', exprName: this.parsePrimaryType() };
          case 'infer': this.advance(); return { type: 'InferType', typeParameter: { type: 'TypeParameter', name: { type: 'Identifier', name: this.expect(T.IDENT).value } } };
          default: break;
        }
      }
      if (this.is(T.STR)) { var sv = this.advance(); return { type: 'LiteralType', literal: { type: 'Literal', value: sv.value } }; }
      if (this.is(T.NUM)) { var nv = this.advance(); return { type: 'LiteralType', literal: { type: 'Literal', value: nv.value } }; }
      if (this.is(T.IDENT)) {
        var id = this.advance(); var typeArgs = null;
        if (this.is(T.LT)) {
          this.advance(); typeArgs = [];
          while (!this.is(T.GT) && !this.is(T.EOF)) { if (typeArgs.length > 0) this.expect(T.COMMA); typeArgs.push(this.parseType()); }
          this.expect(T.GT);
        }
        return { type: 'TypeReference', typeName: { type: 'Identifier', name: id.value }, typeArguments: typeArgs };
      }
      if (this.is(T.LB)) return this.parseObjectType();
      if (this.is(T.LK)) return this.parseTupleType();
      if (this.is(T.LP)) return this.parseFunctionType();
      throw this._error('Unexpected token in type: ' + this._tokenStr());
    };

    PP.parseObjectType = function () {
      this.expect(T.LB); var members = [];
      while (!this.is(T.RB) && !this.is(T.EOF)) {
        members.push(this.parseInterfaceMember());
        if (!this.is(T.RB)) { if (!this.is(T.SEMI) && !this.is(T.COMMA)) break; if (this.is(T.SEMI) || this.is(T.COMMA)) this.advance(); }
      }
      this.expect(T.RB);
      return { type: 'ObjectType', members: members };
    };

    PP.parseTupleType = function () {
      this.expect(T.LK); var types = [];
      while (!this.is(T.RK) && !this.is(T.EOF)) { if (types.length > 0) this.expect(T.COMMA); types.push(this.parseType()); }
      this.expect(T.RK);
      return { type: 'TupleType', elementTypes: types };
    };

    // --- AST Walker ---

    Parser.walk = function (node, visitor) {
      if (!node || typeof node !== 'object') return;
      var v = visitor[node.type];
      if (v) v(node);
      var keys = Object.keys(node);
      for (var i = 0; i < keys.length; i++) {
        var child = node[keys[i]];
        if (Array.isArray(child)) for (var j = 0; j < child.length; j++) Parser.walk(child[j], visitor);
        else if (child && typeof child === 'object' && child.type) Parser.walk(child, visitor);
      }
    };

    var parser = {
      Parser: Parser,
      parse: function (source) { return new Parser(source).parse(); }
    };

    Object.freeze(parser);

    return parser;
  });
})();
