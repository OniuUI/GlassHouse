(function () {
  'use strict';

  GlassHouse.define('pane', ['pebble', 'shine', 'handler', 'types'], function (Pebble, Shine, handlerModule, T) {

    var installedPanes = Object.create(null);
    var activePane = null;

    function Pane(config) {
      var self = this;

      if (!config || !config.name) throw new Error('Pane requires a name');
      if (!config.pebbles && !config.shines && !config.handlers) {
        throw new Error('Pane "' + config.name + '" must declare at least one: pebbles, shines, or handlers');
      }

      self._id = 'pane-' + (Pane._nextId++);
      self._name = config.name;
      self._version = config.version || '0.1.0';
      self._config = config;
      self._pebbles = config.pebbles || [];
      self._shines = config.shines || [];
      self._handlers = config.handlers || [];
      self._active = false;
      self._container = null;
      self._instances = Object.create(null);

      installedPanes[self._name] = self;

      if (typeof config.onInit === 'function') {
        config.onInit.call(self);
      }
    }

    Pane._nextId = 1;

    var PP = Pane.prototype;

    PP.resolve = function () {
      var self = this;
      var missingPebbles = [];
      var missingShines = [];
      var missingHandlers = [];

      for (var i = 0; i < self._pebbles.length; i++) {
        try { GlassHouse.require(self._pebbles[i]); } catch (e) { missingPebbles.push(self._pebbles[i]); }
      }

      for (var i = 0; i < self._shines.length; i++) {
        try { GlassHouse.require(self._shines[i]); } catch (e) { missingShines.push(self._shines[i]); }
      }

      for (var i = 0; i < self._handlers.length; i++) {
        if (!handlerModule.isRegistered(self._handlers[i])) { missingHandlers.push(self._handlers[i]); }
        else { handlerModule.get(self._handlers[i]); }
      }

      var errors = [];
      if (missingPebbles.length) errors.push('Missing pebbles: ' + missingPebbles.join(', '));
      if (missingShines.length) errors.push('Missing shines: ' + missingShines.join(', '));
      if (missingHandlers.length) errors.push('Missing handlers: ' + missingHandlers.join(', '));

      return { resolved: errors.length === 0, errors: errors };
    };

    PP.activate = function (container) {
      var self = this;

      var resolution = self.resolve();
      if (!resolution.resolved) {
        throw new Error('Pane "' + self._name + '" cannot activate: ' + resolution.errors.join('; '));
      }

      if (typeof container === 'string') {
        container = document.getElementById(container) || document.querySelector(container);
      }

      self._container = container;

      for (var i = 0; i < self._shines.length; i++) {
        try { Shine.apply(self._shines[i]); } catch (e) {}
      }

      if (typeof self._config.layout === 'function') {
        self._config.layout.call(self, container);
      }

      if (activePane && activePane !== self && typeof activePane._config.onDeactivate === 'function') {
        activePane._config.onDeactivate.call(activePane);
      }

      activePane = self;
      self._active = true;

      if (typeof self._config.onActivate === 'function') {
        self._config.onActivate.call(self);
      }

      return self;
    };

    PP.deactivate = function () {
      var self = this;

      var names = Object.keys(self._instances);
      for (var i = 0; i < names.length; i++) {
        var inst = self._instances[names[i]];
        if (inst && typeof inst.destroy === 'function') {
          inst.destroy();
        }
      }
      self._instances = Object.create(null);

      self._active = false;
      if (activePane === self) activePane = null;

      if (typeof self._config.onDeactivate === 'function') {
        self._config.onDeactivate.call(self);
      }
    };

    PP.getShines = function () { return this._shines.slice(); };
    PP.getPebbles = function () { return this._pebbles.slice(); };
    PP.getHandlers = function () { return this._handlers.slice(); };

    PP.destroy = function () {
      this.deactivate();
      delete installedPanes[this._name];
    };

    Pane.getActive = function () { return activePane; };

    Pane.get = function (name) { return installedPanes[name] || null; };

    Pane.getAll = function () {
      return Object.keys(installedPanes).map(function (k) { return installedPanes[k]; });
    };

    Pane.activate = function (name, container) {
      var p = installedPanes[name];
      if (!p) throw new Error('Pane "' + name + '" not found');
      return p.activate(container);
    };

    return Pane;
  });
})();
