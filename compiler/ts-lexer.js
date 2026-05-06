(function () {
  'use strict';

  GlassHouse.define('ts-lexer', [], function () {

    var T = {
      IDENT: 'IDENT', NUM: 'NUM', STR: 'STR', TEMPLATE: 'TEMPLATE',
      TEMPLATE_HEAD: 'TEMPLATE_HEAD', TEMPLATE_MID: 'TEMPLATE_MID',
      TEMPLATE_TAIL: 'TEMPLATE_TAIL',
      LP: '(', RP: ')', LB: '{', RB: '}', LK: '[', RK: ']',
      LT: '<', GT: '>', LE: '<=', GE: '>=', SHL: '<<', SHR: '>>', SHRU: '>>>',
      EQ: '=', DEQ: '==', TEQ: '===', NE: '!=', NTE: '!==',
      PLUS: '+', MINUS: '-', STAR: '*', SLASH: '/', PCT: '%', STAR2: '**',
      PLUS2: '++', MINUS2: '--', AMP: '&', AMP2: '&&', PIPE: '|', PIPE2: '||',
      CARET: '^', TILDE: '~', BANG: '!',
      DOT: '.', DOT3: '...', COMMA: ',', SEMI: ';', COLON: ':',
      ARROW: '=>', FAT: '=>', QDOT: '?.', QQ: '??', QCOL: '?:', DCOL: '::',
      KEYWORD: 'KEYWORD', EOF: 'EOF',
      QUESTION: '?',
      ASSIGN: '=', EXTENDS: 'extends',
      // JSX tokens
      JSX_TAG_OPEN: 'JSX_TAG_OPEN',
      JSX_TAG_CLOSE: 'JSX_TAG_CLOSE',
      JSX_SELF_CLOSE: 'JSX_SELF_CLOSE',
      JSX_CLOSE_TAG: 'JSX_CLOSE_TAG',
      JSX_TEXT: 'JSX_TEXT',
      JSX_EXPRESSION_START: 'JSX_EXPRESSION_START',
      JSX_EXPRESSION_END: 'JSX_EXPRESSION_END',
      JSX_SPREAD: 'JSX_SPREAD'
    };

    var KEYWORDS = {
      'break':1, 'case':1, 'catch':1, 'continue':1, 'debugger':1, 'default':1,
      'delete':1, 'do':1, 'else':1, 'finally':1, 'for':1, 'function':1,
      'if':1, 'in':1, 'instanceof':1, 'new':1, 'return':1, 'switch':1,
      'this':1, 'throw':1, 'try':1, 'typeof':1, 'var':1, 'void':1,
      'while':1, 'with':1, 'class':1, 'const':1, 'enum':1, 'export':1,
      'extends':1, 'import':1, 'super':1, 'implements':1, 'let':1,
      'private':1, 'public':1, 'protected':1, 'static':1, 'yield':1,
      'interface':1, 'type':1, 'as':1, 'from':1, 'of':1, 'readonly':1,
      'abstract':1, 'async':1, 'await':1, 'declare':1, 'namespace':1,
       'module':1, 'keyof':1, 'infer':1, 'never':1,
       'any':1, 'unknown':1, 'true':1, 'false':1, 'null':1, 'undefined':1,
    };

    // Known HTML tag names (lowercase) for JSX disambiguation
    var HTML_TAGS = {
      a:1, abbr:1, address:1, area:1, article:1, aside:1, audio:1,
      b:1, base:1, bdi:1, bdo:1, blockquote:1, body:1, br:1, button:1,
      canvas:1, caption:1, cite:1, code:1, col:1, colgroup:1,
      data:1, datalist:1, dd:1, del:1, details:1, dfn:1, dialog:1,
      div:1, dl:1, dt:1,
      em:1, embed:1,
      fieldset:1, figcaption:1, figure:1, footer:1, form:1,
      h1:1, h2:1, h3:1, h4:1, h5:1, h6:1, head:1, header:1, hgroup:1, hr:1, html:1,
      i:1, iframe:1, img:1, input:1, ins:1,
      kbd:1,
      label:1, legend:1, li:1, link:1,
      main:1, map:1, mark:1, menu:1, meta:1, meter:1,
      nav:1, noscript:1,
      object:1, ol:1, optgroup:1, option:1, output:1,
      p:1, picture:1, pre:1, progress:1,
      q:1,
      rp:1, rt:1, ruby:1,
      s:1, samp:1, script:1, section:1, select:1, slot:1, small:1,
      source:1, span:1, strong:1, style:1, sub:1, summary:1, sup:1,
      table:1, tbody:1, td:1, template:1, textarea:1, tfoot:1, th:1,
      thead:1, time:1, title:1, tr:1, track:1,
      u:1, ul:1,
      var:1, video:1,
      wbr:1
    };

    // JSX_START_KEYWORDS are tokens after which < could start JSX
    var JSX_START_KEYWORDS = {
      'return':1, 'throw':1, 'case':1, 'typeof':1, 'void':1, 'delete':1
    };

    // Previous token types that could precede JSX
    function couldPrecedeJSX(prevType) {
      if (!prevType) return true; // start of file/source
      switch (prevType) {
        case T.LP: case T.LK: case T.LB:
        case T.COMMA: case T.COLON: case T.SEMI:
        case T.EQ: case T.ASSIGN:
        case T.AMP2: case T.PIPE2:
        case T.QUESTION:
        case T.ARROW:
        case T.PLUS: case T.MINUS: case T.STAR: case T.SLASH:
        case T.LT: case T.GT: case T.LE: case T.GE:
        case T.DEQ: case T.TEQ: case T.NE: case T.NTE:
        case T.PLUS2: case T.MINUS2:
        case T.JSX_EXPRESSION_START:
          return true;
        case T.KEYWORD:
          return true;
        default:
          return false;
      }
    }

    function Token(type, value, line, col) {
      this.type = type;
      this.value = value !== undefined ? value : null;
      this.line = line;
      this.col = col;
    }

    Token.prototype.toString = function () {
      var v = this.value !== null ? ' ' + JSON.stringify(this.value) : '';
      return this.type + v;
    };

    function isDigit(c) { return c >= '0' && c <= '9'; }
    function isHex(c) { return isDigit(c) || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F'); }
    function isAlpha(c) {
      return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_' || c === '$';
    }
    function isAlphaNumeric(c) { return isAlpha(c) || isDigit(c); }
    function isWS(c) { return c === ' ' || c === '\t' || c === '\r' || c === '\n'; }

    function isUpper(c) { return c >= 'A' && c <= 'Z'; }

    function Lexer(source) {
      this.src = source;
      this.pos = 0;
      this.line = 1;
      this.col = 1;
      this.inJSX = 0;          // JSX depth: 0 = not in JSX, >0 = inside JSX children
      this.inJSXTag = false;   // currently parsing inside a JSX open tag (<div ...)
      this.jsxTagStack = [];   // stack of open tag names for matching close tags
      this.jsxBraceDepth = 0;  // depth of { } expressions inside JSX
      this._prevTokenType = null; // type of last non-JSX_TEXT token
      this._jsxPendingText = false; // need to read JSX_TEXT after tag close
    }

    var LP = Lexer.prototype;

    LP.peek = function (n) {
      return this.pos + (n || 0) < this.src.length ? this.src[this.pos + (n || 0)] : null;
    };

    LP.advance = function () {
      var c = this.src[this.pos++];
      if (c === '\n') { this.line++; this.col = 1; }
      else this.col++;
      return c;
    };

    LP.skipWS = function () {
      while (this.pos < this.src.length && isWS(this.peek())) this.advance();
    };

    LP.skipComment = function () {
      if (this.peek() === '/' && this.peek(1) === '/') {
        while (this.pos < this.src.length && this.peek() !== '\n') this.advance();
        return true;
      }
      if (this.peek() === '/' && this.peek(1) === '*') {
        this.advance(); this.advance();
        while (this.pos < this.src.length) {
          if (this.peek() === '*' && this.peek(1) === '/') {
            this.advance(); this.advance(); return true;
          }
          this.advance();
        }
        return true;
      }
      return false;
    };

    LP.skipWSAndComments = function () {
      var changed = true;
      while (changed) {
        changed = false;
        this.skipWS();
        while (this.skipComment()) { this.skipWS(); changed = true; }
      }
    };

    LP.readIdent = function () {
      var start = this.pos;
      while (this.pos < this.src.length && isAlphaNumeric(this.peek())) this.advance();
      return this.src.substring(start, this.pos);
    };

    LP.readNum = function () {
      var start = this.pos;
      while (this.pos < this.src.length && (isDigit(this.peek()) || this.peek() === '.' || this.peek() === 'x' || this.peek() === 'X' || this.peek() === 'o' || this.peek() === 'O' || this.peek() === 'b' || this.peek() === 'B' || this.peek() === '_')) this.advance();
      return this.src.substring(start, this.pos);
    };

    LP.readStr = function (quote) {
      var result = '';
      while (this.pos < this.src.length) {
        var c = this.advance();
        if (c === '\\') { result += c + this.advance(); }
        else if (c === quote) { return result; }
        else { result += c; }
      }
      return result;
    };

    LP._readJSXText = function (line, col) {
      var result = '';
      while (this.pos < this.src.length) {
        var c = this.peek();
        if (c === '<') break;
        if (c === '{') break;
        if (c === null) break;
        result += this.advance();
      }
      if (result.length === 0) return null;
      // Collapse whitespace for JSX text (trim leading/trailing on each line)
      return result;
    };

    LP._peekIdent = function () {
      var start = this.pos;
      var ident = '';
      while (start < this.src.length && isAlphaNumeric(this.src[start])) {
        ident += this.src[start];
        start++;
      }
      return ident;
    };

    LP._isJSXStart = function () {
      // Called when we see '<' and are NOT already in JSX
      // Check if next char makes this look like JSX
      var n = this.peek();
      if (n === '/') {
        // '</' — could be JSX close tag, but only valid if we were in JSX
        return false; // not in JSX, so </ is not JSX
      }
      if (n === '>') return false;
      if (n === '=') return false; // <= operator

      if (!isAlpha(n)) return false;

      var ident = this._peekIdent();
      if (!ident) return false;

      // Check if ident is a known HTML tag
      if (HTML_TAGS[ident]) return true;

      // Check if ident starts with uppercase (PascalCase component)
      if (ident.length > 0 && isUpper(ident[0])) return true;

      return false;
    };

    LP.next = function () {
      // If we're in JSX children mode, handle JSX_TEXT and structural tokens
      if (this.inJSX > 0 && !this.inJSXTag && this.jsxBraceDepth === 0) {
        this.skipWS();
        if (this.pos >= this.src.length) {
          return new Token(T.EOF, null, this.line, this.col);
        }

        var c = this.peek();
        var line = this.line;
        var col = this.col;

        // JSX expression start
        if (c === '{') {
          this.advance();
          this.jsxBraceDepth++;
          return new Token(T.JSX_EXPRESSION_START, null, line, col);
        }

        // Closing tag or child element
        if (c === '<') {
          this.advance();
          line = this.line;
          col = this.col - 1;

          // JSX close tag
          if (this.peek() === '/') {
            this.advance();
            var closeIdent = this.readIdent();
            this.skipWS();
            if (this.peek() === '>') {
              this.advance();
            }
            // Pop from tag stack
            if (this.jsxTagStack.length > 0 && this.jsxTagStack[this.jsxTagStack.length - 1] === closeIdent) {
              this.jsxTagStack.pop();
              this.inJSX--;
              if (this.inJSX <= 0) {
                this.inJSX = 0;
                this.inJSXTag = false;
              }
            }
            return new Token(T.JSX_CLOSE_TAG, closeIdent, line, col);
          }

          // Child JSX element
          var childIdent = this.readIdent();
          this.jsxTagStack.push(childIdent);
          this.inJSX++;
          this.inJSXTag = true;
          return new Token(T.JSX_TAG_OPEN, childIdent, line, col);
        }

        // JSX text
        var textVal = this._readJSXText(line, col);
        if (textVal !== null) {
          this._prevTokenType = T.JSX_TEXT;
          return new Token(T.JSX_TEXT, textVal, line, col);
        }

        // Fallback: shouldn't reach here, but if we do, advance
        return new Token(T.EOF, null, this.line, this.col);
      }

      // Normal mode or JSX-tag mode or inside JSX expression braces:
      // skip whitespace and comments
      this.skipWSAndComments();

      if (this.pos >= this.src.length) {
        return new Token(T.EOF, null, this.line, this.col);
      }

      var line = this.line;
      var col = this.col;
      var c = this.advance();

      // --- Handle } in JSX expression context ---
      // This MUST be checked before the inJSXTag section to prevent
      // expressions containing > from being incorrectly treated as tag closers
      if (this.jsxBraceDepth > 0 && c === '}') {
        this.jsxBraceDepth--;
        this._prevTokenType = T.JSX_EXPRESSION_END;
        return new Token(T.JSX_EXPRESSION_END, null, line, col);
      }

      // --- Handle { inside JSX expression (nested brace) ---
      if (this.jsxBraceDepth > 0 && c === '{') {
        this.jsxBraceDepth++;
        this._prevTokenType = T.LB;
        return new Token(T.LB, '{', line, col);
      }

      // --- If we're inside a JSX tag (parsing attributes), handle special chars ---
      // Only applies when jsxBraceDepth === 0 (not inside an expression)
      if (this.inJSXTag && this.inJSX > 0 && this.jsxBraceDepth === 0) {
        if (c === '>') {
          this.inJSXTag = false;
          this._prevTokenType = T.JSX_TAG_CLOSE;
          return new Token(T.JSX_TAG_CLOSE, null, line, col);
        }
        if (c === '/' && this.peek() === '>') {
          this.advance();
          // Self-closing: pop from tag stack
          if (this.jsxTagStack.length > 0) {
            this.jsxTagStack.pop();
            this.inJSX--;
            if (this.inJSX <= 0) {
              this.inJSX = 0;
              this.inJSXTag = false;
            }
          }
          this._prevTokenType = T.JSX_SELF_CLOSE;
          return new Token(T.JSX_SELF_CLOSE, null, line, col);
        }
        if (c === '{' && this.peek() === '.' && this.peek(1) === '.' && this.peek(2) === '.') {
          this.advance(); this.advance(); this.advance();
          this.jsxBraceDepth++;
          return new Token(T.JSX_SPREAD, null, line, col);
        }
        if (c === '{') {
          this.jsxBraceDepth++;
          return new Token(T.JSX_EXPRESSION_START, null, line, col);
        }
        // In JSX tag, identifiers and strings are attribute names/values
        if (isAlpha(c)) {
          var attrIdent = c + this.readIdent();
          this._prevTokenType = T.IDENT;
          return new Token(T.IDENT, attrIdent, line, col);
        }
        if (c === "'" || c === '"') {
          var strVal = this.readStr(c);
          this._prevTokenType = T.STR;
          return new Token(T.STR, strVal, line, col);
        }
        if (c === '=') {
          this._prevTokenType = T.EQ;
          return new Token(T.EQ, '=', line, col);
        }
        // For any other char in JSX tag, try standard operator
        return this.readOp(c, line, col);
      }

      // JSX detection: < could start JSX (only when not already in JSX)
      if (c === '<' && this.inJSX === 0 && this.jsxBraceDepth === 0) {
        var n = this.peek();

        // Standard operators: <=, <<, <<=
        if (n === '=') { this.advance(); return new Token(T.LE, '<=', line, col); }
        if (n === '<') {
          this.advance();
          if (this.peek() === '=') { this.advance(); return new Token(T.ASSIGN, '<<=', line, col); }
          return new Token(T.SHL, '<<', line, col);
        }

        // Could this be JSX? Check context and identifier
        if (couldPrecedeJSX(this._prevTokenType) && this._isJSXStart()) {
          var tagName = this.readIdent();
          this.inJSX++;
          this.inJSXTag = true;
          this.jsxTagStack.push(tagName);
          this._prevTokenType = T.JSX_TAG_OPEN;
          return new Token(T.JSX_TAG_OPEN, tagName, line, col);
        }

        // Normal less-than
        this._prevTokenType = T.LT;
        return new Token(T.LT, '<', line, col);
      }

      // Identifier / Keyword
      if (isAlpha(c)) {
        var ident = c + this.readIdent();
        if (KEYWORDS[ident]) {
          var tok = new Token(T.KEYWORD, ident, line, col);
          if (JSX_START_KEYWORDS[ident]) {
            tok._canStartJSX = true;
          }
          this._prevTokenType = T.KEYWORD;
          return tok;
        }
        this._prevTokenType = T.IDENT;
        return new Token(T.IDENT, ident, line, col);
      }

      // Numbers
      if (isDigit(c) || (c === '.' && isDigit(this.peek()))) {
        var num = c + this.readNum();
        this._prevTokenType = T.NUM;
        return new Token(T.NUM, parseFloat(num), line, col);
      }

      // Strings
      if (c === "'" || c === '"') {
        var sv = this.readStr(c);
        this._prevTokenType = T.STR;
        return new Token(T.STR, sv, line, col);
      }

      // Template literal
      if (c === '`') {
        var val = '';
        var state = 'head';
        while (this.pos < this.src.length) {
          var tc = this.peek();
          if (tc === '`') { this.advance(); state = 'tail'; break; }
          if (tc === '$' && this.peek(1) === '{') {
            this.advance(); this.advance();
            state = 'mid'; break;
          }
          val += this.advance();
        }
        var tType = T.TEMPLATE;
        if (state === 'head') { tType = T.TEMPLATE; }
        else if (state === 'mid') { tType = T.TEMPLATE_HEAD; }
        else { tType = T.TEMPLATE_TAIL; }
        this._prevTokenType = tType;
        return new Token(tType, val, line, col);
      }

      // Operators and Punctuation
      return this.readOp(c, line, col);
    };

    LP.readOp = function (c, line, col) {
      var n = this.peek();

      switch (c) {
        case '.': if (n === '.' && this.peek(1) === '.') { this.advance(); this.advance(); return new Token(T.DOT3, '...', line, col); }
                   if (isDigit(n)) { var num = c + this.readNum(); return new Token(T.NUM, parseFloat(num), line, col); }
                   this._prevTokenType = T.DOT;
                   return new Token(T.DOT, '.', line, col);
        case ',': this._prevTokenType = T.COMMA; return new Token(T.COMMA, ',', line, col);
        case ';': this._prevTokenType = T.SEMI; return new Token(T.SEMI, ';', line, col);
        case '(': this._prevTokenType = T.LP; return new Token(T.LP, '(', line, col);
        case ')': this._prevTokenType = T.RP; return new Token(T.RP, ')', line, col);
        case '{': this._prevTokenType = T.LB; return new Token(T.LB, '{', line, col);
        case '}': this._prevTokenType = T.RB; return new Token(T.RB, '}', line, col);
        case '[': this._prevTokenType = T.LK; return new Token(T.LK, '[', line, col);
        case ']': this._prevTokenType = T.RK; return new Token(T.RK, ']', line, col);
        case '?': if (n === '.') { this.advance(); this._prevTokenType = T.QDOT; return new Token(T.QDOT, '?.', line, col); }
                   if (n === '?') { this.advance(); this._prevTokenType = T.QQ; return new Token(T.QQ, '??', line, col); }
                   this._prevTokenType = T.QUESTION;
                   return new Token(T.QUESTION, '?', line, col);
        case ':': if (n === ':') { this.advance(); this._prevTokenType = T.DCOL; return new Token(T.DCOL, '::', line, col); }
                   this._prevTokenType = T.COLON;
                   return new Token(T.COLON, ':', line, col);
        case '+': if (n === '+') { this.advance(); this._prevTokenType = T.PLUS2; return new Token(T.PLUS2, '++', line, col); }
                   if (n === '=') { this.advance(); this._prevTokenType = T.ASSIGN; return new Token(T.ASSIGN, '+=', line, col); }
                   this._prevTokenType = T.PLUS;
                   return new Token(T.PLUS, '+', line, col);
        case '-': if (n === '-') { this.advance(); this._prevTokenType = T.MINUS2; return new Token(T.MINUS2, '--', line, col); }
                   if (n === '=') { this.advance(); this._prevTokenType = T.ASSIGN; return new Token(T.ASSIGN, '-=', line, col); }
                   if (n === '>') { this.advance(); this._prevTokenType = T.ARROW; return new Token(T.ARROW, '=>', line, col); }
                   this._prevTokenType = T.MINUS;
                   return new Token(T.MINUS, '-', line, col);
        case '*': if (n === '*') { this.advance(); this._prevTokenType = T.STAR2; return new Token(T.STAR2, '**', line, col); }
                   if (n === '=') { this.advance(); this._prevTokenType = T.ASSIGN; return new Token(T.ASSIGN, '*=', line, col); }
                   this._prevTokenType = T.STAR;
                   return new Token(T.STAR, '*', line, col);
        case '/': if (n === '=') { this.advance(); this._prevTokenType = T.ASSIGN; return new Token(T.ASSIGN, '/=', line, col); }
                   this._prevTokenType = T.SLASH;
                   return new Token(T.SLASH, '/', line, col);
        case '%': if (n === '=') { this.advance(); this._prevTokenType = T.ASSIGN; return new Token(T.ASSIGN, '%=', line, col); }
                   this._prevTokenType = T.PCT;
                   return new Token(T.PCT, '%', line, col);
        case '=': if (n === '=' && this.peek(1) === '=') { this.advance(); this.advance(); this._prevTokenType = T.TEQ; return new Token(T.TEQ, '===', line, col); }
                   if (n === '=') { this.advance(); this._prevTokenType = T.DEQ; return new Token(T.DEQ, '==', line, col); }
                   if (n === '>') { this.advance(); this._prevTokenType = T.ARROW; return new Token(T.ARROW, '=>', line, col); }
                   this._prevTokenType = T.EQ;
                   return new Token(T.EQ, '=', line, col);
        case '!': if (n === '=' && this.peek(1) === '=') { this.advance(); this.advance(); this._prevTokenType = T.NTE; return new Token(T.NTE, '!==', line, col); }
                   if (n === '=') { this.advance(); this._prevTokenType = T.NE; return new Token(T.NE, '!=', line, col); }
                   this._prevTokenType = T.BANG;
                   return new Token(T.BANG, '!', line, col);
        case '<': if (n === '=') { this.advance(); this._prevTokenType = T.LE; return new Token(T.LE, '<=', line, col); }
                   if (n === '<') { this.advance(); if (this.peek() === '=') { this.advance(); this._prevTokenType = T.ASSIGN; return new Token(T.ASSIGN, '<<=', line, col); }
                                    this._prevTokenType = T.SHL; return new Token(T.SHL, '<<', line, col); }
                   this._prevTokenType = T.LT;
                   return new Token(T.LT, '<', line, col);
        case '>': if (n === '=') { this.advance(); this._prevTokenType = T.GE; return new Token(T.GE, '>=', line, col); }
                   if (n === '>' && this.peek(1) === '>') { this.advance(); this.advance(); this._prevTokenType = T.SHRU; return new Token(T.SHRU, '>>>', line, col); }
                   if (n === '>') { this.advance(); if (this.peek() === '=') { this.advance(); this._prevTokenType = T.ASSIGN; return new Token(T.ASSIGN, '>>=', line, col); }
                                     this._prevTokenType = T.SHR; return new Token(T.SHR, '>>', line, col); }
                   this._prevTokenType = T.GT;
                   return new Token(T.GT, '>', line, col);
        case '&': if (n === '&') { this.advance(); this._prevTokenType = T.AMP2; return new Token(T.AMP2, '&&', line, col); }
                   if (n === '=') { this.advance(); this._prevTokenType = T.ASSIGN; return new Token(T.ASSIGN, '&=', line, col); }
                   this._prevTokenType = T.AMP;
                   return new Token(T.AMP, '&', line, col);
        case '|': if (n === '|') { this.advance(); this._prevTokenType = T.PIPE2; return new Token(T.PIPE2, '||', line, col); }
                   if (n === '=') { this.advance(); this._prevTokenType = T.ASSIGN; return new Token(T.ASSIGN, '|=', line, col); }
                   this._prevTokenType = T.PIPE;
                   return new Token(T.PIPE, '|', line, col);
        case '^': if (n === '=') { this.advance(); this._prevTokenType = T.ASSIGN; return new Token(T.ASSIGN, '^=', line, col); }
                   this._prevTokenType = T.CARET;
                   return new Token(T.CARET, '^', line, col);
        case '~': this._prevTokenType = T.TILDE; return new Token(T.TILDE, '~', line, col);
        default:
          this._prevTokenType = T.EOF;
          return new Token(T.EOF, null, line, col);
      }
    };

    LP.scan = function () {
      var tokens = [];
      var t;
      while ((t = this.next()).type !== T.EOF) {
        tokens.push(t);
      }
      tokens.push(t);
      return tokens;
    };

    var lexer = {
      Token: Token,
      T: T,
      Lexer: Lexer,
      HTML_TAGS: HTML_TAGS,
      tokenize: function (source) {
        return new Lexer(source).scan();
      }
    };

    Object.freeze(lexer);
    Object.freeze(T);

    return lexer;
  });
})();
