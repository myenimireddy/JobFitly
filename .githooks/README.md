# Git hooks

Local hooks installed via `make install-hooks` (also run from root `npm prepare`).

Hooks live here (not in `.git/hooks`) so they can be versioned.

| Hook | Behavior |
|------|----------|
| `pre-commit` | Runs `make test-fast` — stack check + backend Jest + offline extension mocks |

Does **not** run live Playwright e2e (`make test-e2e`) — too slow and network-dependent for every commit.

## Install / refresh

```bash
make install-hooks
# or
npm install   # triggers prepare → install-hooks
```

To bypass locally in an emergency (avoid on shared branches): `git commit --no-verify`.
