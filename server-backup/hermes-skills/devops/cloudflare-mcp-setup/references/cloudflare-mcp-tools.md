---
title: Cloudflare MCP Tools Reference
description: Detailed tool reference for all 5 Cloudflare MCP servers
---

# Cloudflare MCP Tools Reference

Generated after successful setup (2026-07-31).

## cloudflare (3 tools)

### search_cloudflare_documentation
Search Cloudflare official documentation.
```json
{
  "query": "Workers KV limits",
  "max_results": 5
}
```

### search
Search Cloudflare OpenAPI specification (pre-resolved $refs).
```json
{
  "query": "list workers",
  "max_results": 10
}
```

### execute
Execute JavaScript code against Cloudflare API. First use `search` to find the right endpoint, then execute.
```json
{
  "code": "const workers = await fetch('https://api.cloudflare.com/client/v4/accounts/{account_id}/workers/scripts', { headers: { 'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}` } }); return workers.json();"
}
```

---

## cloudflare-bindings (23 tools)

### KV Namespaces

#### kv_namespaces_list
List all KV namespaces in account.
```json
{
  "account_id": "optional - auto-detected from token"
}
```

#### kv_namespace_create
Create new KV namespace.
```json
{
  "title": "my-namespace",
  "account_id": "optional"
}
```

#### kv_namespace_get
Get KV namespace details.
```json
{
  "namespace_id": "abc123",
  "account_id": "optional"
}
```

#### kv_namespace_update
Update KV namespace title.
```json
{
  "namespace_id": "abc123",
  "title": "new-title",
  "account_id": "optional"
}
```

#### kv_namespace_delete
Delete KV namespace.
```json
{
  "namespace_id": "abc123",
  "account_id": "optional"
}
```

### Workers

#### workers_list
List all Workers in account.
```json
{
  "account_id": "optional",
  "page": 1,
  "per_page": 100
}
```

#### workers_get_worker
Get Worker details.
```json
{
  "account_id": "optional",
  "script_name": "my-worker"
}
```

#### workers_get_worker_code
Get Worker source code.
```json
{
  "account_id": "optional",
  "script_name": "my-worker"
}
```

### R2 Buckets

#### r2_buckets_list
List R2 buckets.
```json
{
  "account_id": "optional"
}
```

#### r2_bucket_create
Create R2 bucket.
```json
{
  "bucket_name": "my-bucket",
  "account_id": "optional",
  "location": "auto"
}
```

#### r2_bucket_get
Get R2 bucket details.
```json
{
  "bucket_name": "my-bucket",
  "account_id": "optional"
}
```

#### r2_bucket_delete
Delete R2 bucket.
```json
{
  "bucket_name": "my-bucket",
  "account_id": "optional"
}
```

### D1 Databases

#### d1_databases_list
List D1 databases.
```json
{
  "account_id": "optional"
}
```

#### d1_database_create
Create D1 database.
```json
{
  "name": "my-db",
  "account_id": "optional"
}
```

#### d1_database_get
Get D1 database details.
```json
{
  "database_id": "abc123",
  "account_id": "optional"
}
```

#### d1_database_delete
Delete D1 database.
```json
{
  "database_id": "abc123",
  "account_id": "optional"
}
```

#### d1_database_query
Query D1 database.
```json
{
  "database_id": "abc123",
  "account_id": "optional",
  "sql": "SELECT * FROM users LIMIT 10"
}
```

### Hyperdrive

#### hyperdrive_configs_list
List Hyperdrive configurations.
```json
{
  "account_id": "optional"
}
```

#### hyperdrive_config_get
Get Hyperdrive config details.
```json
{
  "config_id": "abc123",
  "account_id": "optional"
}
```

#### hyperdrive_config_edit
Edit Hyperdrive config.
```json
{
  "config_id": "abc123",
  "account_id": "optional",
  "name": "new-name",
  "origin": "postgres://...",
  "caching": "enabled"
}
```

#### hyperdrive_config_delete
Delete Hyperdrive config.
```json
{
  "config_id": "abc123",
  "account_id": "optional"
}
```

---

## cloudflare-builds (6 tools)

### workers_list
List Workers (same as bindings).

### workers_get_worker
Get Worker details (same as bindings).

### workers_get_worker_code
Get Worker source code (same as bindings).

### workers_builds_list_builds
List builds for a Worker.
```json
{
  "account_id": "optional",
  "script_name": "my-worker"
}
```

### workers_builds_get_build
Get build details.
```json
{
  "account_id": "optional",
  "script_name": "my-worker",
  "build_id": "uuid"
}
```

### workers_builds_get_build_logs
Get build logs.
```json
{
  "account_id": "optional",
  "script_name": "my-worker",
  "build_id": "uuid"
}
```

---

## cloudflare-observability (8 tools)

### workers_list
List Workers (same as bindings).

### workers_get_worker
Get Worker details (same as bindings).

### workers_get_worker_code
Get Worker source code (same as bindings).

### query_worker_observability
Query Workers Observability API for logs/metrics.
```json
{
  "account_id": "optional",
  "script_name": "my-worker",
  "query": "request_count",
  "start_time": "2026-07-30T00:00:00Z",
  "end_time": "2026-07-31T00:00:00Z",
  "limit": 100
}
```

### observability_keys
Find available keys in observability data.
```json
{
  "account_id": "optional",
  "script_name": "my-worker"
}
```

### observability_values
Find values for a specific key.
```json
{
  "account_id": "optional",
  "script_name": "my-worker",
  "key": "http_status",
  "limit": 20
}
```

---

## cloudflare-docs (2 tools)

### search_cloudflare_documentation
Search Cloudflare docs (public, no auth).
```json
{
  "query": "Workers KV pricing",
  "max_results": 5
}
```

### migrate_pages_to_workers_guide
Get migration guide for Pages to Workers.
```json
{}
```

---

## Usage Patterns

### Find and query a D1 database
```python
# 1. List databases
databases = await d1_databases_list()

# 2. Query specific database
results = await d1_database_query({
  "database_id": databases[0]["uuid"],
  "sql": "SELECT * FROM orders WHERE created_at > date('now', '-7 days')"
})
```

### Check Worker health via observability
```python
# 1. Get available metrics keys
keys = await observability_keys({"script_name": "my-worker"})

# 2. Query error rate
errors = await query_worker_observability({
  "script_name": "my-worker",
  "query": "error_count",
  "start_time": "2026-07-30T00:00:00Z"
})
```

### Manage KV for session storage
```python
# 1. Create namespace for sessions
ns = await kv_namespace_create({"title": "sessions"})

# 2. Use execute to put/get values (via Workers script or direct API)
```