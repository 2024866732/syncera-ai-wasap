# Self-hosting Next.js + Prisma + PostgreSQL apps (worked example: prompts.chat)

Condensed recipe from a real install of `github.com/f/prompts.chat` on a 1 GB RAM
ARM box (Oracle Free Tier: 1 OCPU, 848 MiB RAM, 4 GB swap, Ubuntu/Debian).

Prompts.chat = Next.js 16 + React 19 + Prisma 6 + PostgreSQL. Formerly "Awesome ChatGPT Prompts".
Self-hostable with custom branding/themes/auth.

## Environment findings (constraints)
- Docker NOT installed -> used manual Node path (not `docker compose`).
- Node v24 + npm 11 present. OK
- PostgreSQL 14 NOT pre-installed; Prisma `datasource` is `postgresql` ONLY (no SQLite fallback).
- RAM tight (192 MiB available). Build (`next build`) risks OOM -> ran `npm run dev`.

## Install sequence (verified)
```bash
# 1. Repo
git clone --depth 1 https://github.com/f/prompts.chat.git promptschat
cd promptschat

# 2. PostgreSQL (if absent)
sudo apt-get update && sudo apt-get install -y postgresql postgresql-contrib
sudo service postgresql start

# 3. Role + DB (run psql from a dir postgres can cd into, e.g. /tmp)
cd /tmp
PGPASS=$(openssl rand -base64 18 | tr -dc 'a-zA-Z0-9' | head -c16)
sudo -u postgres psql -v ON_ERROR_STOP=1 <<EOF
CREATE USER promptsuser WITH PASSWORD '$PGPASS';
CREATE DATABASE promptsdb OWNER promptsuser;
GRANT ALL PRIVILEGES ON DATABASE promptsdb TO promptsuser;
EOF

# 4. Low-RAM PG tuning -- APPEND to /etc/postgresql/14/main/postgresql.conf
#    (last value wins). Then: sudo service postgresql restart
shared_buffers = 128MB
effective_cache_size = 256MB
work_mem = 16MB
maintenance_work_mem = 32MB
max_connections = 20
wal_buffers = 4MB
checkpoint_completion_target = 0.9

# 5. App deps + env
cd /home/hafizi145/promptschat
npm install                       # long; run in background w/ notify
cp .env.example .env
# edit .env:
#   DATABASE_URL="postgresql://promptsuser:***@localhost:5432/promptsdb?schema=public"
#   AUTH_SECRET=*** rand -base64 32)"

# 6. Prisma + run
npx prisma generate
npx prisma db push                # creates tables from schema (no migration history)
npm run dev                       # port 3000; lighter than build on 1 GB RAM
# production alternative (needs RAM): npm run build && npm run start
```

## Verify
```bash
curl -s http://127.0.0.1:3000 | head -c 200
```

## Key gotchas
- **Prisma needs PostgreSQL**, not SQLite -- check `prisma/schema.prisma` `datasource.provider`
  before assuming a lighter DB works.
- **`npm run dev` over `npm run build`** on <=1 GB RAM: build can OOM even with swap.
- **Consent gate**: editing any `/etc/` service config AND restarting the service blocks until
  the user approves. Announce the exact change + ask consent BEFORE running.
- Docker path (`docker compose up -d`) is cleaner if Docker is present, but still ~2 containers
  (app + postgres) sharing 1 GB -- similar RAM pressure.
- Repo `AGENTS.md` documents all commands (`db:push`, `db:seed`, `dev`, `build`, env vars).
- `.env` minimum: `DATABASE_URL`, `AUTH_SECRET`. OAuth (github/google/azure) + `OPENAI_API_KEY`
  (AI search) are optional.
