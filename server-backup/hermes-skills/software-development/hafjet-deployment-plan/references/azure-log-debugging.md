# Azure App Service Log Debugging for Background Jobs

Use this when diagnosing why a background job (APScheduler, webhook, reminder) silently fails or doesn't progress.

## Downloading Container Logs

```bash
# Download all logs as zip
az webapp log download \
  --name <app-name> \
  --resource-group <resource-group> \
  --log-file /tmp/app_logs.zip
```

## Extracting and Analyzing

```python
import zipfile, json

with zipfile.ZipFile('/tmp/app_logs.zip', 'r') as z:
    # List files
    print(f"Total files: {len(z.namelist())}")
    
    # Find today's container stream
    for name in z.namelist():
        if 'containerStream' in name and '<date>' in name:
            data = z.read(name).decode('utf-8', errors='replace')
            
            # Filter by background job name
            job_lines = [l for l in data.split('\n') if '<job-name>' in l]
            
            # Filter by error/exception
            err_lines = [l for l in data.split('\n') 
                if any(w in l.lower() for w in ['error','exception','traceback'])]
            
            # Filter by custom log prefix
            spx_lines = [l for l in data.split('\n') if 'SPX-SYNC' in l or 'SPX-DEBUG' in l]
```

## Key Log Files

| File Pattern | Contains | Use Case |
|---|---|---|
| `*_containerStream.log` | Application stdout/stderr | Sync progress, errors, APScheduler logs |
| `*_docker.log` | Container lifecycle | Restarts, timeouts, startup probes |

## Common Background Job Debugging Patterns

### 1. Check if scheduler job is actually running

Look for:
```
Running job "_sync_spx_batch ..." (scheduled at ...)
Job "_sync_spx_batch ..." executed successfully
```

If absent: scheduler not registered, job may have crashed at startup.

### 2. Detect silent failures

A job logging "executed successfully" but showing no progress indicates the job body has a code path that runs but does nothing:
```
2026-07-08T09:12:24 [INFO] Running job "_sync_spx_batch" ...
2026-07-08T09:12:24 [INFO] Job "_sync_spx_batch" executed successfully
```
If there's NO `[SPX-SYNC]` log between these two lines, the job returned early (e.g., `running=False` guard, lock acquisition failure, or exception caught before any work).

### 3. Detect phone fetch inactivity

Search for `fetch_spx_phone`, `show_secret`, `SPX-DEBUG`, or `phone` in logs. Their complete absence means the phone-fetch code path is never reached — the sync loop may be stuck in order-sync phase, or the phase transition is broken.

### 4. Correlate API errors with 500 responses

When frontend shows HTTP 500, the container stream usually has the Traceback. Search backward from the timestamp.

### 5. Confirm deploy_version in logs

The app logs `deploy_version` on startup. Verify the version matches the expected deployment to rule out stale-code issues:
```bash
grep "deploy_version\|_version\|version" *_containerStream.log
```

## Why Not `az webapp log tail`

`az webapp log tail` frequently shows **stale or delayed output** on Linux App Service. For real-time debugging, prefer `az webapp log download` with periodic polling. For logs within the last hour, the containerStream file is the most reliable source.
