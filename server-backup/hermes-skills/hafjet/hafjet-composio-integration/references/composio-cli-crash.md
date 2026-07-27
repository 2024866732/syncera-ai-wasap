# Composio CLI Crash Log (2026-07-27)

## Environment
- OS: Ubuntu 22.04 (HAFJET-Hermes-Server)
- Python: 3.10
- Click: 8.4.2
- composio-core: 0.7.21

## Error
```
Traceback (most recent call last):
  File "/home/hafizi145/.local/bin/composio", line 8, in <module>
    sys.exit(composio())
  ...
  File "click/core.py", line 2358, in make_metavar
    metavar = self.type.get_metavar(param=self, ctx=ctx)
TypeError: EnumParam.get_metavar() got an unexpected keyword argument 'ctx'
```

## Root Cause
`composio-core` v0.7.21 ships a custom Click override (`CatchAllExceptions`) that's incompatible with Click >= 8.2.x. The `get_metavar()` signature changed — newer Click passes `ctx=` keyword, old code uses positional.

## Resolution
**Don't use the official CLI.** Use the community plugin instead:
- Repo: `kamellperry/hermes-composio`
- Install: symlink plugin + `hermes plugins enable composio`
- API key: from `platform.composio.dev` (NOT `dashboard.composio.dev`)

## API Key Formats
- Platform key (`platform.composio.dev`): `ck_...`
- Dashboard key (varies): `ak_...`
- If one doesn't work, try the other.
