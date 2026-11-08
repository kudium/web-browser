# Build and release pipeline

Repository: https://github.com/kudium/web-browser (private).
Website: https://browser.kudium.com.

## Every change

Open a pull request to `main`. Website changes run Bun type checks, API/auth/sync
integration tests against a dedicated PostgreSQL 18 service, and a Docker build.
Browser changes run TypeScript and Jest on macOS Intel, Windows, and Linux.

After website changes reach `main`, successful web checks trigger Coolify. The job
pins the checked commit, waits for that deployment to finish, verifies its commit,
and checks public readiness. Superseded commits are skipped. Coolify's direct
push auto-deploy is disabled, so it cannot bypass these checks. Desktop-only
changes do not redeploy the website.

GitHub workflow names: **Web checks and deployment**, **Browser checks**, and
**Browser release**. Workflows can also be run manually from the Actions tab.

## Publish a release

After pushing code to `main`, open **Actions → Browser release → Run workflow**:

1. Keep the branch set to `main`.
2. Choose `beta` or `stable` in the channel dropdown.
3. Leave version bump as `auto` and targets as `macos`.
4. Click **Run workflow**.

That single action creates a tag for the main commit selected when the run starts,
runs tests, builds both Mac architectures, signs and notarizes the apps, verifies
them, and publishes the installers and chosen update feed.

Version numbers are automatic. Starting from stable `1.0.1`, beta runs create
`1.0.2-beta.1`, then `1.0.2-beta.2`. Choosing stable releases `1.0.2`; the next
beta starts `1.0.3-beta.1`. A stable run with no pending beta increments the patch.
Automatic mode continues the highest pending beta version, including minor or
major betas, and stable uses that same base version.

For a deliberate version jump, select `patch`, `minor` or `major`. These calculate
from the latest stable tag: `1.0.1` becomes `1.0.2`, `1.1.0` or `2.0.0` respectively.
Existing beta numbers for that base version continue incrementing. Tags and
published artifacts are immutable; failed attempts can consume a tag number.
The pipeline checks credentials before creating a tag, and publishes only after
both signed builds pass. Releases always build the selected main commit; selecting
stable does not reuse an older beta's binaries.

Selecting `stable` and clicking **Run workflow** requests production publication;
there is no separate publish checkbox or tag creation step. GitHub environment
reviewer rules are not configured. CI artifacts expire after 14 days; published
downloads live on the server's persistent release volume.

Advanced developers can still push beta tags to publish automatically. Pushing a
stable tag runs an inspection build; use the one-action release flow above with a
automatically selected version for signed publication. Windows x64 and Linux x64 remain available
through the optional `all` target once Windows signing is configured.

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

The same one-action flow is available from the command line:

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
