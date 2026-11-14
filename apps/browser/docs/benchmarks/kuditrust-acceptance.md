# KudiTrust account acceptance

November 14, 2026, macOS arm64, Electron 45 / Chromium 156. All seven checks passed
in the production Kudium workspace/backend with disposable profiles:

- Public HTTPS entry and sign-in control.
- User-authorized test-account password sign-in reaches the authenticated dashboard.
- Reload retains authentication.
- Another tab in the shared group remains authenticated.
- An isolated group redirects to sign-in.
- A fresh private session requires sign-in, authenticates independently, clears all
  KudiTrust cookies after its last window closes and preserves regular authentication.
- Regular sign-out denies authenticated access in both shared-profile tabs.

The login page also exposes Google and passkey controls. Their presence establishes
entry coverage only; provider authentication and device-backed passkeys remain open.
Actions use controlled page activation and focused input. Native visual/input
acceptance is separate. No purchases, transfers, messages or profile/security
changes were performed.

`kuditrust-acceptance.json` records results and source hashes without credentials,
cookies, tokens or authenticated account details. Temporary credential files and
disposable profile data from this run were removed afterward.

Replay from `apps/browser`, using a private local JSON file with `username` and
`password` fields supplied outside the repository:

```sh
KUDIUM_TEST_CREDENTIALS_FILE=/absolute/private/credentials.json npm run test:kuditrust
```

The runner exits 1 if credentials are absent or any required check is incomplete.
Keep the credential file owner-readable only and remove test profiles after replay.
