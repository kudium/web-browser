import { FiltersEngine } from '@ghostery/adblocker';
import { createHash } from 'crypto';
import { BrowserProtection } from '../main/browserProtection';
import { protectionListURLs } from '../browser/protection';

const now=Date.now();
function fixtureSeed(rules='||ads.advertising.test^$third-party\n@@||ads.advertising.test/allowed.js$script\nnews.fixture.test##.advertisement') {
  const bytes=FiltersEngine.parse(rules).serialize();
  return {version:1,updatedAt:now,sources:protectionListURLs,sha256:createHash('sha256').update(bytes).digest('hex'),engine:Buffer.from(bytes).toString('base64')};
}
it('blocks third-party ads, honors filter exceptions and preserves top-level navigation', () => {
  const service=new BrowserProtection({read:()=>undefined,write:()=>{},load:async()=>FiltersEngine.empty(),seed:fixtureSeed()});
  expect(service.block('https://ads.advertising.test/ad.js','https://news.fixture.test','script',1)).toBe(true);
  expect(service.block('https://ads.advertising.test/allowed.js','https://news.fixture.test','script',1)).toBe(false);
  expect(service.block('https://ads.advertising.test/ad.js','https://ads.advertising.test','script',1)).toBe(false);
  expect(service.block('https://ads.advertising.test/','https://news.fixture.test','mainFrame',1)).toBe(false);
  expect(service.count(1)).toBe(1);
  expect(service.styles('https://news.fixture.test')).toContain('.advertisement');
  service.reset(1);expect(service.count(1)).toBe(0);
});
it('falls back to bundled rules when cache integrity fails', () => {
  const bundled=fixtureSeed();
  const service=new BrowserProtection({read:()=>({...bundled,sha256:'bad'}),write:()=>{},load:async()=>FiltersEngine.empty(),seed:bundled});
  expect(service.status().available).toBe(true);
  expect(service.block('https://ads.advertising.test/ad.js','https://news.fixture.test','script',2)).toBe(true);
});
it('retains the last working engine after a failed atomic cache write', async () => {
  const service=new BrowserProtection({read:()=>undefined,write:()=>{throw Error('Disk full');},load:async()=>FiltersEngine.parse('||new.fixture.test^'),seed:fixtureSeed()});
  await service.update();
  expect(service.status()).toMatchObject({available:true,error:expect.any(String)});
  expect(service.block('https://ads.advertising.test/ad.js','https://news.fixture.test','script',1)).toBe(true);
  expect(service.block('https://new.fixture.test/ad.js','https://news.fixture.test','script',1)).toBe(false);
});
it('deduplicates concurrent updates and reports stale cached rules', async () => {
  let complete!: (engine:FiltersEngine)=>void;
  const load=jest.fn(()=>new Promise<FiltersEngine>(resolve=>{complete=resolve;}));
  const service=new BrowserProtection({read:()=>undefined,write:()=>{},load,seed:fixtureSeed(),now:()=>now+3*86400000});
  expect(service.status().phase).toBe('stale');
  const first=service.update();expect(service.update()).toBe(first);
  await Promise.resolve();complete(FiltersEngine.parse('||new.fixture.test^'));
  await first;expect(load).toHaveBeenCalledTimes(1);expect(service.status().phase).toBe('ready');
});
