# GlassHouse

Zero-dependency JavaScript framework for building browser applications. Designed for 2014-era constraints: no bundlers, no package managers, no transpilers. Just vanilla JS loaded via `<script>` tags.

## Architecture

GlassHouse is organized into **blocks** — self-contained, bounded units with strict limits on size, dependencies, and lifecycle.

### Block Types

| Type | Purpose | File |
|------|---------|------|
| Core | Namespace, block registry, lifecycle | `glasshouse.js` |
| Pebble | DOM-rendering component blocks | `pebble.js` |
| Handler | Pure logic blocks (validation, API calls) | `handler.js` |
| Shine | Scoped CSS theming blocks | `shine.js` |
| Pane | View composition | `pane.js` |
| DOM utils | Safe DOM manipulation | `dom.js` |
| VNode | Virtual DOM utilities | `vnode.js` |
| Lint | Runtime linter | `lint.js` |
| Types | Runtime type system | `types.js` |
| Auditor | Full project audit | `auditor.js` |
| Builder | Production build pipeline | `builder.js` |

### TypeScript Compiler (6-phase)

| Phase | File |
|-------|------|
| Lexer | `ts-lexer.js` |
| Parser | `ts-parser.js` |
| Binder | `ts-binder.js` |
| Checker | `ts-checker.js` |
| Emitter | `ts-emitter.js` |
| Pipeline | `ts-compiler.js` |

### Build Pipeline

| Stage | File |
|-------|------|
| Resolver | `resolver.js` |
| Tree Shaker | `tree-shaker.js` |
| Hyper Compactor | `hyper-compactor.js` |
| ROM | `rom.js` |
| Decompressor | `decompressor.js` |
| Pipeline | `builder.js` |

### Package System

| Component | File |
|-----------|------|
| Validator | `package-validator.js` |
| Manager | `package-manager.js` |
| Scaffold | `package-scaffold.js` |

### Other

| Component | File |
|-----------|------|
| WCAG Validator | `wcag-validator.js` |
| CLI (browser) | `cli.js` |
| Test Runner | `test-runner.js` |

## Usage

```html
<script src="glasshouse.js"></script>
<script src="types.js"></script>
<script src="dom.js"></script>
<script src="pebble.js"></script>
```

## Install

```
glas install glasshouse
```

Or clone into your project's `glasshouse/` directory.

## License

MIT — see [LICENSE](LICENSE).
