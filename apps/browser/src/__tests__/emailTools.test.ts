/** @jest-environment node */
import { aiToolParameters } from '../browser/aiToolSchemas';
import { AIToolCatalog } from '../main/aiToolCatalog';
import { mcpArguments } from '../main/mcp';
import { AI_TAINTING_READS, AITaintTracker, EMAIL_TAINT_ORIGIN } from '../browser/aiTaint';
import { aiActionClass } from '../browser/aiRunConsent';
import { aiToolProgress } from '../browser/aiProgress';

it('declares the email tools with bounded inputs in an optional family', () => {
  expect(Object.keys(aiToolParameters('create_email_alias').properties)).toEqual(['aliasHostname', 'aliasNote', 'emailAccountId', 'emailForwardTo']);
  expect(Object.keys(aiToolParameters('wait_for_email').properties)).toEqual([
    'emailTo',
    'emailFrom',
    'emailSubject',
    'sinceMinutes',
    'timeoutSeconds',
    'mailboxId',
  ]);
  expect(aiToolParameters('wait_for_email').properties.timeoutSeconds).toMatchObject({ minimum: 5, maximum: 180 });
  const catalog = new AIToolCatalog();
  expect(catalog.has('wait_for_email')).toBe(false);
  catalog.load('email');
  expect(catalog.has('wait_for_email')).toBe(true);
  expect(catalog.has('create_email_alias')).toBe(true);
  expect(catalog.has('list_email_aliases')).toBe(true);
  expect(catalog.has('get_email_context')).toBe(true);
  expect(Object.keys(aiToolParameters('get_email_context').properties)).toEqual([]);
  expect(aiActionClass('get_email_context')).toBe('read');
});

it('validates numeric email arguments for external connectors', () => {
  expect(mcpArguments('wait_for_email', { emailTo: 'a@b.test', timeoutSeconds: 30 }).args).toEqual({
    emailTo: 'a@b.test',
    timeoutSeconds: 30,
  });
  expect(() => mcpArguments('wait_for_email', { timeoutSeconds: 999 })).toThrow('Invalid timeoutSeconds.');
  expect(() => mcpArguments('wait_for_email', { sinceMinutes: '5' })).toThrow('Invalid sinceMinutes.');
  expect(() => mcpArguments('create_email_alias', { hostname: 'x' })).toThrow('Unsupported argument: hostname');
});

it('treats inbox content as a tainting read from a foreign origin', () => {
  expect(AI_TAINTING_READS).toContain('wait_for_email');
  const taint = new AITaintTracker();
  taint.setOwnOrigins(['https://example.com']);
  expect(taint.read(EMAIL_TAINT_ORIGIN)).toBe(EMAIL_TAINT_ORIGIN);
  expect(taint.tainted).toBe(true);
  expect(aiActionClass('wait_for_email')).toBe('read');
  expect(aiActionClass('create_email_alias')).toBe('saved-data');
  expect(aiToolProgress('wait_for_email')).toBe('Waiting for the email…');
});
