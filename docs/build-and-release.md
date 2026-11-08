# Build and release pipeline

Repository: https://github.com/kudium/web-browser (private).
Website: https://browser.kudium.com.

## Every change

Open a pull request to `main`. Website changes run Bun type checks, API/auth/sync
integration tests against a dedicated PostgreSQL 18 service, and a Docker build.
Browser changes run TypeScript and Jest on Windows and Linux. Paid macOS checks are optional when manually running Browser checks with include_macos enabled.

After website changes reach `main`, successful web checks trigger Coolify. The job
pins the checked commit, waits for that deployment to finish, verifies its commit,
and checks public readiness. Superseded commits are skipped. Coolify's direct
push auto-deploy is disabled, so it cannot bypass these checks. Desktop-only
changes do not redeploy the website.

GitHub workflow names: **Web checks and deployment**, **Browser checks**, and
**Browser release**. Workflows can also be run manually from the Actions tab.

## Local builds and releases (recommended)

Run these from the repository root on a Mac:

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
ZIPs and installer digests, pushes the existing tag, and retries immutable uploads
without rebuilding. Never change a published version's artifacts. If a build
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

Installers are uploaded in verified chunks, completed immutably, then the selected targets’
manifests are registered atomically in PostgreSQL. Public downloads do not require
GitHub access. The server exposes `/updates/stable/<platform>/<arch>/latest*.yml`
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
