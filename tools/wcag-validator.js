(function () {
  'use strict';

  GlassHouse.define('wcag-validator', ['types'], function (T) {

    // --- Color utilities ---

    function hexToRgb(hex) {
      hex = hex.replace(/^#/, '');
      if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
      if (hex.length === 4) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
      return {
        r: parseInt(hex.substring(0, 2), 16),
        g: parseInt(hex.substring(2, 4), 16),
        b: parseInt(hex.substring(4, 6), 16)
      };
    }

    function srgbToLinear(c) {
      c = c / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }

    function relativeLuminance(rgb) {
      return 0.2126 * srgbToLinear(rgb.r) +
             0.7152 * srgbToLinear(rgb.g) +
             0.0722 * srgbToLinear(rgb.b);
    }

    function contrastRatio(hex1, hex2) {
      var l1 = relativeLuminance(hexToRgb(hex1));
      var l2 = relativeLuminance(hexToRgb(hex2));
      var lighter = Math.max(l1, l2);
      var darker = Math.min(l1, l2);
      return (lighter + 0.05) / (darker + 0.05);
    }

    function isLightColor(hex) {
      return relativeLuminance(hexToRgb(hex)) > 0.5;
    }

    // --- Validation ---

    var violations = [];

    function reset() { violations = []; }

    function add(severity, rule, message) {
      violations.push({ severity: severity, rule: rule, message: message });
    }

    function checkContrastPair(fg, bg, context, size) {
      var ratio = contrastRatio(fg, bg);
      var threshold = (size === 'large' || size === 'heading') ? 3.0 : 4.5;
      var sizeLabel = size === 'large' ? 'large text' : size === 'heading' ? 'heading' : 'normal text';
      var passed = ratio >= threshold;

      if (!passed) {
        add('error', 'WCAG_CONTRAST',
          context + ': contrast ' + ratio.toFixed(2) + ':1 < ' + threshold + ':1 required for ' + sizeLabel +
          ' (' + fg + ' on ' + bg + ')');
      }

      return { passed: passed, ratio: ratio };
    }

    function validateTheme(theme) {
      reset();

      if (!theme || !theme.colors) {
        add('error', 'WCAG_STRUCTURE', 'Theme must define colors');
        return { passed: false, violations: violations.slice() };
      }

      var colors = theme.colors;
      var required = ['text', 'background', 'primary'];

      for (var i = 0; i < required.length; i++) {
        if (!colors[required[i]]) {
          add('error', 'WCAG_STRUCTURE',
            'Theme missing required color "' + required[i] + '"');
        }
      }

      if (colors.text && colors.background) {
        checkContrastPair(colors.text, colors.background, 'Body text', 'normal');
      }

      if (colors.heading && colors.background) {
        checkContrastPair(colors.heading, colors.background, 'Heading text', 'heading');
      }

      if (colors.primary && colors.background) {
        checkContrastPair(colors.primary, colors.background, 'Primary accent', 'normal');
      }

      if (colors.muted && colors.background) {
        var c = checkContrastPair(colors.muted, colors.background, 'Muted/secondary text', 'normal');
        if (!c.passed) {
          add('warning', 'WCAG_CONTRAST',
            'Muted text on background contrast is ' + c.ratio.toFixed(2) + ':1 (non-critical)');
        }
      }

      if (colors.buttonText && colors.primary) {
        checkContrastPair(colors.buttonText, colors.primary, 'Button text on primary', 'normal');
      }

      if (colors.link) {
        checkContrastPair(colors.link, colors.background, 'Link color', 'normal');
      }

      if (colors.border) {
        var bc = contrastRatio(colors.border, colors.background);
        if (bc < 3.0) {
          add('warning', 'WCAG_CONTRAST',
            'Border contrast ' + bc.toFixed(2) + ':1 is low; borders should be distinguishable');
        }
      }

      if (colors.error || colors.success || colors.warning) {
        var statusColors = ['error', 'success', 'warning'];
        for (var i = 0; i < statusColors.length; i++) {
          var sc = statusColors[i];
          if (colors[sc] && colors.background) {
            var sr = contrastRatio(colors[sc], colors.background);
            if (sr < 3.0) {
              add('error', 'WCAG_CONTRAST', sc + ' color on background contrast ' + sr.toFixed(2) + ':1 < 3:1 (large text threshold)');
            } else if (sr < 4.5) {
              add('warning', 'WCAG_CONTRAST', sc + ' color on background contrast ' + sr.toFixed(2) + ':1 — consider darkening for body-text use');
            }
          }
        }
      }

      if (theme.fonts) {
        checkFontSizes(theme);
      }

      checkFocusIndicator(theme);
      checkReducedMotion(theme);
      checkTouchTargets(theme);

      var errors = violations.filter(function (v) { return v.severity === 'error'; });
      return {
        passed: errors.length === 0,
        violations: violations.slice(),
        errors: errors,
        warnings: violations.filter(function (v) { return v.severity === 'warning'; })
      };
    }

    function checkFontSizes(theme) {
      var fonts = theme.fonts;
      if (!fonts) return;

      var baseSize = fonts.baseSize || '16px';
      var bodyFont = fonts.body || fonts.baseSize || '16px';

      if (typeof baseSize === 'number') baseSize += 'px';

      var pxMatch = baseSize.match(/^(\d+)/);
      if (pxMatch && parseInt(pxMatch[1], 10) < 12) {
        add('error', 'WCAG_FONT_SIZE',
          'Base font size ' + baseSize + ' is below 12px minimum');
      } else if (pxMatch && parseInt(pxMatch[1], 10) < 14) {
        add('warning', 'WCAG_FONT_SIZE',
          'Base font size ' + baseSize + ' is below recommended 14px');
      }

      if (fonts.small && typeof fonts.small === 'number' && fonts.small < 10) {
        add('warning', 'WCAG_FONT_SIZE',
          'Small text size ' + fonts.small + 'px may be hard to read');
      }
    }

    function checkFocusIndicator(theme) {
      var focus = theme.focus || theme.colors && theme.colors.focus;

      if (!focus && theme.colors && theme.colors.primary) {
        focus = theme.colors.primary;
      }

      if (!focus) {
        add('error', 'WCAG_FOCUS',
          'Theme must define a focus indicator color via focus or colors.focus');
        return;
      }

      if (theme.colors && theme.colors.background) {
        var cr = contrastRatio(focus, theme.colors.background);
        if (cr < 3.0) {
          add('error', 'WCAG_FOCUS',
            'Focus indicator contrast ' + cr.toFixed(2) + ':1 < 3:1 minimum (' +
            focus + ' on ' + theme.colors.background + ')');
        }
      }
    }

    function checkReducedMotion(theme) {
      if (!theme.reduceMotion) {
        add('warning', 'WCAG_MOTION',
          'Theme should define reduceMotion preferences or animations');
      }
    }

    function checkTouchTargets(theme) {
      var targets = theme.touchTargets || theme.interactive;

      if (!targets) {
        add('warning', 'WCAG_TOUCH',
          'Theme does not specify touch target sizes; minimum is 44x44px');
        return;
      }

      var minSize = targets.minSize || targets.min;

      if (typeof minSize === 'string') {
        var px = parseInt(minSize, 10);
        if (px < 44) {
          add('warning', 'WCAG_TOUCH',
            'Touch target size ' + minSize + ' < 44px recommended minimum');
        }
      }
    }

    function validateCSS(cssText) {
      reset();

      if (cssText.indexOf(':focus-visible') === -1 && cssText.indexOf(':focus') === -1) {
        add('error', 'WCAG_FOCUS', 'CSS must include :focus-visible or :focus styles');
      }

      if (cssText.indexOf('prefers-reduced-motion') === -1) {
        add('warning', 'WCAG_MOTION',
          'CSS should include @media (prefers-reduced-motion: reduce) block');
      }

      if (cssText.indexOf('font-size') === -1) {
        add('warning', 'WCAG_FONT_SIZE', 'CSS does not set font-size');
      }

      var minPXMatch = cssText.match(/min-(?:width|height)\s*:\s*(\d+)px/g);
      if (minPXMatch) {
        for (var i = 0; i < minPXMatch.length; i++) {
          var size = parseInt(minPXMatch[i].match(/(\d+)px/)[1], 10);
          if (size < 44) {
            add('warning', 'WCAG_TOUCH',
              'Touch target size ' + size + 'px < 44px (consider increasing)');
          }
        }
      }

      var errors = violations.filter(function (v) { return v.severity === 'error'; });
      return {
        passed: errors.length === 0,
        violations: violations.slice(),
        errors: errors,
        warnings: violations.filter(function (v) { return v.severity === 'warning'; })
      };
    }

    var wcag = {
      contrastRatio: contrastRatio,
      hexToRgb: hexToRgb,
      relativeLuminance: relativeLuminance,
      isLightColor: isLightColor,
      validateTheme: validateTheme,
      validateCSS: validateCSS,
      checkContrastPair: checkContrastPair,
      violations: function () { return violations.slice(); },
      reset: reset
    };

    return wcag;
  });
})();
