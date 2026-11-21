# Build and release pipeline

Repository: https://github.com/kudium/web-browser (public).
Website: https://browser.kudium.com.

## Every change

Build and validate changes locally before pushing to `main`. GitHub Actions
checks and installer release workflows are manual-only; pushes and pull requests
do not start hosted jobs. Local installer releases keep their required validation,
signing, notarization and publication checks.

Website deployment no longer runs through GitHub Actions. Configure Coolify's
website application to auto-deploy `main`, with its commit selector set to `HEAD`
(rather than a previously pinned SHA). Coolify then builds website pushes directly,
without waiting for GitHub checks. This setting must also be enabled in the live
Coolify application; changing this repository does not enable it remotely.

Run website type checks and tests locally (`npm run check:web`, `npm run test:web`);
API/auth/sync integration tests require a dedicated PostgreSQL 18 test database.
Verify the website Docker build before deploying. Desktop installer publication
and website deployment remain separate operations.

Public website Analytics uses `/analytics-policy` to decide whether to ask for
consent. An offline `geoip-country` database determines the visitor country;
refresh its pinned package periodically. Confirmed EEA, UK and Switzerland
locations require opt-in; other and unknown locations default to enabled,
including when the policy request fails or times out. Saved declines,
Do Not Track and Global Privacy Control override automatic enablement. Advertising
features remain disabled and account/auth pages never load Analytics. Country
lookup uses the socket IP or the last X-Forwarded-For address appended by an
internal reverse proxy. Keep the backend behind that proxy and preserve its
client-IP forwarding; never use browser language or a client country header.

GitHub workflows remain available for explicitly authorized manual fallback use.
The manual **Web checks (manual)** workflow validates only; it does not deploy.

## Local builds and releases (recommended)

Run these from the repository root on a Mac:

Real release commands prevent idle sleep while running. Keep the Mac plugged in
with its lid open until publication finishes: closing the lid can suspend network
transfers despite the sleep assertion, causing timeouts and connection resets.
A publication retry reuses completed GitHub assets, but an interrupted large file
must upload again because GitHub asset uploads are not resumable.

| Command | Result |
| --- | --- |
| `npm run release:test` | Builds your current edits for this Mac. Creates a local DMG/ZIP without pushing, publishing, or changing the release version. Test builds are unsigned and unnotarized. |
| `npm run release:beta` | Selects the next beta version, builds and verifies both Mac architectures locally, pushes main and the version tag, and publishes the beta download/update feed. |
| `npm run release:stable` | Selects the next stable version, builds and verifies both Mac architectures locally, pushes main and the version tag, and publishes the stable download/update feed. |

Install browser dependencies first with `npm run install:browser`. Beta/stable
require a clean `main` checkout: commit your changes before running them. They
fetch remote tags, reject a main branch that has fallen behind origin/main, and
build the selected commit in an isolated local clone. Your working checkout and
its version files are preserved. Versions are embedded in the build checkout,
using the same preparation script as hosted releases.

The isolated build explicitly runs Electron's runtime installer after `npm ci`,
before tests. Electron 45 no longer performs that step automatically; its installer
verifies the upstream distribution checksum and can reuse the local download cache.

Beta/stable builds also run `test:extension-side-panels` before packaging. This
uses real extension frames and classic/module workers in disposable Mac
profiles to verify the sidebar API, resource isolation, tab-specific options,
active-profile changes, user-gesture enforcement, events and unload cleanup.
See [sidebar panels](../apps/browser/docs/sidebar-panels.md) for the reusable
React/native host contracts and extension compatibility boundaries.

Signed release apps include `Contents/Resources/app-update.yml` before signing,
including when the initial build uses `--dir`. ZIP and DMG verification rejects missing
metadata or the wrong channel/architecture feed. Versions 1.0.18 and 1.0.19
omitted this file and cannot check for updates; affected users need to install
the corrected stable DMG manually once. Never modify an installed signed bundle
or overwrite an already published version to repair this.

Incident prevention: inspect the update metadata in both architectures' final
ZIPs and DMGs, and retain signature, notarization and Gatekeeper verification.
Do not bypass the metadata gate. A successful build or public feed check alone
does not prove the installed updater works. When confirming an installed app,
check its actual version, metadata and a successful update check in logs or UI.
Report release verification separately from installed-app verification. The
manual recovery release for 1.0.18/1.0.19 is 1.0.20 or later; those broken
versions cannot discover the correction automatically.

The local beta/stable release pipeline runs the updater packaging regression
tests automatically after dependency installation. Before collecting or
publishing installers, `verify-macos-release.mjs` extracts the ZIP and mounts the
DMG read-only, validates both apps' release version and updater settings, and
checks their signatures, notarization tickets and Gatekeeper acceptance. Both
formats must contain identical updater metadata. Publication retry runs this
same verification again; missing or incorrect metadata is a hard failure.

Custom Electron runtime preparation is separate from installer releases. The
`runtime:prepare`, `runtime:sync`, `runtime:build` and `runtime:verify` commands
prepare pinned source and local Mac distributions without pushing, signing or
publishing. See [browser passkeys](../apps/browser/docs/passkeys.md) for disk
requirements, target architectures and replay instructions. Current installer
release commands still select stock Electron; verified custom distributions and
Apple-approved provisioning must be integrated before releasing native passkey
support.

Starting from stable `1.0.1`, beta commands create `1.0.2-beta.1`, then
`1.0.2-beta.2`. Stable releases that pending version as `1.0.2`; the next beta
starts `1.0.3-beta.1`. With no pending beta, stable increments the patch. For a
larger jump, use `npm run release:beta -- --bump minor` (or `major`). Stable
rebuilds the selected main commit rather than reusing an earlier beta's binaries.

Preview either release with `--dry-run`; this reads local tags and performs no
build, push, upload, or credential checks. A real run fetches the latest tags,
so its chosen version may differ from the preview.

Test outputs are retained under `apps/browser/release/local-test-<timestamp>/`.
Versioned releases retain installers, build outputs, the isolated source clone,
source commit metadata and `build.log` under `release-artifacts/local/<tag>/`.
Build tool output goes to that log; the terminal displays each release stage.
Both architectures must pass type checks, tests, signing/notarization checks and
checksum validation before a tag is pushed or any channel is published.

Both signed application bundles are submitted to Apple before waiting for review.
Each build retains `notarization.json` with its submission ID, signed code hash
and uploaded archive checksum. Short status requests retry transient failures
without submitting again. Only an accepted, unchanged application is stapled and
packaged into its final DMG/ZIP; both targets still undergo full verification.
The finalization command can continue checking an existing submission after a
status-command failure; this is not the publication `--retry` option and does
not authorize publishing incomplete builds.

The new commands are macOS-only. Windows/Linux publication remains available
through the optional hosted release workflow once Windows signing is configured.

### One-time local credential setup

Install the Kudium LTD Developer ID Application certificate and private key in
Keychain. macOS may request your login password and permission for codesign to
use that key. Enter passwords locally, never in chat or repository files.

Create `~/Library/Application Support/Kudium/release.json` with these fields:

```json
{
  "appleApiKeyPath": "/absolute/private/path/AuthKey_KEYID.p8",
  "appleApiKeyId": "YOUR_KEY_ID",
  "appleApiIssuer": "YOUR_ISSUER_UUID",
  "publishToken": "YOUR_RELEASE_PUBLISH_TOKEN"
}
```

Use owner-only permissions (`chmod 600` on this file) and keep it outside the
repository. `KUDIUM_RELEASE_CONFIG` can select another absolute config path.
Existing shell environment variables override file settings. API key contents
are loaded privately for the build and are never printed by the release runner.
Install GitHub CLI (`gh`) and authenticate with permission to write releases in
`kudium/web-browser`. Release preflight checks this before building. Local `gh`
credentials stay outside the repository; manually authorized hosted fallback jobs
use their contents-write `GH_TOKEN`.

An Apple ID/app-specific password/team ID environment configuration is also
supported by the existing notarization hook. No publication token is needed for
`release:test`.

### Retry a publication

If verified builds completed but push/upload failed, retry the same artifacts:

```sh
npm run release:beta -- --retry v1.0.2-beta.1
# Or, for the stable channel:
npm run release:stable -- --retry v1.0.2
```

The runner checks the retained version/source record, rechecks the signed update
ZIPs and installer digests, pushes the existing tag, and retries matching GitHub
assets and manifest registration without rebuilding. If GitHub publication succeeded
but feed registration failed, the same retry reuses the published assets. Never change a published version's artifacts. If a build
fails before it has verified both architectures, inspect its log and move the
failed artifact folder aside before rebuilding; incomplete builds cannot be
published with `--retry`.

### Hosted fallback

**Actions → Browser release → Run workflow** still supports beta/stable,
automatic or explicit version bumps, and macos/all targets. It builds on paid
GitHub runners, so use it only when needed. Pushing a tag no longer starts this
workflow. Hosted Mac checks are likewise opt-in on Browser checks. Neither local
release command invokes a hosted Mac build.

## Secrets

Already connected:

- `COOLIFY_DEPLOY_URL`
- `COOLIFY_API_TOKEN` (Read, Write, Deploy; scoped to the website application)
- `RELEASE_PUBLISH_TOKEN` (shared with the backend runtime)

macOS signing and notarization are connected for Kudium LTD (team `79VCL28M9P`).
The dedicated App Store Connect key **Kudium Browser macOS CI** has Developer access.
The Developer ID Application certificate expires December 8, 2027.

Signing secrets in **Settings → Secrets and variables → Actions**:

- `MAC_CSC_LINK`: base64-encoded macOS Developer ID Application certificate (.p12).
- `MAC_CSC_KEY_PASSWORD`: its certificate password.
- `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`: dedicated App Store Connect team key for notarization. The private `.p8` is materialized with mode 0600 only during notarization and removed afterward.
- `APPLE_TEAM_ID`: Kudium Apple team. `APPLE_ID` and `APPLE_ID_PASS` remain a supported fallback when API credentials are absent.
- `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`: Windows signing certificate and password
  required only for `all` publication, and not yet connected. A hardware/cloud signing service requires adapting
  the signing step to that provider.

Publication fails before building when required secrets are missing. Do not put
certificate passwords or tokens in commits or chat. Linux installers have verified
checksums; macOS and Windows installers also use operating-system code signing.

## Downloads and updates

Signed installers and blockmaps are uploaded from the local Mac to public GitHub
Releases in `kudium/web-browser`. No GitHub Actions runner is used. The publisher
creates a draft for the source tag, verifies all local SHA-512 checksums, uploads
up to three files concurrently over IPv4 using curl with credentials passed through
stdin, covering both architectures, compares sizes and SHA-256 digests with GitHub's asset API,
then publishes the release and verifies public download access. Existing assets
must match exactly; published assets are never overwritten or added to.

Only the small release-manifest JSON goes to
`https://browser.kudium.com/internal/releases/manifests`. The backend verifies
the exact repository/tag, public release channel, asset sizes and GitHub SHA-256
digests before atomically registering all targets. Manifest SHA-512 checksums
remain available to electron-updater. Installer bytes no longer use Kudium's
chunk-upload endpoint. Existing hosted installers remain available.

Installed browsers retain their existing update-feed URLs; no manual reinstall
is needed for builds already using the web feed. The feeds and website downloads
point directly to public GitHub release assets. Public downloads require no login. The server exposes `/updates/stable/<platform>/<arch>/latest*.yml`
and `/updates/beta/<platform>/<arch>/beta*.yml` for electron-updater.

macOS publication includes ZIPs for updates and DMGs for manual installation.
CI extracts the update ZIP and verifies Kudium Developer ID signing, hardened
runtime, the stapled notarization ticket, and Gatekeeper acceptance before upload.
Both macOS architectures must succeed before either feed advances.

The paid hosted fallback is also available from the command line:

```sh
gh workflow run browser-release.yml --ref main -f channel=stable -f bump=auto -f targets=macos
```

Windows and Linux ARM builds are not included. Keep old installers and blockmaps;
back up the release volume and database together. Backend checks verify API and
checksum behavior; release acceptance still needs actual OS installation/update tests.

## Retry publication without rebuilding

If installer upload fails after both signed Mac build jobs pass, run **Publish
existing signed Mac build** on `main` with the tag and original Browser release
run ID. It requires successful signing/notarization verification jobs, downloads
those exact CI artifacts, checks their version, and retries immutable uploads.
It does not rebuild already signed installers.

Coolify uses manually managed proxy labels for this application. The dedicated
`kudium-browser-downloads` compression middleware excludes `text/event-stream`
and `application/octet-stream`. Keep these exclusions when changing domains or
resetting labels: gzip on installers removes file lengths and prevents the CDN
from serving byte ranges. The publisher also verifies response checksums if a
CDN omits `Content-Length`.


## Release completion evidence

A release is complete only after public release history and every selected update
feed advertise the version and GitHub asset URLs. The publisher performs these
checks and records `publication.json` beside retained `release.json`. A Git tag,
signed build, public GitHub release, or website deployment alone is insufficient.
If manifest registration or live verification fails, report that users still see
the old feed and resume the same authorized release with `--retry <tag>`.


### Recovering the hosting migration

Previously verified files in the legacy release volume can be mirrored into an
existing GitHub draft via the authenticated `/internal/releases/github-mirror`
route. It checks the legacy SHA-512 metadata and the actual file SHA-256, then
streams the file from the server to the fixed `kudium/web-browser` repository.
The caller supplies GitHub authorization transiently in a header; it is never
stored or logged. This recovery does not register manifests or advance feeds.
The normal local publisher subsequently verifies every GitHub asset and publishes
both architecture feeds. Legacy chunk status can be inspected through the
authenticated upload `/status` route to finish an already-started archive.

For a slow connection, retained chunk recovery accepts explicit `chunkBytes: 1048576`
with up to 1024 parts, while existing uploads keep their eight MiB default.
Use one MiB chunks to stay below proxy request-body timeouts; completion still
requires the original full installer size and SHA-512.
