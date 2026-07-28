# Sanitized Systemd Runtime Audits

Use this pattern when a remote HAFJET service must be structurally audited but unit arguments, config, environment, or process command lines could contain credentials.

## Scope boundary

- Obtain fresh verified SSH host identity before connecting.
- Use `systemctl --user show <unit>` only for bounded properties: `FragmentPath`, `MainPID`, `WorkingDirectory`, and `ExecStart` **captured only into a remote-shell variable**.
- Never print raw `ExecStart`, unit content, `/proc/<pid>/cmdline`, environment, service logs, config body, recipient text, or private-key data.
- Report only a fixed allowlist: unit file mode/owner/size/SHA-256, start-command classification, config-reference match status, and runtime resolution status.

## Safe start-command classification

Raw `ExecStart` may be inspected in-memory only to emit a bounded classification:

- `UV_LAUNCHER`
- `PYTHON_DIRECT`
- `OTHER`
- `PRESENT` / `UNAVAILABLE`

Likewise, test only whether the fixed expected config path occurs; emit `EXPECTED_PATH` or `NOT_EXPLICIT`. Do not expose the command string or attempt to redact it after printing.

## Conservative runtime pinning

A launcher path (for example `uv`) is not a Python runtime pin. To prove a runtime without changing service state:

1. Read only `MainPID`.
2. Resolve `/proc/<pid>/cwd` without printing it.
3. Accept only `<service-cwd>/.venv/bin/python` when executable.
4. Run with `PYTHONDONTWRITEBYTECODE=1` and query `importlib.metadata.version("litellm")` with stderr suppressed.
5. Print the absolute candidate path and distribution version only after success.

If any link is missing or metadata lookup fails, return exactly `RUNTIME_PYTHON_UNRESOLVED`. Do not search alternative venvs, select system Python, invoke `uv`, read raw service start arguments, or change/install anything.

## Backup dependency gate

For a backup policy that explicitly requires a proven LiteLLM runtime, `RUNTIME_PYTHON_UNRESOLVED` blocks script publication and backup execution. It does not authorize remediation. A separate approved plan is required for any broader resolver or service/package change.

## Output safety gate

If captured output contains possible secret markers (`api_key`, `master_key`, `token`, `salt`, `sk-`, `ak_`, `password`), stop immediately. Report only the safety status; do not retransmit, clean, delete, or rerun a broader command.
