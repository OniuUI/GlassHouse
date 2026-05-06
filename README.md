# GlassHouse

Zero-dependency JavaScript framework. No bundlers, no package managers, no transpilers — just vanilla JS loaded via `<script>` tags. Everything you need to build browser applications is here: component blocks, type system, theming, TypeScript compiler, build pipeline, and package management. Built from scratch.

Built for the [Glas CLI](https://github.com/OniuUI/Glas-CLI).

---

**Architecture** · **Block types** · **TypeScript compiler** · **Package system** · **Build pipeline** · **WCAG compliance**

---

## Why GlassHouse?

| You need | GlassHouse gives you |
|----------|---------------------|
| Components without React/Vue/Angular | Pebble — DOM-rendering blocks with templates, state, lifecycle hooks, event delegation |
| Type safety without TypeScript in production | Runtime type system — propTypes, stateTypes, handler contracts enforced at mount time |
| Scoped CSS without CSS-in-JS or preprocessors | Shine — themed CSS blocks with `[data-theme]` attribute scoping and WCAG AA enforcement |
| Business logic separated from UI | Handler — pure logic blocks with typed exports, fingerprinting, and duplicate detection |
| TypeScript support in a 2014-era project | Built-in 6-phase TS compiler (lexer → parser → binder → checker → emitter → pipeline) |
| Lazy loading with resource limits | Block registry with maxSize, dependency graph, staleness detection, and automatic unloading |
| Production builds without webpack | Hyper-compaction pipeline: resolve → tree-shake → minify → ROM binary → single bundle |
| Security out of the box | No innerHTML with user data, no eval(), no inline event handlers, all events via delegate() |

## Structure

```
glasshouse/
├── core/                    Core framework
│   ├── glasshouse.js         Namespace, block registry, lifecycle, staleness
│   ├── types.js              Runtime type system (modeled after TypeScript)
│   ├── dom.js                Safe DOM utilities (no raw innerHTML)
│   ├── lint.js               Runtime linter (size, security, performance)
│   ├── vnode.js              Virtual DOM node utilities
│   └── test-runner.js        Test harness used by glas test
├── blocks/                  Frontend block types
│   ├── pebble.js             DOM-rendering component
│   ├── handler.js            Pure logic block
│   ├── shine.js              Scoped CSS theming block
│   └── pane.js               View composition
├── compiler/                TypeScript compiler (6-phase)
│   ├── ts-lexer.js           Tokenizer
│   ├── ts-parser.js          Recursive descent parser → AST
│   ├── ts-binder.js          Scope analysis + symbol binding
│   ├── ts-checker.js         Type validation engine
│   ├── ts-emitter.js         Type erasure → JavaScript output
│   └── ts-compiler.js        Pipeline orchestrator
├── pipeline/                Build pipeline
│   ├── resolver.js           Dependency tree resolver
│   ├── tree-shaker.js        Dead code elimination
│   ├── hyper-compactor.js    Identifier minification
│   ├── rom.js                Virtual ROM binary format
│   ├── decompressor.js       Bundle decompressor (browser-side)
│   └── builder.js            Build pipeline orchestrator
├── pkg/                     Package system
│   ├── package-validator.js  Guardrails (size, security, types, deps)
│   ├── package-manager.js    Package install + registry (browser)
│   └── package-scaffold.js   Auto-generate package directory structure
├── tools/                   Utilities
│   ├── auditor.js            Full project audit (structure, security, types, WCAG, perf)
│   ├── wcag-validator.js     WCAG AA contrast/font/focus/motion checks
│   └── cli.js                Browser developer console (glass.* commands)
├── docs/                    Documentation
├── package.json             Framework manifest
├── LICENSE                  MIT
└── README.md
```

## Block Lifecycle

```
define → register → loaded (on first use) → active (in use) → stale (idle > TTL) → unloaded
```

- **Every block** has a declared `maxSize` (hard cap on factory function byte size)
- **Every block** declares its `dependencies` (other blocks it requires)
- **Only loaded blocks** consume resources — blocks are lazy-loaded
- **Stale blocks** are automatically unloaded when unused past their TTL
- **The registry** enforces all limits and tracks block lifecycle

## Type Safety

- **Every Pebble** MUST declare `propTypes` and `stateTypes`
- **Every Shine** MUST declare typed theme contracts
- **Every Handler** MUST declare typed `exports` contracts
- **Type violations** are hard errors at mount/setState time
- Types are runtime-based (modeled after TypeScript's type system)
- Types are part of the block contract — violations fail fast at development time

## TypeScript Compiler (6-phase)

| Phase | File | Purpose |
|-------|------|---------|
| Lexer | `compiler/ts-lexer.js` | Tokenize TypeScript source into token stream |
| Parser | `compiler/ts-parser.js` | Recursive descent parser → AST |
| Binder | `compiler/ts-binder.js` | Scope analysis + symbol table binding |
| Checker | `compiler/ts-checker.js` | Type validation (interfaces, generics, unions, mapped types) |
| Emitter | `compiler/ts-emitter.js` | Type erasure → JavaScript output + `types.json` metadata |
| Pipeline | `compiler/ts-compiler.js` | Orchestrates all phases |

Handles: interfaces, type aliases, enums, generics, unions/intersections, conditional types, mapped types, template literal types, `keyof`/`typeof`/`infer`.

## Build Pipeline

```
resolve → tree-shake → hyper-compact → ROM → bundle
```

| Stage | File | Purpose |
|-------|------|---------|
| Resolve | `pipeline/resolver.js` | Build dependency tree from entry blocks |
| Tree-shake | `pipeline/tree-shaker.js` | Eliminate dead code, analyze usage |
| Hyper-compact | `pipeline/hyper-compactor.js` | Minify identifiers, token compaction, binary encoding |
| ROM | `pipeline/rom.js` | Virtual ROM binary format for identifier maps |
| Decompressor | `pipeline/decompressor.js` | Browser-side bundle loader |
| Pipeline | `pipeline/builder.js` | Orchestrates all stages, produces single JS bundle |

## Accessibility (WCAG AA — Enforced)

- Color contrast ratios ≥ 4.5:1 (normal text), ≥ 3:1 (large text)
- Focus indicators visible and meeting 3:1 contrast
- Font sizes minimum 12px (16px recommended for body)
- `prefers-reduced-motion` queries required in all themes
- Touch targets ≥ 44×44px on interactive elements
- Heading hierarchy must not skip levels
- Every form input must have an associated label

## Security

- **No `innerHTML`** with unsanitized content — use `textContent` or `dom.safe()`
- **No `eval()`**, `new Function()`, or `document.write()`
- **No inline event handlers** (`onclick="..."` in HTML)
- **All event binding** through `delegate()` or `addEventListener`
- **User input** treated as text, never as HTML

## Package System

```
glas install glasshouse        Install framework
glas install ./packages/my-pebble   Install from local path
glas install button@1.2.3     Install specific version
glas uninstall glasshouse      Remove package
glas list                      List installed packages
glas info glasshouse           Show package details
```

- Packages must pass ALL guardrails: size, security, dependencies, type contracts, templates
- Installation is uniform: local directories, remote URLs, and registry all use the same API
- Registry persisted to localStorage (browser) or `.registry.json` (CLI)

## Install

```
glas install glasshouse
```

Or clone into your project's `glasshouse/` directory:

```
git clone https://github.com/OniuUI/GlassHouse.git glasshouse
```

## Usage

```html
<!-- Core (required) -->
<script src="glasshouse/core/glasshouse.js"></script>
<script src="glasshouse/core/types.js"></script>
<script src="glasshouse/core/dom.js"></script>

<!-- Blocks (as needed) -->
<script src="glasshouse/blocks/pebble.js"></script>
<script src="glasshouse/blocks/handler.js"></script>
<script src="glasshouse/blocks/shine.js"></script>
```

```javascript
'use strict';

GlassHouse.ready(function () {
    var button = new GlassHouse.Pebble('my-button', {
        propTypes: { label: 'string', onClick: 'function' },
        template: function (state) {
            return '<button class="btn">' + GlassHouse.dom.escape(state.label) + '</button>';
        }
    });
    button.mount('#app');
});
```

## Contributing

- Keep changes focused and minimal
- All code must pass the runtime linter (`glas lint`)
- New blocks must declare `propTypes`/`stateTypes`/`handlers`
- No external dependencies — vanilla JS only

## License

MIT — see [LICENSE](LICENSE).

---

Built with the [Glas CLI](https://github.com/OniuUI/Glas-CLI). Part of the GlassHouse ecosystem.
