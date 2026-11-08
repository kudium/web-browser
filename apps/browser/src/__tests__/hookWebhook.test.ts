/** @jest-environment node */
/* Table-driven permission/network scenarios intentionally iterate fixtures. */
/* eslint-disable no-restricted-syntax, no-loop-func */
import { EventEmitter } from 'events';
import { lookup } from 'dns/promises';
import { request } from 'https';
import {
  deliverHookWebhook,
  publicWebhookAddress,
  webhookURL,
} from '../main/hookWebhook';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
jest.mock('https', () => ({ request: jest.fn() }));
const dns = lookup as jest.Mock;
const https = request as jest.Mock;
const endpoint = 'https://api.telegram.org/botfake-secret/sendMessage';
let status: number;
let responseBody: string;
let outgoing: any;
let options: any;
let posted: string;
beforeEach(() => {
  status = 200;
  responseBody = '{"ok":true,"secret":"must not escape"}';
  dns
    .mockReset()
    .mockResolvedValue([{ address: '149.154.167.220', family: 4 }]);
  https.mockReset().mockImplementation((_url, opts, callback) => {
    options = opts;
    outgoing = new EventEmitter();
    outgoing.setTimeout = jest.fn();
    outgoing.destroy = (error: Error) => outgoing.emit('error', error);
    opts.signal.addEventListener('abort', () =>
      outgoing.destroy(new Error('aborted'))
    );
    outgoing.end = (body: string) => {
      posted = body;
      const response: any = new EventEmitter();
      response.statusCode = status;
      callback(response);
      queueMicrotask(() => {
        response.emit('data', Buffer.from(responseBody));
        response.emit('end');
      });
    };
    return outgoing;
  });
});
const send = (
  url = endpoint,
  recipient: string | undefined = '123',
  signal = new AbortController().signal
) => deliverHookWebhook(url, recipient, 'Market changed', signal);
it('rejects private and reserved destinations including IPv6 mappings', () => {
  for (const address of [
    '127.0.0.1',
    '10.1.2.3',
    '169.254.169.254',
    '100.64.0.1',
    '192.168.1.1',
    '::1',
    '::ffff:127.0.0.1',
    'fc00::1',
    '2001:db8::1',
    'fe80::1',
  ])
    expect(publicWebhookAddress(address)).toBe(false);
  expect(publicWebhookAddress('149.154.167.220')).toBe(true);
  expect(publicWebhookAddress('2606:4700:4700::1111')).toBe(true);
  for (const url of [
    'http://example.com',
    'https://user:secret@example.com',
    'https://example.com:8443',
    'https://localhost',
    'https://example.com/#fragment',
  ])
    expect(() => webhookURL(url)).toThrow();
});
it('pins validated DNS results and sends Telegram credentials locally with a receipt only', async () => {
  expect(await send()).toEqual({ accepted: true });
  expect(JSON.parse(posted)).toEqual({
    chat_id: '123',
    text: 'Market changed',
    disable_web_page_preview: true,
  });
  const result = jest.fn();
  options.lookup('api.telegram.org', { all: false }, result);
  expect(result).toHaveBeenCalledWith(null, '149.154.167.220', 4);
  expect(dns).toHaveBeenCalledTimes(1);
  expect(options.method).toBe('POST');
});
it('rejects mixed public/private DNS answers without starting a request', async () => {
  dns.mockResolvedValue([
    { address: '149.154.167.220', family: 4 },
    { address: '127.0.0.1', family: 4 },
  ]);
  await expect(send()).rejects.toThrow('delivery failed');
  expect(https).not.toHaveBeenCalled();
});
it('does not follow redirects or expose error response bodies', async () => {
  status = 302;
  responseBody = 'https://api.telegram.org/botfake-secret/sendMessage';
  await expect(send()).rejects.toThrow('delivery failed');
  expect(https).toHaveBeenCalledTimes(1);
});
it('rejects oversized and rejected Telegram responses', async () => {
  responseBody = 'x'.repeat(4097);
  await expect(send()).rejects.toThrow('delivery failed');
  responseBody = '{"ok":false,"description":"fake-secret"}';
  await expect(send()).rejects.toThrow('delivery failed');
});
it('sends generic webhook JSON without a recipient and rejects malformed Telegram setup', async () => {
  await send('https://alerts.example.com/hook', undefined);
  expect(JSON.parse(posted)).toEqual({ text: 'Market changed' });
  await expect(
    deliverHookWebhook(
      endpoint,
      undefined,
      'Market changed',
      new AbortController().signal
    )
  ).rejects.toThrow('delivery failed');
});
it('cancels during DNS resolution before any transport and sanitizes DNS errors', async () => {
  dns.mockImplementation(() => new Promise(() => {}));
  const controller = new AbortController();
  const pending = send(endpoint, '123', controller.signal);
  controller.abort();
  await expect(pending).rejects.toThrow('delivery failed');
  expect(https).not.toHaveBeenCalled();
  dns.mockRejectedValue(new Error('fake-secret DNS error'));
  await expect(send()).rejects.toThrow('delivery failed');
});
