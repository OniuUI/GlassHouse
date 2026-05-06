(function () {
  'use strict';

  GlassHouse.define('dom', ['vnode'], function (vnodeModule) {
    'use strict';

    const VNODE_TYPE = vnodeModule.VNODE_TYPE;
    const isVNode = vnodeModule.isVNode;
    const v = vnodeModule.v;

    const dom = {
      el: function (tag, attrs, children) {
        const element = document.createElement(tag);

        if (attrs) {
          const keys = Object.keys(attrs);
          for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const value = attrs[key];
            if (key === 'className') {
              element.className = value;
            } else if (key === 'text') {
              element.textContent = value;
            } else if (key === 'html') {
              throw new Error(
                'dom.el: "html" attribute forbidden. Use children or dom.safe()'
              );
            } else if (key.indexOf('on') === 0) {
              throw new Error(
                'dom.el: Inline event handlers forbidden. Use addEventListener'
              );
            } else if (value === false || value === null || value === undefined) {
              element.removeAttribute(key);
            } else {
              element.setAttribute(key, String(value));
            }
          }
        }

        if (children !== undefined) {
          if (typeof children === 'string' || typeof children === 'number') {
            element.textContent = String(children);
          } else if (Array.isArray(children)) {
            for (let i = 0; i < children.length; i++) {
              const child = children[i];
              if (child === null || child === undefined || child === false) {
                continue;
              }
              if (typeof child === 'string' || typeof child === 'number') {
                element.appendChild(document.createTextNode(String(child)));
              } else if (child.nodeType) {
                element.appendChild(child);
              } else {
                element.appendChild(document.createTextNode(String(child)));
              }
            }
          } else if (children.nodeType) {
            element.appendChild(children);
          }
        }

        return element;
      },

      text: function (content) {
        return document.createTextNode(String(content));
      },

      safe: function (htmlString) {
        const template = document.createElement('template');
        template.innerHTML = htmlString.trim();
        const frag = template.content;
        const scripts = frag.querySelectorAll('script');
        for (let i = 0; i < scripts.length; i++) {
          scripts[i].remove();
        }
        const nodes = frag.querySelectorAll('*');
        for (let i = 0; i < nodes.length; i++) {
          const attrs = nodes[i].attributes;
          for (let j = attrs.length - 1; j >= 0; j--) {
            const a = attrs[j];
            if (a.name.indexOf('on') === 0) {
              nodes[i].removeAttribute(a.name);
            }
          }
        }
        return frag;
      },

      escape: function (str) {
        const div = document.createElement('div');
        div.appendChild(document.createTextNode(String(str)));
        return div.innerHTML;
      },

      render: function (node) {
        if (node === null || node === undefined || node === false) {
          return document.createTextNode('');
        }
        if (typeof node === 'string' || typeof node === 'number') {
          return document.createTextNode(String(node));
        }
        if (Array.isArray(node)) {
          const frag = document.createDocumentFragment();
          for (let ri = 0; ri < node.length; ri++) {
            const c = dom.render(node[ri]);
            if (c) frag.appendChild(c);
          }
          return frag;
        }

        // Check for proper VNode type (new formalized symbol)
        const isProperVNode = isVNode(node);

        // Backward compat with old _t === 1
        const isLegacyVNode = !isProperVNode && node && node._t === 1;

        if (isLegacyVNode) {
          if (typeof console !== 'undefined' && console.warn) {
            console.warn(
              'dom.render: Legacy _t=1 VNode detected. ' +
              'Migrate to GlassHouse vnode module. ' +
              'Tag: ' + (node.tag || 'unknown')
            );
          }
        }

        if (!isProperVNode && !isLegacyVNode) {
          return document.createTextNode(String(node));
        }

        const el = document.createElement(node.tag);
        const attrs = node.attr || node.attrs || {};
        const attrKeys = Object.keys(attrs);
        for (let ai = 0; ai < attrKeys.length; ai++) {
          const k = attrKeys[ai];
          const val = attrs[k];
          if (val === false || val === null || val === undefined) continue;
          if (k.indexOf('on') === 0) {
            throw new Error('dom.render: inline event handlers forbidden ("' + k + '")');
          }
          if (k === 'className') {
            el.className = String(val);
          } else {
            el.setAttribute(k, String(val));
          }
        }

        const kids = node.kids || [];
        for (let ki = 0; ki < kids.length; ki++) {
          const child = kids[ki];
          if (child === null || child === false || child === undefined) continue;
          el.appendChild(dom.render(child));
        }

        return el;
      },

      renderToString: function (node) {
        if (node === null || node === undefined || node === false) {
          return '';
        }
        if (typeof node === 'string' || typeof node === 'number') {
          return dom.escape(String(node));
        }
        if (Array.isArray(node)) {
          let out = '';
          for (let i = 0; i < node.length; i++) {
            out += dom.renderToString(node[i]);
          }
          return out;
        }

        const isProperVNode = isVNode(node);
        const isLegacyVNode = !isProperVNode && node && node._t === 1;

        if (!isProperVNode && !isLegacyVNode) {
          return dom.escape(String(node));
        }

        const attrs = node.attr || node.attrs || {};
        let attrStr = '';
        const attrKeys = Object.keys(attrs);
        for (let i = 0; i < attrKeys.length; i++) {
          const k = attrKeys[i];
          const val = attrs[k];
          if (val === false || val === null || val === undefined) continue;
          if (k.indexOf('on') === 0) continue;
          if (k === 'className') {
            attrStr += ' class="' + dom.escape(String(val)) + '"';
          } else {
            attrStr += ' ' + k + '="' + dom.escape(String(val)) + '"';
          }
        }

        const kids = node.kids || [];
        if (kids.length === 0) {
          const voidElements = {
            area:1, base:1, br:1, col:1, embed:1, hr:1, img:1, input:1,
            link:1, meta:1, param:1, source:1, track:1, wbr:1
          };
          if (voidElements[node.tag]) {
            return '<' + node.tag + attrStr + '>';
          }
          return '<' + node.tag + attrStr + '></' + node.tag + '>';
        }

        let inner = '';
        for (let i = 0; i < kids.length; i++) {
          inner += dom.renderToString(kids[i]);
        }
        return '<' + node.tag + attrStr + '>' + inner + '</' + node.tag + '>';
      },

      on: function (el, event, handler, options) {
        el.addEventListener(event, handler, options);
        return function () {
          el.removeEventListener(event, handler, options);
        };
      },

      css: function (el, styles) {
        const keys = Object.keys(styles);
        for (let i = 0; i < keys.length; i++) {
          el.style[keys[i]] = styles[keys[i]];
        }
      },

      addClass: function (el, className) {
        el.classList.add(className);
      },

      removeClass: function (el, className) {
        el.classList.remove(className);
      },

      toggleClass: function (el, className) {
        el.classList.toggle(className);
      },

      qs: function (selector, parent) {
        return (parent || document).querySelector(selector);
      },

      qsa: function (selector, parent) {
        return (parent || document).querySelectorAll(selector);
      },

      append: function (parent, child) {
        if (typeof child === 'string') {
          parent.appendChild(dom.text(child));
        } else if (child.nodeType) {
          parent.appendChild(child);
        } else if (child instanceof DocumentFragment) {
          parent.appendChild(child);
        }
        return parent;
      },

      remove: function (el) {
        if (el && el.parentNode) {
          el.parentNode.removeChild(el);
        }
      },

      empty: function (el) {
        while (el.firstChild) {
          el.removeChild(el.firstChild);
        }
      },

      replace: function (oldEl, newEl) {
        if (oldEl && oldEl.parentNode) {
          oldEl.parentNode.replaceChild(newEl, oldEl);
        }
      },

      batch: function (fn) {
        const frag = document.createDocumentFragment();
        const result = fn(frag);
        return result || frag;
      }
    };

    Object.freeze(dom);

    return dom;
  });
})();
