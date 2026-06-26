import os
import subprocess
import sys

# Read token from .env
env_path = os.path.expanduser("~/.hermes/.env")
token = None
with open(env_path) as f:
    for line in f:
        stripped = line.strip()
        if stripped.startswith("LOYVERSE_ACCESS_TOKEN="):
            token = stripped.split("=", 1)[1].strip()
            break

if not token:
    print("ERROR: Token not found")
    sys.exit(1)

print(f"Token found: {token[:10]}... (length: {len(token)})")

# Set env and run script
env = os.environ.copy()
env["LOYVERSE_ACCESS_TOKEN"] = token

result = subprocess.run(
    [sys.executable, os.path.expanduser("~/.hermes/skills/fetch_sales/fetch_sales.py")],
    env=env,
    capture_output=True,
    text=True
)

print(result.stdout)
if result.stderr:
    print("STDERR:", result.stderr)
sys.exit(result.returncode if result.returncode else 0)
