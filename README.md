# BlueCrest Premium Banking

React/Vite frontend with a Node.js banking API in `bluecrestback`.

## Local setup

Requirements: Node.js 20 or newer.

1. Copy `.env.example` to `.env.local`.
2. Copy `bluecrestback/.env.example` to `bluecrestback/.env`.
3. Install dependencies in both directories:
   - `npm install`
   - `cd bluecrestback && npm install`
4. Initialize the backend database:
   - `cd bluecrestback && npm run db:migrate`
5. Start the frontend and backend together from the project root:
   - `npm run dev`

The Vite development frontend runs on port 3000 and proxies API requests to `BACKEND_URL`, defaulting to `http://127.0.0.1:4000`. The local backend runs on port 4000.

Use `npm run dev:backend` only when you intentionally want to run the API
separately. The normal Vite development command starts it automatically when
port 4000 is not already serving the BlueCrest health endpoint.

Local development is SQLite-first. Keep `DB_PROVIDER=sqlite` and
`SQLITE_DB_PATH=local.db` in `bluecrestback/.env`. A stray `DATABASE_URL`
will not switch development to Railway/Postgres. For a later Railway
deployment, set `NODE_ENV=production`, `DB_PROVIDER=postgres`, and
`DATABASE_URL` in Railway.

For Neon, use the rotated Neon connection string as a sealed Railway
`DATABASE_URL` variable and set `NODE_ENV=production` plus
`DB_PROVIDER=postgres`. Do not put production credentials in `.env`, source
control, build arguments, or support messages. The application initializes its
schema at runtime and reports `managed-postgres` through `/api/v1/health`.

For Zoho Mail API delivery, set `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`,
`ZOHO_REFRESH_TOKEN`, and `MAIL_FROM`. `ZOHO_ACCOUNT_ID` is optional: when it
is omitted, the backend uses `ZohoMail.accounts.READ` to discover the account
or alias matching `MAIL_FROM`.

### Restore the downloaded Neon backup

Validate the rescue archive without connecting to a database:

`npm run db:restore:neon -- --inspect`

To restore it, first deploy or start the application once so its PostgreSQL
schema exists. Put the target Neon URL in the git-ignored
`neon-restore-url.private` file:

`TARGET_DATABASE_URL=postgresql://...`

Run `npm run db:restore:neon` for a read-only schema and row-count check. It
prints the exact `--confirm-target` value required for the write. After checking
the target, rerun with that confirmation plus `--apply --replace-existing`.
The restore runs in one transaction, replaces rows in the backed-up tables,
synchronizes identity sequences, verifies every row count, and rolls back if
anything fails. Finally, set Railway's sealed `DATABASE_URL` to that same Neon
URL and keep `NODE_ENV=production` and `DB_PROVIDER=postgres`.

If Railway SQLite is used instead, attach a persistent volume to the web
service at `/app/data`, then set `NODE_ENV=production`, `DB_PROVIDER=sqlite`,
and `SQLITE_DB_PATH=/app/data/local.db`. Production startup intentionally fails
when Railway SQLite has no mounted volume, preventing a silent empty database
from being created inside a disposable deployment container. Configure daily,
weekly, and monthly volume backups before entering production customer data.

`GET http://localhost:4000/health` locally—or `/api/v1/health` through the
deployed web app—reports the active database provider, location, persistence
status, and storage mode so storage can be verified before changing data.

`npm run start` serves the previously generated production build. Run `npm run build` before using it.

## Verification

- Frontend type check: `npm run lint`
- Frontend production build: `npm run build`
- Backend financial-flow tests: `cd bluecrestback && npm test`
- Ledger reconciliation: `cd bluecrestback && npm run ledger:reconcile`

Ledger reconciliation is read-only. It reports mismatches and exits with a non-zero status without changing balances.
