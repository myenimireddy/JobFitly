# Scripts

Small repo-level checks used by `make` and git hooks. Not part of the runtime product.

| Script | Purpose |
|--------|---------|
| `check-stack.js` | Guards against revived dead files / renamed UI pieces; asserts Makefile + hook wiring stay sane |

## Usage

```bash
# from repo root
node scripts/check-stack.js
# also runs as the first step of:
make test-fast
```

When you rename or remove a core UI/module, update the assertions in `check-stack.js` so the fast gate still matches reality.
