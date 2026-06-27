#!/usr/bin/env python3
"""deploy.py — production-safe ZIP builder for HAFJET WhatsApp Bot (and similar FastAPI apps).

Use when 'zip' command is unavailable (Azure SSH, minimal Linux, Docker).
Produces deploy.zip with all required runtime files and proper exclusions.
"""
import os
import zipfile
import shutil

BASE = os.path.dirname(os.path.abspath(__file__))
ZIP_NAME = os.path.join(BASE, "deploy.zip")

# ── Exclusion rules ──────────────────────────────────────────────
EXCLUDE_DIRS = {"__pycache__", "node_modules", ".git", ".backup"}
EXCLUDE_EXTENSIONS = {".pyc", ".pyo", ".md"}
EXCLUDE_FILES = {
    ".env", ".env.local", ".env.production", ".gitignore", "deploy.sh", "deploy.py",
    "deploy.zip",  # self-exclude to prevent zip-inception
    "azure-settings-backup-2026-06-27.json",  # stale backup
}
EXCLUDE_PATTERNS = {
    "bot_data.db",      # local dev DB — must not overwrite production
    "startup.txt",      # dev-only note
    "known-good-baseline.md",
    "post-deploy-actions.md",
}

def should_exclude(relpath: str) -> bool:
    parts = relpath.split(os.sep)
    for part in parts:
        if part in EXCLUDE_DIRS:
            return True
    if any(relpath.endswith(ext) for ext in EXCLUDE_EXTENSIONS):
        return True
    basename = os.path.basename(relpath)
    if basename in EXCLUDE_FILES:
        return True
    if basename in EXCLUDE_PATTERNS:
        return True
    # Exclude other deploy zips (deploy_v2.1.zip, etc.)
    if basename.startswith("deploy_") and basename.endswith(".zip"):
        return True
    return False


def main():
    print("=== Building deployment ZIP ===")

    # Clean Python cache first
    for root, dirs, files in os.walk(BASE):
        if "__cache__" in root or "__pycache__" in dirs:
            shutil.rmtree(os.path.join(root, "__pycache__"), ignore_errors=True)
    for root, dirs, files in os.walk(BASE):
        for f in files:
            if f.endswith(".pyc"):
                os.remove(os.path.join(root, f))

    # Remove old deploy.zip before building
    if os.path.exists(ZIP_NAME):
        os.remove(ZIP_NAME)

    # Build
    with zipfile.ZipFile(ZIP_NAME, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(BASE):
            dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
            for f in files:
                full = os.path.join(root, f)
                rel = os.path.relpath(full, BASE)
                if should_exclude(rel):
                    continue
                zf.write(full, rel)

    # Report
    size_bytes = os.path.getsize(ZIP_NAME)
    with zipfile.ZipFile(ZIP_NAME, "r") as zf:
        entries = sorted(zf.namelist())
    top_level = sorted(set(e.split("/")[0] for e in entries))

    print(f"\n✅ deploy.zip ready")
    print(f"   Size: {size_bytes/1024:.1f} KB ({size_bytes} bytes)")
    print(f"   Entries: {len(entries)}")
    print(f"   Top-level: {', '.join(top_level)}")


if __name__ == "__main__":
    main()
