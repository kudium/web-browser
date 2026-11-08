# Storage migration and release safety

Status: implementation preparation complete; signed previous-release upgrade matrix pending.

## Objective and acceptance rule

An update must preserve existing user data when encryption, schema, Electron runtime or branding changes. Successful startup or a fresh encryption round trip alone is insufficient evidence. An unreadable source must remain recoverable: never replace it with an empty store, generate a replacement key over an unreadable key, or silently discard fields. Migration does not authorize AI execution, transmission, scheduling or new privacy grants.

The current change supports legacy OS ciphertext to local AES-GCM format 1 and schema-1 validation. It is not a general converter for arbitrary future schemas or key rotation. Unknown versions block the affected store and preserve its bytes.

## Frozen identity and formats

`storageIdentity.ts` freezes the native OS identity as `Kudium Browser`. Set it before encryption initialization and preserve the selected userData path. Marketing rebranding must use window titles/About information; do not call `app.setName()` with a new brand. Bundle identifier, signer, OS keyring service, installer identity and profile selection are compatibility contracts requiring signed upgrade evidence before changes.

Legacy development records used the native name `Electron`. A development-only helper decrypts them under that original identity via private parent IPC. It logs and saves no plaintext and does not run in release executables. Packaged historical profile-name lookup is not proof that a previous packaged key is accessible.

The random 256-bit data encryption key is protected by Electron's asynchronous OS encryption API. Key metadata records format 1, algorithm, key fingerprint, envelope version and OS identity. Local records use AES-256-GCM, fresh 96-bit nonces and application-specific authenticated data. The unwrapped key remains in main-process memory. OS key changes rewrap the same data key; prior wrapped-key JSON is archived under `secure-storage/key-history/`. This is not data-key rotation. Unavailable OS protection, including `basic_text`, disables persistent secrets.

## Implemented migration boundary

The migrator handles these fixed paths only:

| File | Migrated content |
| --- | --- |
| `ai-checkpoint.bin` | Checkpoint JSON ciphertext |
| `ai-conversations.bin` | Conversations JSON ciphertext |
| `ai-tasks.bin` | Tasks/runs JSON ciphertext |
| `password-manager/os-key` | OS credential ciphertext |
| `ai-settings.json` | Provider-key ciphertext field |
| `password-manager/vault.json` | OS-encrypted summary field |

JSON wrappers retain other fields. The master-password-encrypted vault body remains unchanged. Schema validators reject unsupported container versions, malformed required fields, duplicate identifiers and invalid history/draft structures; unknown optional fields are preserved. Legacy-to-v1 migration verifies exact plaintext equality after encryption and read-back, rather than merely comparing record counts.

Electron-owned cookies, history/session databases, preferences, extensions, attachments and other profile files are outside this six-file migration. Before releases that change native database/encryption formats, take a full-profile snapshot with the browser and other profile writers stopped. A live recursive copy is not a consistent SQLite backup. Validate those resources separately under the actual signed updater.

## Durable transaction and interruption behavior

Migration ID: `os-ciphertext-to-local-aes-gcm-v1`.

The current pointer is `secure-storage/migration-journal.json`. Each random transaction retains `secure-storage/migrations/<uuid>/journal.json`, `backup/` and `staged/`. Journals contain ciphertext hashes, a random-key fingerprint, states and receipts; no user plaintext or plaintext hashes.

1. Persist the wrapped key; create and verify its encrypted recovery copy.
2. Preserve each original file before conversion. Persist its source ciphertext hash and `backed-up` state.
3. Decrypt, validate the supported schema, encrypt, decrypt the target and verify equality. Stage the complete replacement and persist its hash and `staged` state.
4. Before installation verify backups/staged bytes and ensure the active file matches either the recorded source or target hash. Unexpected concurrent edits block installation.
5. Atomically replace each file, read it back and persist `committed`. Complete the journal only when all entries commit. Failures become `blocked` and preserve original/staged bytes.
6. On restart, replay incomplete transactions using the same key. A target installed before its receipt was written can be recognized and committed again. Stores open after bootstrap; failed files remain unavailable.
7. Record at most two distinct successful main-window launch receipts. These are local health receipts, not proof that every user workflow passed.

Writes use bounded regular-file reads, owner-only files, temporary-file fsync, rename and directory fsync where supported; Windows directory fsync is not provided. Commits are per-file, not a single atomic whole-profile generation. Source-hash checks detect changes observed before replacement; they are not an OS-level compare-and-swap against hostile concurrent writers. Keep the normal single-writer lifecycle and test extensions/session writers separately.

Unreadable AI settings and vault summaries reject persistence over the existing file. Checkpoint, task and conversation recovery boundaries preserve unavailable sources. Initialization failure leaves the browser usable with persistent secrets disabled.

## Recovery, retention and downgrade

Run from the repository root, quoting profile paths:

```sh
npm run storage:recovery -- inspect '/path/to/profile'
npm run storage:recovery -- export '/path/to/profile' '/path/to/new-recovery-directory'
```

Inspection displays metadata only. Export verifies encrypted originals and their wrapped key before creating a new directory outside the active profile. It never restores in place. The manifest identifies the pre-migration snapshot and warns that later edits are absent. Use a clone for recovery; retain the current profile and reconcile later edits explicitly. OS-bound ciphertext may require the original account, keychain and compatible signed application.

Backups and wrapped-key history are never automatically deleted. The release policy requires at least two healthy launches and 14 days before any future retention feature may offer cleanup. That feature is not implemented; it must include explicit user recovery/export handling and tests. Files already converted before journaling was introduced have no retroactive original snapshot. Previously retained incident backups must remain available.

Do not run an old application directly against a newly migrated live profile. An old executable cannot read the new envelope. A full offline snapshot is needed for full-profile downgrade; this export covers only journaled encrypted originals.

## Future change requirements

For a schema change, assign a new schema version and migration ID. Add a deterministic converter for every supported source version, explicit validation of the target, fixtures demonstrating preservation of identifiers, ordering, drafts, permissions and optional fields, and interruption tests. Readers must reject unsupported future versions. Do not normalize unreadable data to an empty model.

For data-key rotation, first design per-record key identifiers, a versioned key ring, old-key retention, authenticated metadata and resumable conversion. The current single-key format does not implement this. Never overwrite the only key before all dependent ciphertext and recovery copies are verifiably accessible.

For linked multi-file schema changes, add a generation manifest or another consistency protocol so readers cannot combine incompatible generations after a crash. Current mixed legacy/v1 encryption is readable under one key, but this does not solve relational schema consistency.

For signer, OS identity, native database or Electron changes, preserve the old access path or design an approved recovery mechanism and prove it using actual previous signed installers. Do not ship the development decrypt helper as a release backdoor.

## Release evidence protocol

`docs/releases/storage-migration-policy.json` defines four required native targets: macOS arm64/x64, Windows x64 and Linux x64. `supportedSourceVersions` is intentionally empty, blocking distribution until real supported earlier releases and populated required stores are registered. Synthetic fixtures in `src/__tests__/fixtures/` are unit transport fixtures, not captured signed-release evidence.

For each registered version and target:

1. Archive the original signed installer, version, release URL, SHA256 and verified signer. Install it under a disposable native user/profile using the real OS keyring.
2. Create populated synthetic user data through that release's UI: chats/drafts/tasks, credentials/provider keys/vault summaries, private flags, cookies, groups/tabs/history and extension/session state. Record counts and non-sensitive expected outcomes. Stop all writers and retain an offline full-profile snapshot.
3. Upgrade through the candidate's actual distribution/update path without deleting profiles or resetting keyrings. Verify the exact candidate hash and signatures. macOS requires Developer ID/notarization, stapling and Gatekeeper evidence; Windows requires Authenticode verification; Linux requires the distribution's verified detached/package signature. Preserve verification output in the evidence bundle.
4. Execute every policy scenario: populated upgrade, restart, interruptions before/after commit, unavailable OS key, corrupt record/key, disk full, concurrent writer, identity/marketing rename, rollback export, future format, cookies, browser state and log redaction. Verify unavailable sources remain byte-identical and normal access resumes when the underlying key becomes available. Check content/IDs/privacy fields as well as equal nonzero counts.
5. Capture two separate healthy launches and recovery readability. Confirm no unintended AI execution or permission expansion. Check log/report exports for plaintext leaks.
6. Produce `evidence.json` using the example shape. Include candidate/source artifacts and hashed scenario receipts inside the bundle. Every scenario must have one passing receipt. Native CI must attest the runner, target, source provenance, signatures and result.
7. Run `npm run release:verify-migrations -- '/absolute/path/to/evidence.json'`. Do not distribute unless this passes and the human release checklist is complete.

The gate checks contract/provenance fields, populated equal counts, required scenarios and actual SHA256 hashes; it confines referenced files to the evidence bundle. It trusts signature/scenario attestations from approved native CI; it does not independently execute installers or verify signatures. Approval of the native workflow and artifact provenance is a release-owner responsibility. The manual release workflow downloads a selected run artifact and checks it; it neither publishes nor automatically proves that the selected run is approved. Make this gate required in the eventual distribution workflow/branch policy. Existing package commands create artifacts only.

## Implementation and verification map

| Component | Responsibility |
| --- | --- |
| `src/main/storageFiles.ts` | Bounded reads and durable atomic writes |
| `src/main/storageMigration.ts` | Backups, journal, staging, resume and launch receipts |
| `src/main/storageSchemas.ts` | Supported payload/container validation |
| `src/main/secureStorage.ts` | OS-wrapped key, authenticated envelopes and migration bootstrap |
| `src/main/localStorage.ts` | Frozen identity, bootstrap caching and unavailable-store adapter |
| `.erb/scripts/storage-recovery.ts` | Metadata inspection and verified export |
| `.erb/scripts/storage-release-gate.ts` | Release evidence/hash validation |
| `.github/workflows/storage-migration.yml` | Hosted contracts and optional native development checks |
| `.github/workflows/storage-migration-release.yml` | Manual aggregate evidence gate |

Local verification: `npm run test:migrations`, `npm run test:migrations:native`, TypeScript and scoped lint. Native development tests use disposable profiles and prove OS round-trip/restart plus legacy Electron identity recovery and display-only rebranding on the current machine. They do not prove packaged signer continuity, physical power-loss durability or other operating systems.

Pending release work: register actual earlier releases; provision approved signed native upgrade jobs and keyring runners; obtain distribution signing credentials; run all four targets with populated UI-created fixtures; supply validated evidence; wire the gate into distribution. Preparation must not be described as signed release readiness until those actions pass.
