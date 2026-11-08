/* eslint-disable no-restricted-syntax, no-await-in-loop, no-continue */
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import {
  STORAGE_OS_IDENTITY,
  STORAGE_ENVELOPE_VERSION,
  STORAGE_KEY_FORMAT_VERSION,
} from '../../src/main/storageIdentity';
import { STORAGE_SCHEMA_VERSION } from '../../src/main/storageSchemas';
import { STORAGE_MIGRATION_ID } from '../../src/main/storageMigration';
import { version as applicationVersion } from '../../package.json';

export interface MigrationPolicy {
  version: number;
  migrationId: string;
  osIdentity: string;
  format: { key: number; encryption: number; schema: number };
  requiredTargets: string[];
  supportedSourceVersions: { version: string; requiredStores: string[] }[];
  requiredCases: string[];
  fixtureOrigin: string;
  requireSignedArtifacts: boolean;
}
const digestPattern = /^[a-f0-9]{64}$/;

/**
 * Validate receipts, not assertions of release readiness from development
 * tests.
 */
export function migrationEvidenceErrors(
  policy: MigrationPolicy,
  evidence: any,
  targetVersion: string
) {
  const errors: string[] = [];
  if (
    policy.version !== 1 ||
    policy.migrationId !== STORAGE_MIGRATION_ID ||
    policy.osIdentity !== STORAGE_OS_IDENTITY ||
    policy.format.key !== STORAGE_KEY_FORMAT_VERSION ||
    policy.format.encryption !== STORAGE_ENVELOPE_VERSION ||
    policy.format.schema !== STORAGE_SCHEMA_VERSION
  )
    errors.push(
      'Migration policy does not match the implemented storage contract.'
    );
  if (!policy.supportedSourceVersions.length)
    errors.push(
      'Register actual supported previous-release versions and populated fixture stores.'
    );
  if (
    !evidence ||
    evidence.version !== 1 ||
    evidence.targetVersion !== targetVersion ||
    evidence.migrationId !== policy.migrationId ||
    evidence.osIdentity !== policy.osIdentity ||
    !Array.isArray(evidence.targets)
  ) {
    errors.push('Missing or mismatched release migration evidence.');
    return errors;
  }
  for (const target of policy.requiredTargets) {
    const matches = evidence.targets.filter(
      (receipt: any) => receipt?.target === target
    );
    if (matches.length !== 1) {
      errors.push(`${target}: require exactly one native target receipt.`);
      continue;
    }
    const receipt = matches[0];
    if (
      receipt.status !== 'passed' ||
      receipt.runtime !== 'signed-packaged-app' ||
      receipt.artifact?.appVersion !== targetVersion ||
      !digestPattern.test(receipt.artifact?.sha256) ||
      typeof receipt.artifact?.path !== 'string' ||
      !receipt.runner?.runUrl ||
      !receipt.runner?.native ||
      receipt.runner?.target !== target
    )
      errors.push(
        `${target}: missing signed packaged/native artifact or runner provenance.`
      );
    if (
      policy.requireSignedArtifacts &&
      (receipt.signature?.verified !== true ||
        !receipt.signature?.signer ||
        (target.startsWith('darwin-') &&
          (receipt.signature?.notarized !== true ||
            receipt.signature?.gatekeeper !== true)))
    )
      errors.push(
        `${target}: required signing/notarization verification is missing.`
      );
    if (!Array.isArray(receipt.fixtures)) {
      errors.push(`${target}: previous-release fixtures are missing.`);
      continue;
    }
    for (const source of policy.supportedSourceVersions) {
      if (source.version === targetVersion || !source.requiredStores.length)
        errors.push(
          `${target}: source version/stores must describe a real earlier release.`
        );
      const fixtures = receipt.fixtures.filter(
        (fixture: any) => fixture?.sourceVersion === source.version
      );
      if (fixtures.length !== 1) {
        errors.push(
          `${target}/${source.version}: require one populated previous-release fixture receipt.`
        );
        continue;
      }
      const fixture = fixtures[0];
      if (
        fixture.origin !== policy.fixtureOrigin ||
        !digestPattern.test(fixture.sourceArtifactSha256) ||
        typeof fixture.sourceArtifactPath !== 'string' ||
        !fixture.sourceSigner ||
        !fixture.sourceReleaseUrl ||
        !fixture.sourceSigned ||
        fixture.originalsPreserved !== true ||
        fixture.readBackValidated !== true ||
        !fixture.countsBefore ||
        !fixture.countsAfter ||
        !Array.isArray(fixture.cases)
      )
        errors.push(
          `${target}/${source.version}: fixture provenance or preservation verification is incomplete.`
        );
      for (const store of source.requiredStores) {
        const before = fixture.countsBefore?.[store];
        if (
          !Number.isSafeInteger(before) ||
          before <= 0 ||
          fixture.countsAfter?.[store] !== before
        )
          errors.push(
            `${target}/${source.version}/${store}: populated record counts were not preserved.`
          );
      }
      for (const name of policy.requiredCases) {
        const cases = (
          Array.isArray(fixture.cases) ? fixture.cases : []
        ).filter((test: any) => test?.name === name);
        if (
          cases.length !== 1 ||
          cases[0].status !== 'passed' ||
          !cases[0].evidencePath
        )
          errors.push(
            `${target}/${source.version}/${name}: required scenario has not passed.`
          );
      }
    }
  }
  return errors;
}

function evidencePath(directory: string, relative: string) {
  if (
    typeof relative !== 'string' ||
    path.isAbsolute(relative) ||
    /^[A-Za-z]:[\\/]/.test(relative)
  )
    throw new Error('Evidence paths must be relative to the report bundle.');
  const root = fs.realpathSync(directory);
  const file = fs.realpathSync(path.resolve(root, relative));
  if (!file.startsWith(`${root}${path.sep}`))
    throw new Error('Evidence path escapes the report bundle.');
  return file;
}

async function fileDigest(file: string) {
  if (!fs.lstatSync(file).isFile())
    throw new Error(
      'Release artifact must be a regular installer/archive file.'
    );
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

export async function verifyMigrationRelease(
  evidenceFile: string,
  policyFile: string,
  targetVersion = applicationVersion
) {
  const policy = JSON.parse(fs.readFileSync(policyFile, 'utf8'));
  const evidence = JSON.parse(fs.readFileSync(evidenceFile, 'utf8'));
  const errors = migrationEvidenceErrors(policy, evidence, targetVersion);
  if (!errors.length) {
    for (const receipt of evidence.targets) {
      try {
        const artifact = evidencePath(
          path.dirname(evidenceFile),
          receipt.artifact.path
        );
        if ((await fileDigest(artifact)) !== receipt.artifact.sha256)
          errors.push(
            `${receipt.target}: release artifact hash does not match its tested receipt.`
          );
        for (const fixture of receipt.fixtures) {
          const sourceArtifact = evidencePath(
            path.dirname(evidenceFile),
            fixture.sourceArtifactPath
          );
          if (
            (await fileDigest(sourceArtifact)) !== fixture.sourceArtifactSha256
          )
            errors.push(
              `${receipt.target}: previous-release artifact does not match its tested receipt.`
            );
          for (const test of fixture.cases) {
            const proof = evidencePath(
              path.dirname(evidenceFile),
              test.evidencePath
            );
            if (
              !fs.lstatSync(proof).isFile() ||
              !digestPattern.test(test.evidenceSha256) ||
              (await fileDigest(proof)) !== test.evidenceSha256
            )
              errors.push(
                `${receipt.target}/${test.name}: scenario evidence is missing or changed.`
              );
          }
        }
      } catch {
        errors.push(
          `${receipt.target}: artifact/scenario files cannot be verified.`
        );
      }
    }
  }
  if (errors.length)
    throw new Error(
      `Storage migration release blocked:\n${errors
        .map((message) => `- ${message}`)
        .join('\n')}`
    );
}

if (require.main === module) {
  const file = process.argv[2] || process.env.KUDIUM_MIGRATION_EVIDENCE;
  if (!file) {
    console.error(
      'Storage migration release blocked: supply the native packaged upgrade evidence JSON path.'
    );
    process.exitCode = 1;
  } else {
    verifyMigrationRelease(
      path.resolve(file),
      path.resolve('docs/releases/storage-migration-policy.json')
    )
      .then(() => {
        console.log(
          'Storage migration release evidence and artifact hashes verified.'
        );
        return undefined;
      })
      .catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
      });
  }
}
