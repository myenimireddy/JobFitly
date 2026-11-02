# Extension icons

JobFitly mark: dark slate + application form + teal success check (all sizes).

| File | Use |
|------|-----|
| `icon16` | Toolbar (1×) |
| `icon32` | Toolbar (Retina) |
| `icon48` | Extensions page |
| `icon128` | Install / store |

Edit the **SVG**, then regenerate PNGs:

```bash
cd extension && node scripts/render-icons.cjs
```

Requires `@resvg/resvg-js` (devDependency). Manifest uses PNG only.
