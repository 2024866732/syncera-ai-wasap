# Azure VPS disk cleanup — safe mode

Use when the HAFJET Azure root filesystem is above 85% and the user requests cleanup. This is a reversible-first workflow; do not mix diagnosis, delete, service restart, or Docker pruning.

## 1. Read-only diagnosis first

Run separately enough to survive large trees/timeouts:

```bash
df -h /
df -i /
du -xh / --max-depth=1 2>/dev/null | sort -hr
du -xh "$HOME" --max-depth=1 2>/dev/null | sort -hr
du -xh /var --max-depth=1 2>/dev/null | sort -hr
```

If a combined depth-2 `du` times out, split by large directory. A normal inode percentage means the incident is capacity, not inode exhaustion.

## 2. Classify before proposing deletion

| Path class | Treatment |
|---|---|
| `~/.cache/pip`, `~/.cache/uv`, `~/.cache/huggingface`, `~/.cache/ms-playwright` | Rebuildable cache. State the measured size and require explicit approval naming the exact paths. |
| `~/.agent-browser/browsers` | Inspect versions first. An older browser build can be removed only with approval; the browser will redownload it if required. |
| `~/.hermes/npm-global`, `~/.hermes/npm-cache`, `~/.hermes/state-snapshots`, `~/.hermes/state`, app repositories, n8n data | Protected: never delete as generic disk cleanup. Snapshot removal needs a separate rollback/retention decision. |
| `~/hermes-agent/.git` | Do not delete. Inspect with `git count-objects -vH`; defer `git gc` until free space is sufficient because repacking needs temporary disk space. |
| `/var/log` | Audit first. `journalctl --vacuum-size=...` is a root action and deletes historical logs; require a separate approval. |
| Docker images/volumes/build cache | Read `docker system df` only when access is available. Do not use `docker system prune`, `compose down`, or remove volumes as generic cleanup. |

## 3. Delete only approved cache paths

- Require an explicit user message that enumerates the target paths.
- Run each recursive deletion as its own command and verify `df -h /` after each or after the approved batch.
- Do not delete a broader parent directory because it contains an approved child.
- Report actual free-space delta, not the pre-cleanup estimate.

## 4. Deep audit report format

Report: before/after filesystem use; actual freed space; remaining largest consumers; snapshot count/name/oldest/newest/size; browser version breakdown; Git pack/garbage data; logs; and Docker access status.

If the root filesystem remains above 85%, present only measured, item-specific next options and wait for the next approval. Do not infer permission to delete adjacent caches or run maintenance commands.
