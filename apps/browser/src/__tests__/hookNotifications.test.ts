/** @jest-environment node */
/* Table-driven permission/network scenarios intentionally iterate fixtures. */
/* eslint-disable no-restricted-syntax, no-loop-func */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { HookNotifications, HookContext } from '../main/hookNotifications';
import { PasswordVault } from '../main/passwordManager/vault';

jest.mock('../main/passwordManager', () => ({}));
jest.mock('../main/groupLocks', () => ({}));
jest.mock('../main/siteSettings', () => ({}));

const password = 'long disposable fixture password';
const endpoint = 'https://api.telegram.org/botfixture-SECRET/sendMessage';
const context: HookContext = {
  groupId: 'group-a',
  profile: 'shared-login',
  scope: 'data-a',
  origin: 'https://market.test',
  config: {
    enabled: true,
    before: '',
    after: 'await context.notify("market", "Update");',
    css: '',
  },
};
const binding = {
  key: 'market',
  recordId: 'telegram',
  fieldName: 'webhook',
  recipientField: 'chat ID',
};

describe('reviewed hook notification permissions', () => {
  let root: string;
  let vault: PasswordVault;
  let service: HookNotifications;
  let epoch: number;
  let now: number;
  let locked: boolean;
  const send = jest.fn();
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudiumbrowser-hook-test-'));
    vault = new PasswordVault(path.join(root, 'vault.json'));
    vault.unlock(password, true);
    vault.settings(true, true, true);
    vault.save({
      id: 'telegram',
      kind: 'login',
      title: 'Telegram alerts',
      origin: '',
      username: '',
      password: '',
      allowAI: false,
      fields: [
        { name: 'webhook', value: endpoint, secret: true },
        { name: 'chat ID', value: '123456789', secret: true },
      ],
    });
    epoch = 1;
    now = 1000;
    locked = false;
    send.mockReset().mockResolvedValue({ accepted: true });
    service = new HookNotifications({
      vault: (work) => work(vault),
      epoch: () => epoch,
      send,
      now: () => now,
      locked: () => locked,
    });
  });
  afterEach(() => {
    vault.lock();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const approve = () => {
    const grant = service.prepare(binding, context);
    service.save(grant, context);
    return grant;
  };

  it('discovers only scoped metadata and never includes saved values', () => {
    vault.save(
      { ...vault.records()[0], id: 'foreign', title: 'Telegram foreign' },
      'data-b'
    );
    expect(service.candidates('Telegram', context)).toHaveLength(1);
    const result = JSON.stringify(service.candidates('Telegram', context));
    expect(result).toContain('webhook');
    expect(result).not.toContain('SECRET');
    expect(result).not.toContain('123456789');
    expect(vault.records()[0].allowAI).toBe(false);
    vault.hide('telegram', 'data-a');
    expect(service.candidates('Telegram', context)).toEqual([]);
    expect(() => service.prepare(binding, context)).toThrow('unavailable');
  });
  it('keeps grants encrypted across restart but requires renewed session approval', async () => {
    const grant = approve();
    const disk = fs.readFileSync(path.join(root, 'vault.json'), 'utf8');
    expect(disk).not.toContain(grant.id);
    expect(disk).not.toContain(grant.endpointHash);
    expect(disk).not.toContain(endpoint);
    expect(service.permissions(context)[0].active).toBe(true);
    vault.lock();
    vault.unlock(password);
    expect(vault.hookNotifications('data-a')[0]).toEqual(grant);
    epoch += 1;
    await expect(service.notify('market', 'Update', context)).rejects.toThrow(
      'Approve'
    );
    service.activate(grant.id, context);
    await expect(service.notify('market', 'Update', context)).resolves.toEqual({
      accepted: true,
    });
    expect(send.mock.calls[0].slice(0, 3)).toEqual([
      endpoint,
      '123456789',
      'Update',
    ]);
  });
  it('rejects scripts containing a selected credential or recipient', () => {
    for (const secret of [endpoint, '123456789']) {
      expect(() =>
        service.prepare(binding, {
          ...context,
          config: { ...context.config, after: `fetch('${secret}')` },
        })
      ).toThrow('never embed');
    }
    expect(
      service.redact(`source '${endpoint}' recipient 123456789`, context)
    ).not.toContain('SECRET');
    expect(service.redact('recipient 123456789', context)).not.toContain(
      '123456789'
    );
  });
  it('requires the exact script, group, origin, profile and effective saved values', async () => {
    const grant = approve();
    for (const changed of [
      { groupId: 'group-b' },
      { scope: 'data-b' },
      { profile: 'other' },
      { origin: 'https://other.test' },
      { config: { ...context.config, after: 'changed' } },
    ]) {
      expect(() => service.verify(grant, { ...context, ...changed })).toThrow(
        'changed'
      );
    }
    vault.save(
      {
        ...vault.records()[0],
        fields: [
          {
            name: 'webhook',
            value: endpoint.replace('SECRET', 'changed'),
            secret: true,
          },
          { name: 'chat ID', value: '123456789', secret: true },
        ],
      },
      'data-a'
    );
    await expect(service.notify('market', 'Update', context)).rejects.toThrow(
      'destination changed'
    );
    expect(service.permissions(context)[0].active).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
  it('aborts pending requests on revocation and refuses locked or disabled access', async () => {
    const grant = approve();
    send.mockImplementation(
      (_url, _recipient, _text, signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => reject(new Error('cancelled')),
            { once: true }
          );
        })
    );
    const pending = service.notify('market', 'Update', context);
    service.revoke(grant.id, context);
    await expect(pending).rejects.toThrow('cancelled');
    expect(vault.hookNotifications('data-a')).toEqual([]);
    approve();
    locked = true;
    service.revokeLocked();
    await expect(service.notify('market', 'Update', context)).rejects.toThrow(
      'Approve'
    );
    expect(() => service.candidates('Telegram', context)).toThrow('locked');
    locked = false;
    vault.settings(false, true, true);
    expect(() => service.prepare(binding, context)).toThrow('disabled');
  });
  it('reconciles edited scripts and limits repeated delivery without retaining alert text', async () => {
    approve();
    await service.notify('market', 'same update', context);
    await expect(
      service.notify('market', 'different update', context)
    ).rejects.toThrow('rate limit');
    now += 31000;
    await expect(
      service.notify('market', 'same update', context)
    ).rejects.toThrow('rate limit');
    await service.notify('market', 'different update', context);
    service.reconcile(context.profile, context.origin, {
      ...context.config,
      css: 'body {}',
    });
    await expect(service.notify('market', 'later', context)).rejects.toThrow(
      'Approve'
    );
    expect(send).toHaveBeenCalledTimes(2);
  });
  it('cancels an in-flight delivery when an effective destination is edited', async () => {
    approve();
    vault.onChange(() => service.dataChanged());
    send.mockImplementation(
      (_url, _recipient, _text, signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => reject(new Error('cancelled')),
            { once: true }
          );
        })
    );
    const pending = service.notify('market', 'Update', context);
    vault.save(
      {
        ...vault.records()[0],
        fields: [
          {
            name: 'webhook',
            value: endpoint.replace('SECRET', 'changed'),
            secret: true,
          },
          { name: 'chat ID', value: '123456789', secret: true },
        ],
      },
      'data-a'
    );
    await expect(pending).rejects.toThrow('cancelled');
    expect(service.permissions(context)[0].active).toBe(false);
  });
  it('prunes encrypted grants when their record or group scope is removed', () => {
    approve();
    vault.delete('telegram');
    expect(vault.hookNotifications('data-a')).toEqual([]);
  });
});
