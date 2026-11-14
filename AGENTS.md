<!-- kudium:browser-reference:start -->
This project is linked to Kudium Browser. Read [BROWSER.md](BROWSER.md) for browser integration and linked group context.
<!-- kudium:browser-reference:end -->

## Builds, versions and releases

Read [docs/build-and-release.md](docs/build-and-release.md) before changing or
running release tooling. The implementation is
[scripts/local-release.mjs](scripts/local-release.mjs); the root `package.json`
defines these commands, run from the repository root on a Mac:

| Command | Purpose |
| --- | --- |
| `npm run release:test` | Build the current working edits for this Mac only. Produces an unsigned, unnotarized DMG/ZIP. Does not create a version/tag, push, or publish. |
| `npm run release:beta` | Automatically version, test, build, sign and notarize Apple Silicon and Intel installers locally, verify both targets, push the source commit/tag, and publish the beta channel. |
| `npm run release:stable` | The same local process for the stable channel. |

### Execution and authorization

- Local Mac builds are the primary release route. GitHub Actions quota/budget
  is exhausted. Do not invoke hosted workflows, use a self-hosted Actions runner
  as a workaround, or raise the budget unless the user explicitly authorizes it.
- A request to build or test does not authorize publication. Use `release:test`
  for local testing. Beta/stable commands push source and change public download
  and update feeds; run them when the user requests that channel's release.
- Beta/stable require a clean `main` checkout with committed changes. Do not
  commit unrelated working edits, discard them, or bypass this requirement to
  make a release command run. Inspect Git status and explain missing prerequisites.
- Releases build the selected commit in an isolated local clone. They check
  remote tags/main, run TypeScript and tests, verify Kudium Developer ID signing,
  hardened runtime, notarization tickets and Gatekeeper, then validate installer
  checksums before pushing/publishing. Do not skip these checks.
- `release:test` targets the current Mac's architecture; beta/stable target
  macOS arm64 and x64. These commands do not build Windows or Linux installers.
- All hosted workflows are manual-only. Local builds and release pushes do not
  require GitHub Actions. Keep automatic push/PR triggers disabled and do not
  dispatch hosted work unless the user explicitly authorizes it. Website
  auto-deployment is configured separately in Coolify and does not wait for
  GitHub checks.

### Version selection and recovery

- Versions come from Git tags through `scripts/ci/select-browser-release.mjs`.
  From stable `v1.0.1`, beta progresses `v1.0.2-beta.1`,
  `v1.0.2-beta.2`; stable graduates the pending base to `v1.0.2`.
  Without a pending beta, automatic stable increments the patch version.
- `--bump patch|minor|major` selects an explicit bump. `--dry-run` previews
  using local tags without building, pushing, uploading or checking credentials;
  the real run fetches tags and may select a different version.
- Version preparation updates the browser and packaged app `package.json` files
  only inside the release clone. Do not manually bump the user's checkout or
  confuse the root monorepo version with the selected installer version.
- Stable rebuilds the selected source commit; it does not promote old beta
  binaries. `release:test` retains the current package version and creates no tag.
- If a verified build's push/upload fails, use the same channel command with
  `--retry <tag>` to verify and publish the retained artifacts without rebuilding
  or selecting another version. Incomplete builds cannot use publication retry.
  Published version artifacts are immutable; never overwrite them.

### Credentials, outputs and publication

- Signing uses `Developer ID Application: Kudium LTD (79VCL28M9P)` and its
  private key in Keychain. Apple Distribution alone is insufficient. The user
  must enter Keychain passwords locally; never request passwords/key contents in chat.
- Local config: `~/Library/Application Support/Kudium/release.json`, outside
  Git with owner-only permissions. Fields: `appleApiKeyPath`, `appleApiKeyId`,
  `appleApiIssuer`, and `publishToken`. `KUDIUM_RELEASE_CONFIG` overrides its
  location; shell credential variables override its fields. Check availability
  privately rather than assuming previously configured credentials still exist.
- Never print or commit signing keys, notarization key contents or publication
  tokens. Missing credentials must stop a real release before building.
- Test artifacts: `apps/browser/release/local-test-<timestamp>/`.
  Versioned artifacts: `release-artifacts/local/<tag>/`, retaining `builds/`,
  `installers/`, the isolated `source/` clone, `release.json` and `build.log`.
  These directories are Git-ignored; installer binaries are not committed.
- Publication uploads verified installers directly from the Mac to
  `https://browser.kudium.com` using `scripts/ci/publish-browser-release.mjs`.
  It is separate from building and does not require a GitHub build runner.
  GitHub receives the source commit and version tag, not installer binaries.
- The backend keeps published version manifests and exposes `/releases` and
  `/v1/releases?channel=all&page=1` for release history, notes and downloads.
  Stable/beta auto-update feeds still select the latest matching version.
  History browsing does not change a user's installed version.
- Website deployment is separate from installer publication. Local website
  edits are not live until deployed to the backend. Do not claim deployment or
  working iCloud support based only on a successful signed installer build.

## Website showcase and demo photography

Before updating product screenshots or website appearance examples, read
[apps/browser/demo/SHOWCASE.md](apps/browser/demo/SHOWCASE.md).
Reuse the fictional Atlas Studio fixture and disposable capture profile. Refresh
real UI captures, WebP derivatives and verification manifest together; visually
inspect the results and update website asset allowlists and cache versions.
