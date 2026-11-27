import {
  createHash,
  createPrivateKey,
  generateKeyPairSync,
  randomBytes,
  sign,
  X509Certificate,
  KeyObject,
} from 'crypto';
import { execFile } from 'child_process';
import fs from 'fs';
import https from 'https';
import os from 'os';
import path from 'path';
import { writePrivateFile } from './privateFile';

/**
 * A local certificate authority for the MCP endpoint, built with Node's
 * crypto only (no runtime dependency). The CA carries a critical X.509 Name
 * Constraints extension permitting only `localhost`, `127.0.0.1` and `::1`,
 * so even a leaked CA key cannot sign a certificate the OS would accept for
 * any real site. Every verifier that honours RFC 5280 (OpenSSL/Node, macOS,
 * Windows, Chromium, Firefox) enforces the constraint.
 */
export const MCP_CA_NAME = 'Kudium Local CA';
export const MCP_LEAF_NAME = 'Kudium local MCP';
export const MCP_CA_DAYS = 3650;
export const MCP_LEAF_DAYS = 90;
/** Rotate the leaf when fewer than this many days remain. */
export const MCP_LEAF_RENEW_DAYS = 14;
export const MCP_LOCAL_DNS = ['localhost'];
export const MCP_LOCAL_IPS = ['127.0.0.1', '::1'];

/* ---------- DER encoding ---------- */

const length = (size: number) => {
  if (size < 0x80) return Buffer.from([size]);
  const bytes: number[] = [];
  let rest = size;
  while (rest > 0) {
    bytes.unshift(rest & 0xff);
    rest >>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
};
const tlv = (tag: number, content: Buffer) =>
  Buffer.concat([Buffer.from([tag]), length(content.length), content]);
const sequence = (...parts: Buffer[]) => tlv(0x30, Buffer.concat(parts));
const set = (...parts: Buffer[]) => tlv(0x31, Buffer.concat(parts));
const integer = (value: Buffer | number) => {
  let bytes =
    typeof value === 'number' ? Buffer.from([value]) : Buffer.from(value);
  while (bytes.length > 1 && bytes[0] === 0 && !(bytes[1] & 0x80))
    bytes = bytes.subarray(1);
  if (bytes[0] & 0x80) bytes = Buffer.concat([Buffer.from([0]), bytes]);
  return tlv(0x02, bytes);
};
const boolean = (value: boolean) => tlv(0x01, Buffer.from([value ? 0xff : 0]));
const octetString = (content: Buffer) => tlv(0x04, content);
const bitString = (content: Buffer, unusedBits = 0) =>
  tlv(0x03, Buffer.concat([Buffer.from([unusedBits]), content]));
const utf8String = (text: string) => tlv(0x0c, Buffer.from(text, 'utf8'));
const explicit = (index: number, content: Buffer) =>
  tlv(0xa0 | index, content);
const implicit = (index: number, content: Buffer, constructed = false) =>
  tlv((constructed ? 0xa0 : 0x80) | index, content);
const oid = (dotted: string) => {
  const parts = dotted.split('.').map(Number);
  const bytes: number[] = [parts[0] * 40 + parts[1]];
  parts.slice(2).forEach((part) => {
    const chunk: number[] = [part & 0x7f];
    let rest = part >> 7;
    while (rest > 0) {
      chunk.unshift((rest & 0x7f) | 0x80);
      rest >>= 7;
    }
    bytes.push(...chunk);
  });
  return tlv(0x06, Buffer.from(bytes));
};
const pad = (value: number, size = 2) => String(value).padStart(size, '0');
const time = (date: Date) => {
  const year = date.getUTCFullYear();
  const body = `${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}${pad(
    date.getUTCHours()
  )}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
  // RFC 5280: UTCTime through 2049, GeneralizedTime afterwards.
  return year < 2050
    ? tlv(0x17, Buffer.from(`${pad(year % 100)}${body}`))
    : tlv(0x18, Buffer.from(`${year}${body}`));
};

const OIDS = {
  commonName: '2.5.4.3',
  ecdsaWithSha256: '1.2.840.10045.4.3.2',
  basicConstraints: '2.5.29.19',
  keyUsage: '2.5.29.15',
  extendedKeyUsage: '2.5.29.37',
  serverAuth: '1.3.6.1.5.5.7.3.1',
  subjectAltName: '2.5.29.17',
  nameConstraints: '2.5.29.30',
  subjectKeyIdentifier: '2.5.29.14',
  authorityKeyIdentifier: '2.5.29.35',
};

const name = (commonName: string) =>
  sequence(set(sequence(oid(OIDS.commonName), utf8String(commonName))));
const extension = (id: string, critical: boolean, value: Buffer) =>
  sequence(
    oid(id),
    ...(critical ? [boolean(true)] : []),
    octetString(value)
  );
const ipBytes = (address: string) => {
  if (address.includes(':')) {
    const halves = address.split('::');
    const head = halves[0] ? halves[0].split(':') : [];
    const tail = halves[1] ? halves[1].split(':') : [];
    const groups = [
      ...head,
      ...Array(8 - head.length - tail.length).fill('0'),
      ...tail,
    ];
    const bytes = Buffer.alloc(16);
    groups.forEach((group, index) =>
      bytes.writeUInt16BE(parseInt(group || '0', 16), index * 2)
    );
    return bytes;
  }
  return Buffer.from(address.split('.').map(Number));
};
const dnsName = (host: string) => implicit(2, Buffer.from(host, 'ascii'));
const ipName = (address: string) => implicit(7, ipBytes(address));
/** GeneralSubtree iPAddress: address followed by a full mask (/32 or /128). */
const ipSubtree = (address: string) => {
  const bytes = ipBytes(address);
  return implicit(7, Buffer.concat([bytes, Buffer.alloc(bytes.length, 0xff)]));
};

/** SHA-1 of the subject public key bits, the conventional key identifier. */
const keyIdentifier = (publicKey: KeyObject) => {
  const spki = publicKey.export({ type: 'spki', format: 'der' }) as Buffer;
  // P-256 uncompressed points are the final 65 bytes of the SubjectPublicKeyInfo.
  return createHash('sha1').update(spki.subarray(spki.length - 65)).digest();
};

const serial = () => {
  const bytes = randomBytes(16);
  bytes[0] &= 0x7f;
  return bytes;
};

export interface IssuedCertificate {
  certificatePem: string;
  privateKeyPem: string;
  notAfter: Date;
}

interface IssueOptions {
  subject: string;
  days: number;
  publicKey: KeyObject;
  issuerKey: KeyObject;
  issuerName: string;
  issuerKeyId: Buffer;
  extensions: Buffer[];
}

const pem = (label: string, der: Buffer) =>
  `-----BEGIN ${label}-----\n${der
    .toString('base64')
    .match(/.{1,64}/g)!
    .join('\n')}\n-----END ${label}-----\n`;

function issue(options: IssueOptions) {
  const notBefore = new Date(Date.now() - 5 * 60 * 1000);
  const notAfter = new Date(
    notBefore.getTime() + options.days * 24 * 60 * 60 * 1000
  );
  const algorithm = sequence(oid(OIDS.ecdsaWithSha256));
  const tbs = sequence(
    explicit(0, integer(2)),
    integer(serial()),
    algorithm,
    name(options.issuerName),
    sequence(time(notBefore), time(notAfter)),
    name(options.subject),
    options.publicKey.export({ type: 'spki', format: 'der' }) as Buffer,
    explicit(
      3,
      sequence(
        ...options.extensions,
        extension(
          OIDS.subjectKeyIdentifier,
          false,
          octetString(keyIdentifier(options.publicKey))
        ),
        extension(
          OIDS.authorityKeyIdentifier,
          false,
          sequence(implicit(0, options.issuerKeyId))
        )
      )
    )
  );
  const signature = sign('sha256', tbs, {
    key: options.issuerKey,
    dsaEncoding: 'der',
  });
  const certificate = sequence(tbs, algorithm, bitString(signature));
  return { der: certificate, notAfter };
}

/** A fresh ECDSA P-256 authority that can only sign for local names. */
export function generateCertificateAuthority(): IssuedCertificate {
  const { publicKey, privateKey } = generateKeyPairSync('ec', {
    namedCurve: 'P-256',
  });
  // permittedSubtrees [0] IMPLICIT GeneralSubtrees: the tag replaces the
  // SEQUENCE OF tag, so the subtrees sit directly inside [0].
  const permitted = Buffer.concat([
    ...MCP_LOCAL_DNS.map((host) => sequence(dnsName(host))),
    ...MCP_LOCAL_IPS.map((address) => sequence(ipSubtree(address))),
  ]);
  const { der, notAfter } = issue({
    subject: MCP_CA_NAME,
    days: MCP_CA_DAYS,
    publicKey,
    issuerKey: privateKey,
    issuerName: MCP_CA_NAME,
    issuerKeyId: keyIdentifier(publicKey),
    extensions: [
      extension(OIDS.basicConstraints, true, sequence(boolean(true))),
      // keyCertSign (5) and cRLSign (6): 0b00000110, one unused bit.
      extension(OIDS.keyUsage, true, bitString(Buffer.from([0x06]), 1)),
      extension(OIDS.nameConstraints, true, sequence(implicit(0, permitted, true))),
    ],
  });
  return {
    certificatePem: pem('CERTIFICATE', der),
    privateKeyPem: privateKey
      .export({ type: 'pkcs8', format: 'pem' })
      .toString(),
    notAfter,
  };
}

/** A server certificate signed by the authority for the given names. */
export function issueServerCertificate(
  authority: { certificatePem: string; privateKeyPem: string },
  names: { dns?: string[]; ips?: string[]; days?: number; subject?: string } = {}
): IssuedCertificate {
  const { publicKey, privateKey } = generateKeyPairSync('ec', {
    namedCurve: 'P-256',
  });
  const issuerKey = createPrivateKey(authority.privateKeyPem);
  const issuerCertificate = new X509Certificate(authority.certificatePem);
  const dns = names.dns ?? MCP_LOCAL_DNS;
  const ips = names.ips ?? MCP_LOCAL_IPS;
  const { der, notAfter } = issue({
    subject: names.subject ?? MCP_LEAF_NAME,
    days: names.days ?? MCP_LEAF_DAYS,
    publicKey,
    issuerKey,
    issuerName: issuerCertificate.subject.replace(/^CN=/, ''),
    issuerKeyId: keyIdentifier(issuerCertificate.publicKey),
    extensions: [
      extension(OIDS.basicConstraints, true, sequence()),
      // digitalSignature (0): 0b10000000, seven unused bits.
      extension(OIDS.keyUsage, true, bitString(Buffer.from([0x80]), 7)),
      extension(OIDS.extendedKeyUsage, false, sequence(oid(OIDS.serverAuth))),
      extension(
        OIDS.subjectAltName,
        false,
        sequence(...dns.map(dnsName), ...ips.map(ipName))
      ),
    ],
  });
  return {
    certificatePem: pem('CERTIFICATE', der),
    privateKeyPem: privateKey
      .export({ type: 'pkcs8', format: 'pem' })
      .toString(),
    notAfter,
  };
}

/* ---------- verification ---------- */

async function handshake(
  server: { certificatePem: string; privateKeyPem: string },
  caPem: string,
  servername: string,
  checkHostname: boolean
): Promise<{ ok: boolean; code?: string }> {
  const listener = https.createServer(
    { key: server.privateKeyPem, cert: server.certificatePem },
    (_request, response) => {
      response.writeHead(200);
      response.end('ok');
    }
  );
  await new Promise<void>((resolve, reject) => {
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', resolve);
  });
  const { port } = listener.address() as { port: number };
  try {
    return await new Promise((resolve) => {
      const request = https.request(
        {
          host: '127.0.0.1',
          port,
          path: '/',
          method: 'GET',
          // This short-lived proof owns its socket; do not pool it past teardown.
          agent: false,
          servername,
          ca: [caPem],
          ...(checkHostname ? {} : { checkServerIdentity: () => undefined }),
          timeout: 5000,
        },
        (response) => {
          response.resume();
          response.on('end', () => resolve({ ok: response.statusCode === 200 }));
          response.on('error', (error: NodeJS.ErrnoException) =>
            resolve({ ok: false, code: error.code || error.message })
          );
        }
      );
      request.on('timeout', () => request.destroy(new Error('timeout')));
      request.on('error', (error: NodeJS.ErrnoException) =>
        resolve({ ok: false, code: error.code || error.message })
      );
      request.end();
    });
  } finally {
    listener.closeAllConnections();
    await new Promise<void>((resolve) => {
      listener.close(() => resolve());
    });
  }
}

export interface MCPCertificateVerification {
  localhostAccepted: boolean;
  foreignRejected: boolean;
  foreignError?: string;
}

/**
 * Prove the constraint before reporting "https ready": a throwaway leaf for
 * example.com signed by the same CA must be rejected by a real TLS client
 * that trusts the CA, while the localhost leaf is accepted.
 */
export async function verifyCertificateAuthority(
  authority: { certificatePem: string; privateKeyPem: string },
  leaf: { certificatePem: string; privateKeyPem: string }
): Promise<MCPCertificateVerification> {
  const foreign = issueServerCertificate(authority, {
    dns: ['example.com'],
    ips: [],
    days: 1,
    subject: 'example.com',
  });
  const [local, other] = await Promise.all([
    handshake(leaf, authority.certificatePem, 'localhost', true),
    handshake(foreign, authority.certificatePem, 'example.com', false),
  ]);
  return {
    localhostAccepted: local.ok,
    foreignRejected: !other.ok,
    ...(other.code ? { foreignError: other.code } : {}),
  };
}

/* ---------- storage, rotation and OS trust ---------- */

export interface MCPCertificateFiles {
  caPath: string;
  caPem: string;
  leafPem: string;
  leafKeyPem: string;
  leafNotAfter: number;
  /** True when this call generated or rotated something. */
  changed: boolean;
}

interface Metadata {
  caNotAfter: number;
  leafNotAfter: number;
  version: 1;
}

export interface MCPTrustResult {
  trusted: boolean;
  /** Instructions when the platform could not be trusted automatically. */
  manual?: string;
  error?: string;
}

const run = (file: string, args: string[]) =>
  new Promise<{ ok: boolean; output: string }>((resolve) => {
    execFile(
      file,
      args,
      { timeout: 120000, windowsHide: true },
      (error, stdout, stderr) => {
        resolve({ ok: !error, output: `${stdout}${stderr}`.trim() });
      }
    );
  });

export class MCPCertificateStore {
  constructor(
    readonly directory: string,
    private readonly platform: NodeJS.Platform = process.platform,
    private readonly home: string = os.homedir()
  ) {}

  get caPath() {
    return path.join(this.directory, 'kudium-local-ca.pem');
  }

  private get caKeyPath() {
    return path.join(this.directory, 'kudium-local-ca.key');
  }

  private get leafPath() {
    return path.join(this.directory, 'kudium-local-mcp.pem');
  }

  private get leafKeyPath() {
    return path.join(this.directory, 'kudium-local-mcp.key');
  }

  private get metadataPath() {
    return path.join(this.directory, 'metadata.json');
  }

  private readText(file: string) {
    try {
      const stat = fs.lstatSync(file);
      if (!stat.isFile()) return undefined;
      return fs.readFileSync(file, 'utf8');
    } catch {
      return undefined;
    }
  }

  /** Current files without generating anything. */
  load(): MCPCertificateFiles | undefined {
    const caPem = this.readText(this.caPath);
    const leafPem = this.readText(this.leafPath);
    const leafKeyPem = this.readText(this.leafKeyPath);
    const metadata = this.readText(this.metadataPath);
    if (!caPem || !leafPem || !leafKeyPem || !metadata) return undefined;
    try {
      const parsed = JSON.parse(metadata) as Metadata;
      return {
        caPath: this.caPath,
        caPem,
        leafPem,
        leafKeyPem,
        leafNotAfter: parsed.leafNotAfter,
        changed: false,
      };
    } catch {
      return undefined;
    }
  }

  /** Generate the CA on first use and rotate the leaf when it nears expiry. */
  ensure(now = Date.now()): MCPCertificateFiles {
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    const stat = fs.lstatSync(this.directory);
    if (stat.isSymbolicLink() || !stat.isDirectory())
      throw new Error('Certificate directory must be a real directory.');
    if (this.platform !== 'win32') fs.chmodSync(this.directory, 0o700);
    let caPem = this.readText(this.caPath);
    let caKeyPem = this.readText(this.caKeyPath);
    let changed = false;
    let caNotAfter = 0;
    if (caPem && caKeyPem) {
      try {
        caNotAfter = new Date(new X509Certificate(caPem).validTo).getTime();
        createPrivateKey(caKeyPem);
      } catch {
        caPem = undefined;
      }
    }
    if (!caPem || !caKeyPem || caNotAfter - now < MCP_LEAF_RENEW_DAYS * 86400000) {
      const authority = generateCertificateAuthority();
      caPem = authority.certificatePem;
      caKeyPem = authority.privateKeyPem;
      caNotAfter = authority.notAfter.getTime();
      // The key never leaves this directory; the certificate is public.
      writePrivateFile(this.caKeyPath, caKeyPem, { durable: true });
      writePrivateFile(this.caPath, caPem, { durable: true });
      fs.rmSync(this.leafPath, { force: true });
      fs.rmSync(this.leafKeyPath, { force: true });
      changed = true;
    }
    let leafPem = this.readText(this.leafPath);
    let leafKeyPem = this.readText(this.leafKeyPath);
    let leafNotAfter = 0;
    if (leafPem && leafKeyPem) {
      try {
        const certificate = new X509Certificate(leafPem);
        leafNotAfter = new Date(certificate.validTo).getTime();
        if (!certificate.checkIssued(new X509Certificate(caPem)))
          leafPem = undefined;
      } catch {
        leafPem = undefined;
      }
    }
    if (
      !leafPem ||
      !leafKeyPem ||
      leafNotAfter - now < MCP_LEAF_RENEW_DAYS * 86400000
    ) {
      const leaf = issueServerCertificate({
        certificatePem: caPem,
        privateKeyPem: caKeyPem,
      });
      leafPem = leaf.certificatePem;
      leafKeyPem = leaf.privateKeyPem;
      leafNotAfter = leaf.notAfter.getTime();
      writePrivateFile(this.leafKeyPath, leafKeyPem, { durable: true });
      writePrivateFile(this.leafPath, leafPem, { durable: true });
      changed = true;
    }
    const metadata: Metadata = { caNotAfter, leafNotAfter, version: 1 };
    writePrivateFile(this.metadataPath, JSON.stringify(metadata));
    return {
      caPath: this.caPath,
      caPem,
      leafPem,
      leafKeyPem,
      leafNotAfter,
      changed,
    };
  }

  /** Run the constraint proof against the stored CA and leaf. */
  async verify(): Promise<MCPCertificateVerification> {
    const files = this.ensure();
    const caKeyPem = this.readText(this.caKeyPath);
    if (!caKeyPem) throw new Error('Certificate authority key is missing.');
    return verifyCertificateAuthority(
      { certificatePem: files.caPem, privateKeyPem: caKeyPem },
      { certificatePem: files.leafPem, privateKeyPem: files.leafKeyPem }
    );
  }

  /** Is the CA already trusted by the OS for SSL (macOS only answers this). */
  async trusted(): Promise<boolean | undefined> {
    const files = this.load();
    if (!files) return false;
    if (this.platform === 'darwin') {
      const result = await run('/usr/bin/security', [
        'verify-cert',
        '-c',
        this.leafPath,
        '-c',
        this.caPath,
        '-p',
        'ssl',
        '-s',
        'localhost',
      ]);
      return result.ok;
    }
    return undefined;
  }

  /** Ask the OS to trust the CA for the current user; never prints the key. */
  async trust(): Promise<MCPTrustResult> {
    const files = this.load() ?? this.ensure();
    if (this.platform === 'darwin') {
      const keychain = path.join(
        this.home,
        'Library',
        'Keychains',
        'login.keychain-db'
      );
      const result = await run('/usr/bin/security', [
        'add-trusted-cert',
        '-r',
        'trustRoot',
        '-p',
        'ssl',
        '-k',
        keychain,
        files.caPath,
      ]);
      if (result.ok) return { trusted: true };
      return {
        trusted: false,
        error: result.output || 'macOS declined the trust change.',
        manual: `Open Keychain Access, import ${files.caPath} into the login keychain and set “Secure Sockets Layer (SSL)” to Always Trust.`,
      };
    }
    if (this.platform === 'win32') {
      const result = await run('certutil', [
        '-user',
        '-addstore',
        'Root',
        files.caPath,
      ]);
      if (result.ok) return { trusted: true };
      return {
        trusted: false,
        error: result.output || 'Windows declined the trust change.',
        manual: `Run certutil -user -addstore Root "${files.caPath}" or import it into the current user’s Trusted Root Certification Authorities store.`,
      };
    }
    // Linux: p11-kit covers most distributions; otherwise the user imports it.
    const anchor = await run('trust', ['anchor', '--store', files.caPath]);
    if (anchor.ok) return { trusted: true };
    return {
      trusted: false,
      error: anchor.output || 'No supported trust store command was found.',
      manual: `Import ${files.caPath} into your distribution’s trust store (for example: sudo cp "${files.caPath}" /usr/local/share/ca-certificates/kudium-local-ca.crt && sudo update-ca-certificates), and into Firefox or Chromium if they keep their own stores. Node clients: NODE_EXTRA_CA_CERTS="${files.caPath}".`,
    };
  }
}
