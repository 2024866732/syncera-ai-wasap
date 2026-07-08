# SQLite RETURNING Clause Compatibility (Jul 2026)

## Problem

SQLite's `INSERT ... RETURNING *` syntax was introduced in **SQLite 3.35.0** (2021-03-12). Azure App Service Linux containers with Python 3.11 ship **SQLite < 3.35.0**, which does not support this syntax.

**Error:** `sqlite3.OperationalError: near "RETURNING": syntax error`

## Detection

```python
import sqlite3
print(sqlite3.sqlite_version)  # < 3.35.0 on affected containers
```

## Fix

Replace single-statement INSERT + RETURNING with two-step INSERT then SELECT:

```python
# ❌ Will fail:
row = conn.execute(
    "INSERT INTO table (col1, col2) VALUES (?, ?) RETURNING *",
    (val1, val2)
).fetchone()

# ✅ Works everywhere:
conn.execute(
    "INSERT INTO table (col1, col2) VALUES (?, ?)",
    (val1, val2)
)
row = conn.execute(
    "SELECT * FROM table WHERE spx_tracking_number = ?",
    (tracking,)
).fetchone()
```

## Affected Environments

| Environment | SQLite Version | RETURNING Support |
|------------|---------------|-------------------|
| Azure App Service Linux (Python 3.11) | < 3.35.0 | ❌ No |
| Local dev (Python 3.11+) | 3.40+ | ✅ Yes |
| Ubuntu 22.04+ | 3.37+ | ✅ Yes |

**Key insight:** The app works fine locally but fails in production because the Azure container has an older SQLite version.
