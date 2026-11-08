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

## Beta releases

After merging and verifying checks, choose the next version and tag that commit:

```sh
git tag v1.1.0-beta.1
git push origin v1.1.0-beta.1
```

The release workflow builds and signs macOS Apple Silicon and Intel. Only after
both Mac targets succeed does it publish installers and
advance the beta feed. Installing a beta web-feed build opts into beta updates;
stable installations continue using stable updates. Increment the beta number for
each new build. Tags and published artifacts must never be rewritten.

To build a beta without publishing, use **Browser release → Run workflow** on
`main`, enter the existing tag, and leave `publish` unchecked.

## Stable releases

Push an existing main-branch commit as `v1.1.0`. Pushing a stable tag builds unsigned
artifacts for inspection; it does not publish to users. To publish, run **Browser
release** manually on `main`, enter that tag, and enable `publish`. This explicit
run rebuilds, signs, notarizes macOS, and publishes the selected targets together.
Select `macos` for both Mac architectures, or `all` when Windows signing is configured.
The default target is `macos`, including tag-triggered beta builds.
Windows x64 and Linux x64 remain available through the manual `all` option once
Windows signing credentials are configured.

The manual `publish` input is the approval step. GitHub environment reviewer rules
are not configured; this is not a second-person review gate. Anyone with workflow
write access can request publication. CI artifacts expire after 14 days; published
downloads live on the server's persistent release volume.

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

To publish a Mac release after tagging a tested main commit:

```sh
gh workflow run browser-release.yml --ref main -f tag=v1.0.0 -f targets=macos -f publish=true
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
