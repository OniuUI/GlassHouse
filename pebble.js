(function () {
  'use strict';

  GlassHouse.define('pebble', ['dom', 'types', 'vnode'], function (dom, T, vnodeModule) {

    const isVNode = vnodeModule.isVNode;
    const v = vnodeModule.v;

    function Pebble(config) {
      var self = this;

      self._id = 'pebble-' + (Pebble._nextId++);
      self._config = config || {};
      self._state = {};
      self._props = {};
      self._propTypes = self._config.propTypes || null;
      self._stateTypes = self._config.stateTypes || null;
      self._el = null;
      self._mounted = false;
      self._children = [];
      self._offHandlers = [];
      self._delegates = [];
      self._renderTimer = null;
      self._renderCount = 0;
      self._totalRenderTime = 0;
      self._handlerDeps = self._config.handlers || [];
      self._handlerCache = Object.create(null);

      // Detect React-style lifecycle methods
      self._hasRender = typeof self._config.render === 'function';
      self._hasTemplate = typeof self._config.template === 'function';
      self._hasComponentDidMount = typeof self._config.componentDidMount === 'function';
      self._hasComponentDidUpdate = typeof self._config.componentDidUpdate === 'function';
      self._hasComponentWillUnmount = typeof self._config.componentWillUnmount === 'function';

      if (self._hasRender && !self._hasTemplate) {
        self._config.template = self._config.render;
      }

      if (self._config.props) {
        if (self._propTypes) {
          T.assert(self._config.props, T.shape(self._propTypes), self._id + ' props');
        }
        var pKeys = Object.keys(self._config.props);
        for (var j = 0; j < pKeys.length; j++) {
          self._props[pKeys[j]] = self._config.props[pKeys[j]];
        }
        Object.freeze(self._props);
      }

      if (self._config.state) {
        if (self._stateTypes) {
          T.assert(self._config.state, T.shape(self._stateTypes), self._id + ' initial state');
        }
        var stateKeys = Object.keys(self._config.state);
        for (var i = 0; i < stateKeys.length; i++) {
          self._state[stateKeys[i]] = self._config.state[stateKeys[i]];
        }
      }

      Object.defineProperty(self, 'state', {
        get: function () { return self._state; },
        enumerable: true,
        configurable: false
      });

      Object.defineProperty(self, 'props', {
        get: function () { return self._props; },
        enumerable: true,
        configurable: false
      });

      Object.defineProperty(self, 'propTypes', {
        get: function () { return self._propTypes; },
        enumerable: true,
        configurable: false
      });

      Object.defineProperty(self, 'stateTypes', {
        get: function () { return self._stateTypes; },
        enumerable: true,
        configurable: false
      });

      // Bind convenience alias for v()
      self.v = v;

      if (typeof self._config.onInit === 'function') {
        self._config.onInit.call(self);
      }

      var reserved = {
        state:1, props:1, propTypes:1, stateTypes:1,
        template:1, render:1, delegates:1, onInit:1, onMount:1,
        onUpdate:1, onRemove:1, handlers:1,
        componentDidMount:1, componentDidUpdate:1, componentWillUnmount:1,
        v:1
      };
      var cfgKeys = Object.keys(self._config);
      for (var k = 0; k < cfgKeys.length; k++) {
        var key = cfgKeys[k];
        if (!reserved[key] && typeof self._config[key] === 'function') {
          self[key] = self._config[key].bind(self);
        }
      }
    }

    Pebble._nextId = 1;

    var proto = Pebble.prototype;

    function bindDelegates(pebble) {
      var delegates = pebble._config.delegates || {};
      var keys = Object.keys(delegates);
      for (var i = 0; i < keys.length; i++) {
        var spec = delegates[keys[i]];
        var parts = keys[i].split(' ');
        var event = parts[0];
        var selector = parts.slice(1).join(' ');
        pebble.delegate(event, selector, spec);
      }
    }

    function buildElement(pebble) {
      var start = performance.now();
      var prev = pebble._el;

      var templateOutput = pebble._config.template.call(pebble, pebble._state);
      var newEl;

      // Proper VNode object (from vnode module)
      if (isVNode(templateOutput)) {
        newEl = dom.render(templateOutput);
      }
      // Legacy VNode (_t === 1) — backward compat with deprecation warning
      else if (templateOutput && typeof templateOutput === 'object' && templateOutput._t === 1) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn(
            'Pebble "' + pebble._id + '": Legacy _t=1 VNode detected. ' +
            'Migrate to GlassHouse.require("vnode").v()'
          );
        }
        newEl = dom.render(templateOutput);
      }
      // Array of VNodes → wrap in container vnode
      else if (Array.isArray(templateOutput)) {
        var validVNodes = [];
        for (var ai = 0; ai < templateOutput.length; ai++) {
          var child = templateOutput[ai];
          if (isVNode(child) || (child && child._t === 1)) {
            validVNodes.push(child);
            newEl = dom.render(child);
            continue;
          }
          if (typeof child === 'string' || typeof child === 'number') {
            var wrapper = document.createElement('span');
            wrapper.textContent = String(child);
            if (!newEl) {
              newEl = document.createElement('div');
              newEl.appendChild(wrapper);
            } else {
              if (prev && pebble._mounted && newEl.parentNode) {
                newEl.parentNode.insertBefore(wrapper, newEl.nextSibling);
              }
            }
          }
        }
        if (!newEl && validVNodes.length > 0) {
          newEl = dom.render(validVNodes[0]);
        }
        if (!newEl) {
          newEl = document.createElement('div');
        }
      }
      // String templates are deprecated — throw error
      else if (typeof templateOutput === 'string') {
        throw new TypeError(
          'Pebble "' + pebble._id + '": String templates are deprecated. ' +
          'Pebble templates must return VNode objects. Use this.v() or TSX.'
        );
      }
      // Unknown return type
      else {
        throw new TypeError(
          'Pebble "' + pebble._id + '": template must return a VNode object, ' +
          'array of VNodes, or be compiled from TSX. Got: ' + typeof templateOutput
        );
      }

      newEl.setAttribute('data-pebble', pebble._id);

      if (prev && pebble._mounted) {
        prev.parentNode.replaceChild(newEl, prev);
      }

      pebble._el = newEl;
      pebble._renderCount++;
      pebble._totalRenderTime += performance.now() - start;

      bindDelegates(pebble);

      return newEl;
    }

    proto.render = function () {
      return buildElement(this);
    };

    proto.mount = function (container) {
      var el;

      if (typeof container === 'string') {
        el = document.getElementById(container) || document.querySelector(container);
      } else if (container && container.nodeType) {
        el = container;
      } else {
        throw new Error('Pebble mount: invalid container ' + container);
      }

      if (!el) {
        throw new Error('Pebble mount: container "' + container + '" not found');
      }

      buildElement(this);
      el.appendChild(this._el);
      this._mounted = true;
      this._container = el;

      for (var i = 0; i < this._handlerDeps.length; i++) {
        if (!GlassHouse.getHandler(this._handlerDeps[i])) {
          throw new Error(
            'Pebble "' + this._id + '" declares handler "' + this._handlerDeps[i] +
            '" but it is not registered. Available: ' +
            (GlassHouse.listHandlers().map(function (h) { return h.name; }).join(', ') || 'none')
          );
        }
      }

      // Call onMount lifecycle
      if (typeof this._config.onMount === 'function') {
        this._config.onMount.call(this);
      }

      // Call React-style componentDidMount if defined
      if (this._hasComponentDidMount && typeof this._config.componentDidMount === 'function') {
        this._config.componentDidMount.call(this);
      }

      return this;
    };

    proto.setState = function (partial) {
      var self = this;
      var prev = Object.assign({}, self._state);

      if (self._stateTypes) {
        var merged = Object.assign({}, self._state, partial);
        T.assert(merged, T.optional(T.shape(self._stateTypes)), self._id + ' setState');
      }

      var keys = Object.keys(partial);
      for (var i = 0; i < keys.length; i++) {
        self._state[keys[i]] = partial[keys[i]];
      }

      if (!self._mounted) return;

      if (self._renderTimer) {
        clearTimeout(self._renderTimer);
      }

      self._renderTimer = setTimeout(function () {
        var prevProps = Object.assign({}, self._props);
        buildElement(self);

        // Call legacy onUpdate
        if (typeof self._config.onUpdate === 'function') {
          self._config.onUpdate.call(self, prev);
        }

        // Call React-style componentDidUpdate(prevProps, prevState)
        if (self._hasComponentDidUpdate && typeof self._config.componentDidUpdate === 'function') {
          self._config.componentDidUpdate.call(self, prevProps, prev);
        }
      }, 0);

      return self;
    };

    proto.delegate = function (event, selector, handler) {
      var self = this;

      function bound(e) {
        var target = e.target;
        while (target && target !== self._el) {
          if (target.matches(selector)) {
            handler.call(self, e, target);
            return;
          }
          target = target.parentNode;
        }
      }

      if (!self._el) {
        self._offHandlers.push(function () {});
        return self;
      }

      self._el.addEventListener(event, bound);
      self._delegates.push({ event: event, handler: bound, selector: selector });

      return self;
    };

    proto.$ = function (selector) {
      return this._el ? this._el.querySelector(selector) : null;
    };

    proto.$$ = function (selector) {
      return this._el ? this._el.querySelectorAll(selector) : [];
    };

    // el() convenience method — still creates VNodes but using the formalized symbol
    proto.el = function (tag, attrs, children) {
      return v(tag, attrs || {}, children || []);
    };

    proto.use = function (handlerName) {
      if (this._handlerCache[handlerName]) {
        return this._handlerCache[handlerName];
      }

      try {
        this._handlerCache[handlerName] = GlassHouse.getHandler(handlerName);
      } catch (e) {
        throw new Error(
          'Pebble "' + this._id + '" requires handler "' + handlerName +
          '" which is not registered. Declared handlers: ' +
          (this._handlerDeps.length > 0 ? this._handlerDeps.join(', ') : 'none') +
          '. Error: ' + e.message
        );
      }

      return this._handlerCache[handlerName];
    };

    proto.getHandlers = function () {
      return this._handlerDeps.slice();
    };

    proto.getRenderStats = function () {
      return {
        count: this._renderCount,
        totalTime: parseFloat(this._totalRenderTime.toFixed(2)),
        averageTime: this._renderCount > 0
          ? parseFloat((this._totalRenderTime / this._renderCount).toFixed(2))
          : 0
      };
    };

    proto.destroy = function () {
      var self = this;

      if (self._renderTimer) {
        clearTimeout(self._renderTimer);
        self._renderTimer = null;
      }

      for (var i = 0; i < self._children.length; i++) {
        if (typeof self._children[i].destroy === 'function') {
          self._children[i].destroy();
        }
      }
      self._children = [];

      for (var i = 0; i < self._delegates.length; i++) {
        var d = self._delegates[i];
        if (self._el) {
          self._el.removeEventListener(d.event, d.handler);
        }
      }
      self._delegates = [];

      for (var i = 0; i < self._offHandlers.length; i++) {
        self._offHandlers[i]();
      }
      self._offHandlers = [];

      // Call React-style componentWillUnmount
      if (self._hasComponentWillUnmount && typeof self._config.componentWillUnmount === 'function') {
        self._config.componentWillUnmount.call(self);
      }

      // Call legacy onRemove
      if (typeof self._config.onRemove === 'function') {
        self._config.onRemove.call(self);
      }

      var domRef = null;
      try { domRef = GlassHouse.require('dom'); } catch (e) {}

      if (domRef && self._el && self._el.parentNode) {
        domRef.remove(self._el);
      } else if (self._el && self._el.parentNode) {
        self._el.parentNode.removeChild(self._el);
      }

      self._el = null;
      self._mounted = false;
      self._container = null;
    };

    return Pebble;
  });
})();
