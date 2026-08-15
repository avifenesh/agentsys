# New Library Module Checklist

Adding a new module to `lib/`.

## Best Practices Reference

- **Token Efficiency**: `agent-docs/CONTEXT-OPTIMIZATION-REFERENCE.md`
- **Cross-Platform**: `lib/cross-platform/RESEARCH.md`

## 1. Create Module

Location: `lib/{module-name}/index.js` (or `lib/{module-name}.js`)

**Structure:**
```javascript
/**
 * Module description
 * @module {module-name}
 */

const dependency = require('./dependency');

/**
 * Function description
 * @param {Type} param - Description
 * @returns {Type} Description
 */
function myFunction(param) {
  // implementation
}

module.exports = {
  myFunction,
  // ... exports
};
```

**Guidelines:**
- JSDoc for exported functions
- Handle errors explicitly
- Use async/await over callbacks
- Keep functions focused (single responsibility)

## 2. Export from lib/index.js

File: `lib/index.js`

Add import:
```javascript
const newModule = require('./new-module');
```

Add to exports:
```javascript
module.exports = {
  // ... existing
  newModule,
};
```

Or create namespace:
```javascript
const myNamespace = {
  func1: newModule.func1,
  func2: newModule.func2,
};

module.exports = {
  // ... existing
  myNamespace,
};
```

## 3. Write Tests

Location: `__tests__/{module-name}.test.js`

```javascript
const { newModule } = require('../lib');

describe('newModule', () => {
  describe('myFunction', () => {
    it('should do expected behavior', () => {
      const result = newModule.myFunction(input);
      expect(result).toBe(expected);
    });
  });
});
```

Run tests:
```bash
npm test -- --testPathPatterns=new-module
```

## 4. Sync to Plugins

```bash
./scripts/sync-lib.sh
# Or: agentsys-dev sync-lib
```

This copies `lib/` to all `plugins/*/lib/` directories.

## 5. Verify Plugin Loading

```bash
# Test module loads from main lib
node -e "const lib = require('./lib'); console.log(Object.keys(lib.newModule));"

# Test module loads from a plugin
node -e "const lib = require('./plugins/next-task/lib'); console.log(Object.keys(lib.newModule));"
```

## 6. Update Documentation

- [ ] Add JSDoc comments to all exports
- [ ] Update `docs/ARCHITECTURE.md` if significant
- [ ] Add to `lib/cross-platform/RESEARCH.md` if cross-platform relevant

## 7. Cross-Platform Considerations

**Reference:** `checklists/cross-platform-compatibility.md`

If module handles state or paths:
- [ ] Use `AI_STATE_DIR` env var, not hardcoded `.claude/`
- [ ] Use `PLUGIN_ROOT` env var, not `CLAUDE_PLUGIN_ROOT`

```javascript
// CORRECT
const stateDir = process.env.AI_STATE_DIR || '.claude';
const pluginRoot = process.env.PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT;

// WRONG
const stateDir = '.claude';
const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
```

## 8. Run Quality Validation

```bash
# Run tests
npm test

# Verify all tests pass
npm test -- --testPathPatterns={module-name}
```

## 9. Commit Both Source and Copies

```bash
git add lib/ plugins/*/lib/
git commit -m "feat(lib): add {module-name} module"
```

**Important:** Always commit both `lib/` and `plugins/*/lib/` together.
