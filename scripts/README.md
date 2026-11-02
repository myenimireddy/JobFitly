# Scripts

| Script | Who | Purpose |
|--------|-----|---------|
| [`bootstrap.sh`](bootstrap.sh) | Beta testers | One-time install of missing tools + project setup (**no `make`**) |
| [`start.sh`](start.sh) | Beta testers | Everyday: start API (+ Ollama only if no Groq key) |
| `check-stack.js` | Devs / pre-commit | Guards against revived dead files / renamed UI pieces |
| [`fake-resumes/generate.mjs`](fake-resumes/generate.mjs) | Devs / demos | Write 10 fictional résumé PDFs under `docs/samples/resumes/` |

## Beta testers

`make` is **not** installed by default on a fresh Mac (needs Xcode CLT). Use the shell scripts instead:

```bash
chmod +x scripts/bootstrap.sh scripts/start.sh
./scripts/bootstrap.sh   # once
./scripts/start.sh       # every day
```

Full steps: [../docs/setup.md](../docs/setup.md)

Skip Ollama during bootstrap if you will paste a Groq key in Settings:

```bash
INSTALL_OLLAMA=no ./scripts/bootstrap.sh
```

Force Ollama install (non-interactive):

```bash
INSTALL_OLLAMA=yes ./scripts/bootstrap.sh
```

## Dev check

```bash
node scripts/check-stack.js   # also via make test-fast / pre-commit
```

When you rename or remove a core UI/module, update the assertions in `check-stack.js`.

## Fake demo resumes

```bash
node scripts/fake-resumes/generate.mjs
# → docs/samples/resumes/*.pdf (+ .json)
```

Personas are fictional (`@jobfitly.test`). Edit `scripts/fake-resumes/profiles.mjs` then regenerate.
