# Owned extension updates — November 7, 2026

The installed dependency previously removed the old extension, loaded a downloaded update without fresh permission review, and deleted the old package. Updates now delegate to the main process; a dependency caller without that delegate is denied before download.

The main process binds the live profile/owner revisions and catalog revision before checking for updates. Each candidate passes through the immutable package preparer, with actual permissions and version displayed in a local review. Declined or stale reviews and changed packages produce no native loads. Accepted updates preserve existing profile scope. Checks run before native removal/load and after acknowledgment. Failed loads attempt restoration of the old package; recovery does not overwrite a changed catalog policy or reload into a changed owner. Old packages remain available rather than being deleted during update. Duplicate profile updates are reviewed once per pass.

Update metadata uses a 30-second deadline, rejects redirects and has a 1 MiB streaming ceiling. Candidate CRX downloading/signature verification and extraction retain the earlier bounded transport checks. Review/preparation has a two-minute deadline.

Verification:

- Five main-process cases: approved, declined, changed/restored owner, changed copied package and failed native load with restoration.
- Installed CommonJS and ESM updater regressions: missing delegate, declined delegate, delegated apply/old-package retention, and bounded metadata. Registered in `npm test`.
- Full current suite: 145 suites / 746 tests pass. Full lint/types and production build pass.

These use controlled reviews/native session fixtures; they do not prove actual remote-store update UI or native acknowledgment/crash behavior. Durable catalog/recovery journals, cached-package authenticity, storage exhaustion from retained old versions and signed cross-platform behavior remain release work.
