# Storage migration fixture provenance

`storage-migration-v1.json` freezes synthetic unversioned schema-1 values for the unit transport codec. It includes a populated conversation/history/draft, task/run, credential, provider key and vault summary, plus an unknown optional field that must survive migration.

It is **not** a profile produced by an actual previous public release. Unit tests using a mock OS transport or fabricated signing receipts test the gate implementation, not release readiness. The release gate rejects `unit-transport` provenance and empty source-version policy.

Real upgrade fixtures must be created through the trusted UI of each registered previous signed release, on the same native OS/keychain account used for the candidate upgrade. Use only synthetic data; keep complete profile snapshots and their OS-bound keys private to that runner. Publish only sanitized scenario receipts, counts, public installers, signing verification and their SHA-256 hashes. Register source versions/stores in `docs/releases/storage-migration-policy.json` only with matching archived release artifacts. See `docs/specs/storage-migration-and-release-safety.md` for the protocol.
