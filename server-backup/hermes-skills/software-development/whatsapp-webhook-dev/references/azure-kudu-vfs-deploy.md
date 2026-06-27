# Azure Kudu VFS — Deploy Static Files Without Rebuild

When you need to update just the React build (`dashboard/dist/`) on Azure without retriggering the full Python deployment, use the Kudu VFS REST API.

## Why Not `az webapp deploy --type zip`?

`az webapp deploy --type static` or `config-zip` with `--clean` tries to build the app. For a mixed Python + static site, this causes:
- Azure tries to find `node_modules` or run build scripts
- Deployment fails with "Build failed" (400 error)
- Even with `--type zip`, Kudu may trigger `SCM_DO_BUILD_DURING_DEPLOYMENT`

## Kudu VFS API (Direct File Upload)

Upload files directly to Azure's filesystem via Kudu's WebDAV-like API.

### Authentication

```python
import subprocess, json

result = subprocess.run(
    ['az', 'webapp', 'deployment', 'list-publishing-credentials',
     '--resource-group', '<rg>', '--name', '<app>'],
    capture_output=True, text=True
)
profile = json.loads(result.stdout)
user = profile['publishingUserName']  # e.g., "$appname" or "appname$appname"
pwd = profile['publishingPassword']
```

**Auth format:** `base64(f'{user}:{pwd}')` — use Basic auth header.

**Common pitfall:** The username may contain `$` or `\` characters. Use the full value as-is from the API response.

### Upload Script

```python
import os, base64, urllib.request, json, subprocess

# Get credentials
result = subprocess.run(
    ['az', 'webapp', 'deployment', 'list-publishing-credentials',
     '--resource-group', '<rg>', '--name', '<app>'],
    capture_output=True, text=True
)
profile = json.loads(result.stdout)
user = profile['publishingUserName']
pwd = profile['publishingPassword']
auth = base64.b64encode(f'{user}:{pwd}'.encode()).decode()

base = '/home/site/wwwroot/dashboard/dist'
scm = 'https://<app>.scm.azurewebsites.net/api/vfs'

files = [
    (f'{base}/index.html', f'{scm}/site/wwwroot/dashboard/dist/index.html', 'text/html'),
    (f'{base}/favicon.svg', f'{scm}/site/wwwroot/dashboard/dist/favicon.svg', 'image/svg+xml'),
]

# Add all asset files
assets_dir = f'{base}/assets'
for fname in os.listdir(assets_dir):
    fpath = os.path.join(assets_dir, fname)
    if fname.endswith('.js'):
        ctype = 'application/javascript'
    elif fname.endswith('.css'):
        ctype = 'text/css'
    else:
        ctype = 'application/octet-stream'
    files.append((fpath, f'{scm}/site/wwwroot/dashboard/dist/assets/{fname}', ctype))

for local_path, url, ctype in files:
    with open(local_path, 'rb') as f:
        data = f.read()
    req = urllib.request.Request(url, data=data, method='PUT', headers={
        'Authorization': f'Basic {auth}',
        'Content-Type': ctype,
    })
    resp = urllib.request.urlopen(req, timeout=30)
    print(f'OK: {os.path.basename(local_path)} ({len(data)} bytes)')
```

### After Upload

The files are live immediately — no restart needed. But if the FastAPI server caches file listings, you may need to restart:

```bash
az webapp restart --resource-group <rg> --name <app>
```

### Kudu API Endpoints Reference

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/vfs/site/wwwroot/{path}` | PUT | Upload/replace file |
| `/api/vfs/site/wwwroot/{path}` | GET | Download file |
| `/api/vfs/site/wwwroot/{path}` | DELETE | Delete file |
| `/api/vfs/site/wwwroot/{path}` | LIST | List directory |
| `/api/deployments` | GET | List deployments |
| `/api/deployments/latest` | GET | Latest deployment status |

### Troubleshooting

- **401 Unauthorized:** Credentials expired or wrong format. Re-fetch from `list-publishing-credentials`.
- **404 on path:** Parent directory doesn't exist. Create it first or ensure path is correct.
- **400 Bad Request:** File path contains invalid characters or is too long.
- **Timeout:** Large files (>10MB) may timeout. Use chunked upload or FTP instead.

### Alternative: Kudu ZIP Deploy (for bulk upload)

```bash
# Get publish profile for FTP credentials
az webapp deployment list-publishing-profiles --resource-group <rg> --name <app>

# Use curl with basic auth to Kudu ZIP API
curl -X POST "https://<app>.scm.azurewebsites.net/api/zipdeploy" \
  --data-binary @dist.zip \
  -u "$USER:$PWD"
```

This deploys to `site/wwwroot/` root — adjust paths inside the zip accordingly.
