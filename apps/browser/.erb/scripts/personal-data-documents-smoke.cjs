/* eslint-disable promise/catch-or-return */
// Exercise document extraction from a bundled module in a disposable Electron process.
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const JSZip = require('jszip');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudiumbrowser-personal-docs-'));
require('esbuild').buildSync({
  entryPoints: ['src/main/passwordManager/documents.ts'],
  bundle: true,
  platform: 'node',
  outfile: path.join(root, 'documents.cjs'),
});

function pdf(text) {
  const content = `BT /F1 12 Tf 30 100 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 200] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(
      content
    )} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(out));
    out += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return out;
}
(async () => {
  await app.whenReady();
  const { importDocument } = require(path.join(root, 'documents.cjs'));
  const filename = path.join(root, 'resume.pdf');
  fs.writeFileSync(filename, pdf('Fixture resume engineer'));
  const result = await importDocument(filename, true);
  assert(result.document.text.includes('Fixture resume engineer'));
  assert(result.document.text.includes('[Page 1]'));
  assert(result.allowAI);
  const empty = path.join(root, 'scanned.pdf');
  fs.writeFileSync(empty, pdf(''));
  await assert.rejects(() => importDocument(empty, false), /text version/);
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>'
  );
  zip.file(
    'word/document.xml',
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Fixture work history</w:t></w:r></w:p></w:body></w:document>'
  );
  const docx = path.join(root, 'history.docx');
  fs.writeFileSync(docx, await zip.generateAsync({ type: 'nodebuffer' }));
  const extracted = await importDocument(docx, false);
  assert(extracted.document.text.includes('Fixture work history'));
  assert(!extracted.allowAI);
  console.log(
    'Personal Data document extraction passed: bundled PDF, page references, scanned-PDF rejection, DOCX and explicit AI permission.'
  );
  app.quit();
})()
  .catch((error) => {
    console.error(error);
    app.exit(1);
  })
  .finally(() => fs.rmSync(root, { recursive: true, force: true }));
