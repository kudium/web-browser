# Deploy browser.kudium.com

Production runs on Coolify in the Kudium App / production environment. The app
uses the Dockerfile in `apps/web`, port 3000, PostgreSQL, and Better Auth. The live
site is https://browser.kudium.com. See [the pipeline guide](../../../docs/build-and-release.md)
for checks, automatic deployments, beta tags, and stable publication.

## Configuration

Set these runtime variables in Coolify (or an untracked `.env` for Compose):

- `DATABASE_URL`: the PostgreSQL address reachable from the container.
- `BETTER_AUTH_URL=https://browser.kudium.com`
- `BETTER_AUTH_SECRET`: a persistent secret generated with `openssl rand -base64 48`.
- `RELEASE_ASSET_ORIGINS=https://github.com,https://browser.kudium.com`
- `RELEASE_STORAGE_PATH=/app/release-assets`
- `RELEASE_PUBLISH_TOKEN`: at least 64 characters; the same value is stored in GitHub Secrets.

The release path must have a persistent Docker volume. Production uses the named
volume `3c3fw5d1oyjgfz5iztkeoka2-kudium-browser-releases`. The image creates the
mount directory owned by Bun before Docker initializes the volume. A root-owned
host bind mount needs its permissions configured separately.

Set `SMTP_URL` and `SMTP_FROM` to enable email verification and password recovery.
Migrations run before startup. Keep database and authentication credentials in the
hosting secret store. GitHub Actions never needs production database credentials.

## Local Docker Compose alternative

```sh
cd apps/web
cp .env.example .env
# Populate the variables above before starting.
docker compose up --build -d
curl --fail https://browser.kudium.com/ready
```

Point DNS at the Docker host and allow TCP 80/443. Caddy handles HTTPS and proxies
all routes to Bun, including downloads. If Cloudflare is used, set Full (strict)
TLS and bypass caching for `/api/auth/*`, `/v1/*`, `/internal/*`, and `/updates/*`.
Never cache authenticated requests. Bun serves only completed installer files;
metadata and incomplete chunks stay private.

## Release publication and retention

Local releases upload signed installers and blockmaps to public GitHub Releases
in `kudium/web-browser`. Only authenticated manifest JSON reaches this backend.
The backend accepts exact versioned GitHub asset URLs after checking the public
release channel, uploaded state, size and SHA-256 digest through GitHub's API.
Keep `https://github.com` in `RELEASE_ASSET_ORIGINS` alongside the website origin.
Existing `/updates` URLs continue serving SHA-512 metadata with GitHub download
URLs. Legacy local downloads and their persistent release volume remain intact.

An ordinary `package:browser` build retains the GitHub feed. `package:web` embeds
this service's channel, platform, and architecture feed. Existing installations
need a web-feed build before they can use this service's updater.

Keep previous installers and blockmaps for existing users and differential updates.
Back up both PostgreSQL and the release volume. Routine deployments preserve data;
do not delete volumes during redeployment. Verify actual installation and updating
on supported operating systems before announcing a release.
