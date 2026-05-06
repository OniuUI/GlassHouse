(function () {
  'use strict';

  GlassHouse.define('vnode', [], function () {
    'use strict';

    const VNODE_TYPE = Symbol.for('glasshouse.vnode');

    function vnode(tag, attrs, ...children) {
      const kids = [];
      function flatten(arr) {
        for (let i = 0; i < arr.length; i++) {
          const item = arr[i];
          if (item === null || item === undefined || item === false) continue;
          if (Array.isArray(item)) { flatten(item); }
          else if (isVNode(item) || typeof item === 'string' || typeof item === 'number') {
            kids.push(item);
          } else if (typeof item === 'boolean') {
            // skip booleans (conditional rendering)
          } else {
            kids.push(String(item));
          }
        }
      }
      flatten(children);

      return Object.freeze({
        _t: VNODE_TYPE,
        tag: tag,
        attrs: attrs || {},
        kids: kids
      });
    }

    function isVNode(obj) {
      return obj !== null && typeof obj === 'object' && obj._t === VNODE_TYPE;
    }

    function toJSON(node) {
      if (!isVNode(node)) return null;
      return {
        tag: node.tag,
        attrs: node.attrs,
        kids: node.kids.map(function (k) {
          return isVNode(k) ? toJSON(k) : (typeof k === 'string' || typeof k === 'number' ? k : null);
        }).filter(function (k) { return k !== null; })
      };
    }

    return Object.freeze({
      VNODE_TYPE: VNODE_TYPE,
      vnode: vnode,
      isVNode: isVNode,
      toJSON: toJSON,
      v: vnode,
      isV: isVNode
    });
  });
})();
