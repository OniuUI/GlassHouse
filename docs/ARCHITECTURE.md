# GlassHouse Architecture

## Overview

GlassHouse is a zero-dependency JavaScript framework organized into **blocks** — self-contained, bounded units with strict limits on size, dependencies, and lifecycle.

## Block System

Every block is defined via `GlassHouse.define(name, dependencies, factory)`:

```javascript
GlassHouse.define('my-block', ['dom', 'types'], function (dom, T) {
    // factory returns the block's public API
    return { greet: function () { return 'hello'; } };
});
```

### Block Lifecycle

```
define → register → loaded (on first use) → active (in use) → stale (idle > TTL) → unloaded
```

- **define**: Block is registered with the registry (factory + dependencies stored)
- **loaded**: Factory is executed, dependencies are resolved, instance is cached
- **active**: Block is in use (referenced by other active blocks)
- **stale**: Block has not been used past its TTL (30s default)
- **unloaded**: Block's memory is freed, DOM references released, listeners removed

### Resource Limits

| Limit | Default | Purpose |
|-------|---------|---------|
| `MAX_BLOCK_SIZE` | 40,960 bytes | Hard cap on factory function byte size |
| `MAX_TOTAL_SIZE` | 262,144 bytes | Total size of all loaded blocks |
| `STALE_TIMEOUT` | 30,000 ms | Time before an unused block is considered stale |
| `CLEANUP_INTERVAL` | 15,000 ms | How often stale blocks are collected |

## Block Types

### Pebble (Component Block)

DOM-rendering component with template, state, and lifecycle hooks.

```javascript
var button = new GlassHouse.Pebble('my-button', {
    propTypes: { label: 'string', variant: 'string' },
    stateTypes: { clicked: 'boolean' },
    handlers: ['analytics'],

    template: function (state) {
        return '<button class="btn btn--' + state.variant + '">' +
               GlassHouse.dom.escape(state.label) + '</button>';
    },

    onMount: function () {
        this.delegate('click', 'button', function (e) {
            this.setState({ clicked: true });
            this.use('analytics').track('button-click');
        });
    }
});
```

- `template(state)` — returns HTML string (template literals)
- `propTypes` — required type declarations for all external inputs
- `stateTypes` — required if using `setState()`
- `handlers` — required if using `this.use()`
- `delegate(event, selector, handler)` — event delegation (no inline handlers)

### Handler (Logic Block)

Pure logic — validation, API calls, data transforms. No DOM, no rendering.

```javascript
GlassHouse.handler('validation', {
    deps: [],
    exports: {
        isEmail: { params: ['string'], returns: 'boolean' },
        isRequired: { params: ['string'], returns: 'boolean' }
    },
    factory: function () {
        return {
            isEmail: function (val) { return /@/.test(val); },
            isRequired: function (val) { return val && val.length > 0; }
        };
    }
});
```

- `exports` — typed contract for every public method
- `factory()` — returns the handler instance
- Fingerprinted at registration — ≥80% structural match triggers duplicate warning
- Consumed by Pebbles via `this.use('handlerName').method()`

### Shine (Style Block)

Scoped CSS theming with WCAG AA enforcement.

```javascript
GlassHouse.shine('dark-theme', {
    theme: {
        colors: { primary: '#4f46e5', background: '#1e1b4b', text: '#e2e8f0' },
        fonts: { body: '16px system-ui', heading: '24px system-ui' },
        spacing: { unit: '8px' },
        radii: { default: '6px' },
        shadows: { card: '0 2px 8px rgba(0,0,0,0.3)' }
    }
});
```

- `theme` — typed contract with colors, fonts, spacing, radii, shadows
- Generates scoped CSS via `[data-theme="name"]` attribute selectors
- WCAG AA validated at install time: contrast ≥ 4.5:1, focus ≥ 3:1, font ≥ 12px
- Composable via CSS custom property fallback chains

### Pane (View Composition)

Composes multiple Pebbles into layout containers.

```javascript
var dashboard = new GlassHouse.Pane('dashboard', {
    layout: 'grid',
    children: [
        { pebble: 'metrics-card', props: { title: 'Users' } },
        { pebble: 'metrics-card', props: { title: 'Revenue' } }
    ]
});
```

## TypeScript Compiler Pipeline

```
Source (.ts) → Lexer → Tokens → Parser → AST → Binder → Symbol Table → Checker → Validated AST → Emitter → JS + types.json
```

### Phase Details

1. **Lexer** (`compiler/ts-lexer.js`): Tokenizes source into tokens (keywords, identifiers, operators, literals)
2. **Parser** (`compiler/ts-parser.js`): Recursive descent parser builds AST from token stream
3. **Binder** (`compiler/ts-binder.js`): Walks AST, builds scope chain, binds symbols to declarations
4. **Checker** (`compiler/ts-checker.js`): Validates types — interfaces, generics, unions, intersections, conditional types
5. **Emitter** (`compiler/ts-emitter.js`): Strips type annotations, emits JavaScript + `types.json` metadata
6. **Pipeline** (`compiler/ts-compiler.js`): Orchestrates all phases, handles incremental compilation

### Supported TypeScript Features

- Interfaces, type aliases, enums
- Generics (basic)
- Union and intersection types
- `keyof`, `typeof` operators
- Mapped types
- Template literal types

## Build Pipeline

```
Entry blocks → Resolve → Dependency graph → Tree-shake → Used blocks → Hyper-compact → Minified sources → ROM → Binary → Bundle
```

1. **Resolve**: Walks dependency tree from entry blocks, produces ordered list
2. **Tree-shake**: Collects source for each block, removes unused exports, analyzes references
3. **Hyper-compact**: Minifies identifiers, pools common tokens, encodes to binary
4. **ROM**: Creates virtual ROM binary for identifier maps, embeds loader in bundle
5. **Bundle**: Concatenates all sources, embeds decompressor, produces single `.js` file

## Package System

Packages are directories containing a `package.json` manifest and source files.

### Package Manifest

```json
{
    "name": "my-pebble",
    "version": "1.0.0",
    "type": "pebble",
    "main": "index.js",
    "dependencies": { "validation": ">=1.0.0" },
    "glasshouse": ">=2.0.0"
}
```

### Validation Guardrails

Every installed package must pass:
- **Size**: ≤ MAX_BLOCK_SIZE (40,960 bytes)
- **Security**: No eval(), new Function(), document.write(), innerHTML, inline handlers
- **Dependencies**: All declared deps must exist
- **Type contracts**: Pebbles must have propTypes, Handlers must have exports
- **Templates**: Must use template literals (string return), not raw concatenation
- **Events**: All event binding through delegate(), no inline handlers
- **Globals**: No window/document pollution beyond allowed API

## Security Model

- No `innerHTML` with unsanitized content — `dom.safe()` wraps all output
- No `eval()`, `new Function()`, `document.write()`
- No inline event handlers — all events through `delegate()` or `addEventListener`
- User input is always text, never HTML
- The global `GlassHouse` namespace is frozen (`Object.freeze`) after setup
