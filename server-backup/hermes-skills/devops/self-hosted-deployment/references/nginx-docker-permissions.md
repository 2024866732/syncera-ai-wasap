# Nginx Docker Container Permission Issues

## Symptom
Nginx container returns HTTP 403 (Forbidden) when serving static files via volume mount.

## Root Cause
Docker volume mounts preserve the host file permissions. If the host file has restrictive permissions (e.g., `600` or `rw-------`), nginx running as `root` or `nginx` user cannot read the file.

## Example
```bash
# Host file with restrictive permissions
ls -la /home/ubuntu/project/dashboard.html
-rw------- 1 ubuntu ubuntu 22K Aug 14 03:12 dashboard.html

# Docker container sees 403
curl -s http://localhost:8117/
# HTTP 403 Forbidden
```

## Fix

### Option 1: Fix permissions on host before mount
```bash
chmod 644 /home/ubuntu/project/dashboard.html
ls -la /home/ubuntu/project/dashboard.html
# -rw-r--r-- 1 ubuntu ubuntu 22K Aug 14 03:12 dashboard.html
```

### Option 2: Use read-only mount with correct permissions
```bash
docker run -d \
  --name nginx-dashboard \
  -p 8117:80 \
  -v /path/to/dashboard.html:/usr/share/nginx/html/index.html:ro \
  nginx:alpine
```

### Option 3: Recreate container with proper setup
```bash
# Stop and remove old container
docker stop nginx-dashboard && docker rm nginx-dashboard

# Fix file permissions
chmod 644 /path/to/dashboard.html

# Create new container
docker run -d \
  --name nginx-dashboard \
  -p 8117:80 \
  -v /path/to/dashboard.html:/usr/share/nginx/html/index.html:ro \
  --restart unless-stopped \
  nginx:alpine
```

## Prevention
1. Always set `644` permissions on files before Docker volume mount
2. Use `:ro` flag for read-only mounts
3. Verify file permissions after upload: `ls -la <file>`

## Verification
```bash
# Test access
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" http://localhost:8117/

# Expected: HTTP Status: 200
```

## Related
- See `references/local-python-service-deploy.md` for Docker Compose PostgreSQL schema init issues
