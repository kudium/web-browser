# Deploy browser.kudium.com

This service is prepared for **https://browser.kudium.com**. It is not deployed
by committing these files. Use the existing PostgreSQL server and a Linux host with
Docker Compose v2, reachable from your domain. The container build context is
`apps/web`, not the desktop repository root.

## Configuration

```sh
cd apps/web
cp .env.example .env
mkdir -p release-assets
```

Set `DATABASE_URL` to a database reachable **from the Docker container**. Container
localhost is not the host machine. Prefer your database's private address/DNS and
its required TLS settings. Do not expose PostgreSQL publicly. Give migrations their
required schema privileges; use separate restricted runtime/release roles when
operationally available.

Set `BETTER_AUTH_URL=https://browser.kudium.com` and generate a persistent
`BETTER_AUTH_SECRET` with `openssl rand -base64 48`. Better Auth runs inside the
app with your PostgreSQL database; no external identity provider is needed.
Configure `SMTP_URL` and `SMTP_FROM` to enable email verification and password
recovery. Without SMTP, accounts can sign in but email ownership is not verified.
Migrations create the auth tables before the app starts.

`RELEASE_ASSET_ORIGINS` should include `https://browser.kudium.com` for local
release assets, plus only the other exact origins you actually use. Credentials
stay in the server's untracked `.env`, or your hosting platform's secret store.

## Launch

Point the domain's DNS at the host. If using Cloudflare proxying, use **Full (strict)**
TLS to the origin and bypass caching for `/v1/*` and `/updates/*`. Do not cache
Authorization-bearing requests. Open TCP 80/443 (and UDP 443 if using HTTP/3).
Caddy provisions and renews the origin TLS certificate; its state lives in volumes.
If your hosting platform already terminates HTTPS, deploy only the Bun container
on port 3000 behind that proxy and reproduce the `/downloads` static-file route.

```sh
docker compose up --build -d
docker compose ps
curl --fail https://browser.kudium.com/ready
```

Compose runs migrations to completion before starting the app, and waits for app
health before starting Caddy. The Bun port and PostgreSQL port are not published.
The domain returned HTTP 503 when checked on November 7, 2026; DNS already resolves,
but its existing origin configuration must be updated by the server owner.

Caddy access logging is not enabled. The built-in app limiter is per-account and
per-process. Configure Cloudflare/your edge to limit unauthenticated abuse before
scaling; this Compose file does not supply a distributed limiter.

## Release assets and publication

On a build/signing host, run `npm run package:web` at the monorepo root. Build each
architecture into its own output/staging directory so updater metadata contains
only the intended architecture. Keep all artifacts and adjacent blockmaps from that
build. macOS needs the updater ZIP as well as the DMG for manual downloads.

Copy signed artifacts into the server's `release-assets/<version>/<platform>/<arch>/`
directory using your trusted deployment channel (SSH/CI). Caddy serves that directory
read-only as `/downloads/`; there is no public upload endpoint. For example:

```text
https://browser.kudium.com/downloads/1.0.1/darwin/arm64/Kudium-1.0.1-arm64.zip
```

Keep previous artifacts/blockmaps available for differential updates. Only publish
the database manifest after all referenced files are accessible over HTTPS:

```sh
docker compose run --rm --no-deps \
  -v "$PWD/manifest.json:/tmp/manifest.json:ro" \
  web bun scripts/publish-release.ts /tmp/manifest.json
```

See the service README for manifest schema, actual SHA-512 hashes and sizes. The
job uses the container's database credentials; a dedicated release role is preferable.
`package:web` embeds the domain's platform/architecture-specific feed, while ordinary
`npm run package:browser` keeps the existing GitHub update configuration. Do not distribute
web-feed builds before a corresponding feed and signed assets are live.

Verify the homepage, docs and per-target YAML feed. Then test actual installation
and updating with signed packaged builds on macOS, Windows and Linux. Source/API
tests do not substitute for OS update installation tests.

## Redeploy and data retention

```sh
docker compose up --build -d
```

Take PostgreSQL backups before schema changes and manage their retention. Persist
release assets separately from containers. `docker compose down` leaves volumes;
do not use `down -v` during routine redeployment. Backup deletion, event compaction,
desktop account connection, key enrollment and recovery remain separately documented work.
