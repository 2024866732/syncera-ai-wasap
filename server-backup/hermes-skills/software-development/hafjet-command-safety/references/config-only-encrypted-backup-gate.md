# Config-only encrypted backup gate

Use this exception only after Tuan explicitly approves it for a named backup policy.

## When application runtime is unresolved

A backup of a fixed configuration file can proceed without a verified application Python/runtime version **only** when:

1. The task does not invoke, restart, alter, or depend on the application runtime.
2. `LITELLM_PYTHON`, package version, and equivalent runtime fields are omitted from policy, encrypted manifest, worker JSON, VPS registry, and JSONL.
3. The file source is fixed—not supplied by task arguments.

Never treat a launcher (for example `uv`) as proof of a Python environment. Do not scan unrelated venvs or modify the service to resolve it during the backup phase.

## Mandatory non-runtime gates

Before publishing or executing the worker, verify read-only:

- backup path is a real mount at its exact path;
- filesystem UUID **and FSTYPE** are recorded and pinned in the reviewed policy;
- archive directory exists, is executor-writable, and is not world-accessible;
- config source exists/readable; capture only path, size, mtime, SHA-256;
- `age` exists and reports a version;
- recipient file is readable, non-empty, public-recipient-only; report count/hash/mode only—not recipient text;
- no prospective metadata/output includes config body, credential, private identity, runtime/version, logs, databases, or customer data.

## Metadata allowlist

Permitted: task ID/status, fixed config/archive paths, config size/mtime/SHA-256, mount UUID/FSTYPE, archive size/SHA-256, recipient count/SHA-256, timestamp.

Forbidden: config contents, API/master keys, tokens, salts, password, private age identity, recipient text, LiteLLM runtime/Python/version, service command/environment/logs.

## Publication sequence

1. Run a strict-host-key, sanitized read-only readiness audit.
2. Stop if any prerequisite is absent, a command fails, or output contains a secret marker.
3. Use audit UUID/FSTYPE to draft the exact immutable policy diff.
4. Obtain a separate write approval for worker structure, policy, script, allowlist hash, and sanitized output directory.
5. Obtain another per-run approval before the first production config backup.
