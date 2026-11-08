/** @jest-environment node */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { storageDigest } from '../main/storageMigration';
import {
  migrationEvidenceErrors,
  verifyMigrationRelease,
  MigrationPolicy,
} from '../../.erb/scripts/storage-release-gate';
import policyJSON from '../../docs/releases/storage-migration-policy.json';

const policy: MigrationPolicy = {
  ...policyJSON,
  supportedSourceVersions: [
    { version: '0.9.0', requiredStores: ['chats', 'tasks', 'vaultItems'] },
  ],
};
function evidence() {
  return {
    version: 1,
    targetVersion: '1.0.0',
    migrationId: policy.migrationId,
    osIdentity: policy.osIdentity,
    targets: policy.requiredTargets.map((target) => ({
      target,
      status: 'passed',
      runtime: 'signed-packaged-app',
      runner: {
        native: true,
        target,
        runUrl: 'https://example.test/synthetic-unit-test-run',
      },
      artifact: {
        path: 'fixture-artifact.bin',
        sha256: storageDigest(Buffer.from('UNIT-TEST-ARTIFACT')),
        appVersion: '1.0.0',
      },
      signature: {
        verified: true,
        signer: 'SYNTHETIC-TEST-SIGNER',
        notarized: true,
        gatekeeper: true,
      },
      fixtures: [
        {
          sourceVersion: '0.9.0',
          origin: 'previous-release-ui',
          sourceSigned: true,
          sourceArtifactSha256: storageDigest(Buffer.from('UNIT-TEST-SOURCE')),
          sourceArtifactPath: 'fixture-source.bin',
          sourceSigner: 'SYNTHETIC-TEST-SIGNER',
          sourceReleaseUrl: 'https://example.test/synthetic-release',
          originalsPreserved: true,
          readBackValidated: true,
          countsBefore: { chats: 1, tasks: 1, vaultItems: 1 },
          countsAfter: { chats: 1, tasks: 1, vaultItems: 1 },
          cases: policy.requiredCases.map((name) => ({
            name,
            status: 'passed',
            evidencePath: 'fixture-proof.bin',
            evidenceSha256: storageDigest(Buffer.from('UNIT-TEST-PROOF')),
          })),
        },
      ],
    })),
  };
}

test('the shipped policy blocks release until real previous versions are registered', () => {
  expect(migrationEvidenceErrors(policyJSON, evidence(), '1.0.0')).toContain(
    'Register actual supported previous-release versions and populated fixture stores.'
  );
});
test('a complete structural receipt is accepted, without claiming synthetic test receipts are native proof', () => {
  expect(migrationEvidenceErrors(policy, evidence(), '1.0.0')).toEqual([]);
});
test.each([
  'missing-target',
  'development-runtime',
  'empty-fixture',
  'unit-fixture',
  'count-loss',
  'missing-case',
  'unsigned',
  'wrong-identity',
  'wrong-version',
])('rejects incomplete or mismatched release evidence: %s', (fault) => {
  const report = evidence();
  const target = report.targets[0];
  const fixture = target.fixtures[0];
  if (fault === 'missing-target') report.targets.pop();
  if (fault === 'development-runtime') target.runtime = 'development-electron';
  if (fault === 'empty-fixture') fixture.countsBefore.chats = 0;
  if (fault === 'unit-fixture') fixture.origin = 'unit-transport';
  if (fault === 'count-loss') fixture.countsAfter.tasks = 0;
  if (fault === 'missing-case') fixture.cases.pop();
  if (fault === 'unsigned') target.signature.verified = false;
  if (fault === 'wrong-identity') report.osIdentity = 'RENAMED-IDENTITY';
  if (fault === 'wrong-version') report.targetVersion = '2.0.0';
  expect(
    migrationEvidenceErrors(policy, report, '1.0.0').length
  ).toBeGreaterThan(0);
});
test('checks that the installer and scenario files match their recorded hashes', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-release-gate-'));
  try {
    fs.writeFileSync(path.join(root, 'policy.json'), JSON.stringify(policy));
    fs.writeFileSync(
      path.join(root, 'evidence.json'),
      JSON.stringify(evidence())
    );
    fs.writeFileSync(
      path.join(root, 'fixture-artifact.bin'),
      'UNIT-TEST-ARTIFACT'
    );
    fs.writeFileSync(path.join(root, 'fixture-proof.bin'), 'UNIT-TEST-PROOF');
    fs.writeFileSync(path.join(root, 'fixture-source.bin'), 'UNIT-TEST-SOURCE');
    await expect(
      verifyMigrationRelease(
        path.join(root, 'evidence.json'),
        path.join(root, 'policy.json'),
        '1.0.0'
      )
    ).resolves.toBeUndefined();
    fs.writeFileSync(path.join(root, 'fixture-artifact.bin'), 'CHANGED');
    await expect(
      verifyMigrationRelease(
        path.join(root, 'evidence.json'),
        path.join(root, 'policy.json'),
        '1.0.0'
      )
    ).rejects.toThrow('artifact hash');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
