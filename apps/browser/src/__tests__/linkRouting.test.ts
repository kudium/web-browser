import { resolveLinkRoute, validateLinkRoutingRules } from '../browser/linkRouting';
import { aiGroupId } from '../browser/aiGroups';
import type { IApp } from '../types';

const source = {id:'tab',name:'Work',url:'https://example.com',sessionId:'work-login',spaceId:'work'} as IApp;
const spaces = [{id:'work'},{id:'personal'}];
const rule = {id:'rule',hostname:'example.com',spaceId:'work',groupId:aiGroupId(source),includeSubdomains:true,enabled:true};
it('routes to the configured login without changing URLs or matching deceptive suffixes', () => {
  expect(resolveLinkRoute('https://mail.example.com/path',[rule],spaces,[source])?.source).toBe(source);
  expect(resolveLinkRoute('https://example.com.attacker.test',[rule],spaces,[source])).toBeUndefined();
  expect(resolveLinkRoute('https://notexample.com',[rule],spaces,[source])).toBeUndefined();
});
it('honors ordered rules, disabled entries, exact matching and deleted destinations', () => {
  const fallback={...rule,id:'fallback',spaceId:'personal',groupId:undefined};
  expect(resolveLinkRoute('https://example.com',[{...rule,enabled:false},fallback],spaces,[source])?.spaceId).toBe('personal');
  expect(resolveLinkRoute('https://example.com',[rule,fallback],spaces,[])?.spaceId).toBe('personal');
  expect(resolveLinkRoute('https://a.example.com',[{...rule,includeSubdomains:false}],spaces,[source])).toBeUndefined();
  expect(resolveLinkRoute('mailto:a@example.com',[rule],spaces,[source])).toBeUndefined();
});
it('validates rules, normalizes hostnames and rejects wildcard/path and duplicate IDs', () => {
  expect(validateLinkRoutingRules([{...rule,hostname:'EXAMPLE.com.'}])[0].hostname).toBe('example.com');
  expect(() => validateLinkRoutingRules([{...rule,hostname:'example.com/path'}])).toThrow();
  expect(() => validateLinkRoutingRules([{...rule,hostname:'*.example.com'}])).toThrow();
  expect(() => validateLinkRoutingRules([rule,rule])).toThrow();
});
