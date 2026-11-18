// Rebuild the offline rules from their published upstream subscriptions.
// Run from apps/browser: node .erb/scripts/update-protection-seed.cjs
const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const { FiltersEngine } = require('@ghostery/adblocker');
const sources = ['https://easylist.to/easylist/easylist.txt', 'https://easylist.to/easylist/easyprivacy.txt'];
(async () => {
  const lists = await Promise.all(sources.map(async url => {
    const response = await fetch(url, { signal: AbortSignal.timeout(30000), redirect: 'error' });
    if (!response.ok || !response.body) throw Error(`Subscription unavailable: ${url}`);
    const chunks = []; let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 8 * 1024 * 1024) throw Error('Subscription exceeds size limit');
      chunks.push(chunk);
    }
    const text = Buffer.concat(chunks).toString('utf8');
    if (!text.startsWith('[Adblock') || text.split('\n').length < 1000) throw Error('Invalid subscription');
    return text;
  }));
  const engine = FiltersEngine.parse(lists.join('\n'), { enableCompression: true, loadCosmeticFilters: true, loadExtendedSelectors: false, enableHtmlFiltering: false });
  const bytes = engine.serialize();
  const value = { version: 1, updatedAt: Date.now(), sources, sha256: createHash('sha256').update(bytes).digest('hex'), engine: Buffer.from(bytes).toString('base64') };
  fs.writeFileSync(path.resolve(__dirname, '../../src/browser/protectionSeed.json'), JSON.stringify(value) + '\n');
  console.log(`Refreshed EasyList/EasyPrivacy offline rules (${bytes.length} serialized bytes).`);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
