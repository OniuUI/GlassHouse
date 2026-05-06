(function () {
  'use strict';

  GlassHouse.define('shine', ['types', 'wcag-validator', 'dom'], function (T, wcag, dom) {

    var installedShines = {};
    var activeShine = null;

    function Shine(config) {
      var self = this;

      if (!config || !config.name) {
        throw new Error('Shine requires a name');
      }

      if (!config.theme) {
        throw new Error('Shine "' + config.name + '" requires a theme');
      }

      self._id = 'Shine-' + (Shine._nextId++);
      self._name = config.name;
      self._config = config;
      self._theme = JSON.parse(JSON.stringify(config.theme));
      self._styleEl = null;
      self._applied = false;

      validateThemeContract(self._theme);

      if (!wcag.validateTheme(self._theme).passed) {
        var wcagResult = wcag.validateTheme(self._theme);
        console.error(
          'Shine "' + self._name + '" failed WCAG validation:',
          wcagResult.errors
        );
        throw new Error(
          'Shine "' + self._name + '" does not meet WCAG AA requirements. ' +
          wcagResult.errors.length + ' error(s): ' +
          wcagResult.errors.map(function (e) { return e.message; }).join('; ')
        );
      }

      installedShines[self._name] = self;

      if (typeof config.onInit === 'function') {
        config.onInit.call(self);
      }
    }

    Shine._nextId = 1;

    var THEME_CONTRACT = T.shape({
      colors: T.shape({
        text:       T.color,
        background: T.color,
        primary:    T.color,
        secondary:  T.optional(T.color),
        muted:      T.optional(T.color),
        heading:    T.optional(T.color),
        link:       T.optional(T.color),
        border:     T.optional(T.color),
        buttonText: T.optional(T.color),
        error:      T.optional(T.color),
        success:    T.optional(T.color),
        warning:    T.optional(T.color),
        focus:      T.optional(T.color),
      }),
      fonts: T.optional(T.shape({
        body:     T.optional(T.cssFont),
        heading:  T.optional(T.cssFont),
        mono:     T.optional(T.cssFont),
        baseSize: T.optional(T.cssLength),
      })),
      spacing: T.optional(T.record(T.string, T.cssLength)),
      radii:   T.optional(T.record(T.string, T.cssLength)),
      shadows: T.optional(T.record(T.string, T.string)),
      focus:   T.optional(T.color),
      touchTargets: T.optional(T.shape({
        minSize: T.optional(T.cssLength),
      })),
      reduceMotion: T.optional(T.boolean),
    });

    function validateThemeContract(theme) {
      var result = T.validate(theme, THEME_CONTRACT);
      if (!result.valid) {
        throw new Error('Shine theme contract invalid: ' + result.errors.join('; '));
      }
    }

    var SP = Shine.prototype;

    SP.generate = function () {
      var t = this._theme;
      var name = this._name;
      var css = '';

      css += '[data-theme="' + name + '"] {\n';

      var colors = t.colors || {};
      if (colors.text)       css += '  --clr-text: ' + colors.text + ';\n';
      if (colors.background) css += '  --clr-bg: ' + colors.background + ';\n';
      if (colors.primary)    css += '  --clr-primary: ' + colors.primary + ';\n';
      if (colors.secondary)  css += '  --clr-secondary: ' + colors.secondary + ';\n';
      if (colors.muted)      css += '  --clr-muted: ' + colors.muted + ';\n';
      if (colors.heading)    css += '  --clr-heading: ' + colors.heading + ';\n';
      if (colors.link)       css += '  --clr-link: ' + colors.link + ';\n';
      if (colors.border)     css += '  --clr-border: ' + colors.border + ';\n';
      if (colors.buttonText) css += '  --clr-btn-text: ' + colors.buttonText + ';\n';
      if (colors.error)      css += '  --clr-error: ' + colors.error + ';\n';
      if (colors.success)    css += '  --clr-success: ' + colors.success + ';\n';
      if (colors.warning)    css += '  --clr-warning: ' + colors.warning + ';\n';

      var fonts = t.fonts || {};
      if (fonts.body)    css += '  --font-body: ' + fonts.body + ';\n';
      if (fonts.heading) css += '  --font-heading: ' + fonts.heading + ';\n';
      if (fonts.mono)    css += '  --font-mono: ' + fonts.mono + ';\n';
      if (fonts.baseSize)css += '  --font-base: ' + fonts.baseSize + ';\n';

      var spacing = t.spacing || {};
      var spKeys = Object.keys(spacing);
      for (var i = 0; i < spKeys.length; i++) {
        css += '  --sp-' + spKeys[i] + ': ' + spacing[spKeys[i]] + ';\n';
      }

      var radii = t.radii || {};
      var radKeys = Object.keys(radii);
      for (var i = 0; i < radKeys.length; i++) {
        css += '  --rad-' + radKeys[i] + ': ' + radii[radKeys[i]] + ';\n';
      }

      var shadows = t.shadows || {};
      var shdKeys = Object.keys(shadows);
      for (var i = 0; i < shdKeys.length; i++) {
        css += '  --shd-' + shdKeys[i] + ': ' + shadows[shdKeys[i]] + ';\n';
      }

      if (t.focus || (colors.focus)) {
        css += '  --fcs-clr: ' + (t.focus || colors.focus) + ';\n';
      }

      css += '\n';
      css += '  background-color: var(--clr-bg);\n';
      css += '  color: var(--clr-text);\n';
      css += '  font-family: var(--font-body);\n';
      css += '  font-size: var(--font-base);\n';
      css += '}\n\n';

      css += '[data-theme="' + name + '"] :focus-visible {\n';
      css += '  outline: 2px solid var(--fcs-clr, ' + (t.focus || colors.primary || '#3b82f6') + ');\n';
      css += '  outline-offset: 2px;\n';
      css += '}\n\n';

      if (t.touchTargets && t.touchTargets.minSize) {
        css += '[data-theme="' + name + '"] button,\n';
        css += '[data-theme="' + name + '"] a[role="button"],\n';
        css += '[data-theme="' + name + '"] input[type="submit"],\n';
        css += '[data-theme="' + name + '"] input[type="button"] {\n';
        css += '  min-width: ' + t.touchTargets.minSize + ';\n';
        css += '  min-height: ' + t.touchTargets.minSize + ';\n';
        css += '}\n';
      }

      css += '\n@media (prefers-reduced-motion: reduce) {\n';
      css += '  [data-theme="' + name + '"] *,\n';
      css += '  [data-theme="' + name + '"] *::before,\n';
      css += '  [data-theme="' + name + '"] *::after {\n';
      css += '    animation-duration: 0.01ms !important;\n';
      css += '    transition-duration: 0.01ms !important;\n';
      css += '    scroll-behavior: auto !important;\n';
      css += '  }\n';
      css += '}\n';

      return css;
    };

    SP.apply = function () {
      var css = this.generate();

      var wcagResult = wcag.validateCSS(css);
      if (!wcagResult.passed) {
        console.warn('Shine "' + this._name + '" CSS warnings:', wcagResult.warnings);
      }

      if (this._styleEl) {
        dom.remove(this._styleEl);
      }

      var style = document.createElement('style');
      style.setAttribute('data-shine', this._name);
      style.textContent = css;
      document.head.appendChild(style);
      this._styleEl = style;

      document.documentElement.setAttribute('data-theme', this._name);

      if (activeShine && activeShine !== this && typeof activeShine.onDeactivate === 'function') {
        activeShine.onDeactivate.call(activeShine);
      }

      activeShine = this;
      this._applied = true;

      if (typeof this._config.onApply === 'function') {
        this._config.onApply.call(this);
      }

      return this;
    };

    SP.unapply = function () {
      if (this._styleEl) {
        dom.remove(this._styleEl);
        this._styleEl = null;
      }

      if (activeShine === this) {
        document.documentElement.removeAttribute('data-theme');
        activeShine = null;
      }

      this._applied = false;

      if (typeof this._config.onRemove === 'function') {
        this._config.onRemove.call(this);
      }
    };

    SP.getCSS = function () {
      return this.generate();
    };

    SP.getTheme = function () {
      return JSON.parse(JSON.stringify(this._theme));
    };

    SP.destroy = function () {
      this.unapply();
      delete installedShines[this._name];
    };

    Shine.getActive = function () {
      return activeShine;
    };

    Shine.get = function (name) {
      return installedShines[name] || null;
    };

    Shine.getAll = function () {
      return Object.keys(installedShines).map(function (k) {
        return installedShines[k];
      });
    };

    Shine.apply = function (name) {
      var s = installedShines[name];
      if (!s) throw new Error('Shine "' + name + '" not found');
      s.apply();
      return s;
    };

    Shine.THEME_CONTRACT = THEME_CONTRACT;

    return Shine;
  });
})();
