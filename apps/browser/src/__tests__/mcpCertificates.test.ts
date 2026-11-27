/** @jest-environment node */
import { X509Certificate } from 'crypto';
import fs from 'fs';
import https from 'https';
import os from 'os';
import path from 'path';
import {
  generateCertificateAuthority,
  issueServerCertificate,
  verifyCertificateAuthority,
  MCPCertificateStore,
  MCP_LEAF_RENEW_DAYS,
} from '../main/mcpCertificates';

jest.setTimeout(30000);

it('builds a name-constrained CA and a local leaf that Node parses and verifies', async () => {
  const authority = generateCertificateAuthority();
  const ca = new X509Certificate(authority.certificatePem);
  expect(ca.ca).toBe(true);
  expect(ca.subject).toBe('CN=Kudium Local CA');
  expect(ca.issuer).toBe(ca.subject);
  expect(ca.checkIssued(ca)).toBe(true);
  // Node's keyUsage lists extended key usages: none on the CA, serverAuth on the leaf.
  expect(ca.keyUsage).toBeUndefined();
  expect(ca.toString()).toContain('CERTIFICATE');
  const leaf = issueServerCertificate(authority);
  const certificate = new X509Certificate(leaf.certificatePem);
  expect(certificate.ca).toBe(false);
  expect(certificate.checkIssued(ca)).toBe(true);
  expect(certificate.verify(ca.publicKey)).toBe(true);
  expect(certificate.keyUsage).toEqual(['1.3.6.1.5.5.7.3.1']);
  expect(certificate.subjectAltName).toBe('DNS:localhost, IP Address:127.0.0.1, IP Address:0:0:0:0:0:0:0:1');
  expect(certificate.checkHost('localhost')).toBe('localhost');
  expect(certificate.checkHost('example.com')).toBeUndefined();
  expect(certificate.checkIP('127.0.0.1')).toBe('127.0.0.1');
  expect(certificate.checkIP('::1')).toBe('::1');
  const validTo = new Date(certificate.validTo).getTime();
  expect(validTo - Date.now()).toBeGreaterThan(89 * 86400000);
  expect(validTo - Date.now()).toBeLessThan(91 * 86400000);
});

it('is accepted by a real TLS client for localhost and rejected for a foreign name', async () => {
  const authority = generateCertificateAuthority();
  const leaf = issueServerCertificate(authority);
  const verification = await verifyCertificateAuthority(authority, leaf);
  expect(verification.localhostAccepted).toBe(true);
  expect(verification.foreignRejected).toBe(true);
  // The foreign leaf fails chain verification (Name Constraints), not the
  // hostname check, which the probe deliberately skips.
  expect(verification.foreignError).toBeDefined();
  expect(verification.foreignError).not.toBe('ERR_TLS_CERT_ALTNAME_INVALID');
});

it('serves the MCP handler over https with the stored leaf', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-ca-'));
  try {
    const store = new MCPCertificateStore(directory, 'linux');
    const files = store.ensure();
    expect(files.changed).toBe(true);
    expect(fs.existsSync(files.caPath)).toBe(true);
    expect(fs.statSync(path.join(directory, 'kudium-local-ca.key')).mode & 0o777).toBe(0o600);
    const server = https.createServer({ key: files.leafKeyPem, cert: files.leafPem }, (_req, res) => {
      res.writeHead(200);
      res.end('mcp');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as { port: number };
    try {
      const body = await new Promise<string>((resolve, reject) => {
        https
          .get({ host: '127.0.0.1', port, path: '/mcp', ca: [files.caPem], servername: 'localhost' }, (res) => {
            let text = '';
            res.on('data', (chunk) => {
              text += chunk;
            });
            res.on('end', () => resolve(text));
          })
          .on('error', reject);
      });
      expect(body).toBe('mcp');
    } finally {
      server.close();
    }
    // A second call reuses everything; nothing is regenerated.
    const again = store.ensure();
    expect(again.changed).toBe(false);
    expect(again.leafPem).toBe(files.leafPem);
    // Near expiry the leaf rotates under the same CA.
    const rotated = store.ensure(files.leafNotAfter - (MCP_LEAF_RENEW_DAYS - 1) * 86400000);
    expect(rotated.changed).toBe(true);
    expect(rotated.caPem).toBe(files.caPem);
    expect(rotated.leafPem).not.toBe(files.leafPem);
    expect(new X509Certificate(rotated.leafPem).checkIssued(new X509Certificate(rotated.caPem))).toBe(true);
    expect(store.load()?.leafPem).toBe(rotated.leafPem);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

it('explains manual trust when the platform tool is unavailable', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-ca-'));
  try {
    const store = new MCPCertificateStore(directory, 'linux', directory);
    const result = await store.trust();
    expect(result.trusted).toBe(false);
    expect(result.manual).toContain('kudium-local-ca.pem');
    expect(result.manual).toContain('NODE_EXTRA_CA_CERTS');
    expect(await store.trusted()).toBeUndefined();
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
