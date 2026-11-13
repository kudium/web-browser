import { createHash, randomUUID } from 'crypto';
import { effectiveHookConfig } from './globalHooks';
/* The constructor stores injected local services; keys do not belong to instances. */
/* eslint-disable no-useless-constructor, no-empty-function, class-methods-use-this */
import type {
  SiteDeveloperConfig,
  HookNotificationBinding,
  HookNotificationGrant,
} from '../browser/siteDeveloper';
import { isProtectedField } from '../browser/passwordManager';
import type { PasswordVault } from './passwordManager/vault';
import {
  withPersonalData,
  passwordVault,
  personalDataRevision,
  onPersonalDataRevoked,
} from './passwordManager';
import { getGroupLocks } from './groupLocks';
import { onSiteSettingsChanged } from './siteSettings';
import { deliverHookWebhook, webhookURL } from './hookWebhook';

export interface HookContext {
  groupId: string;
  profile: string;
  scope?: string;
  origin: string;
  config: SiteDeveloperConfig;
}
export const hookScriptHash = (config: SiteDeveloperConfig) =>
  createHash('sha256')
    .update(
      JSON.stringify([
        config.before,
        config.after,
        config.css,
        ...(config.actions ? [config.actions] : []),
        ...(config.hooks ? [config.hooks] : []),
      ])
    )
    .digest('hex');
const fingerprint = (endpoint: string, recipient?: string) =>
  createHash('sha256')
    .update(JSON.stringify([endpoint, recipient || '']))
    .digest('hex');

/** Specific, encrypted permissions; hooks and LLMs never receive secret values. */
export class HookNotifications {
  private cache = new Map<string, HookNotificationGrant[]>();

  private active = new Map<string, number>();

  private pending = new Map<string, AbortController>();

  private deliveries = new Map<string, Array<{ time: number; hash: string }>>();

  constructor(
    private dependencies: {
      vault: <T>(work: (vault: PasswordVault) => T) => T;
      epoch: () => number;
      send: typeof deliverHookWebhook;
      now: () => number;
      locked: (group: string) => boolean;
    }
  ) {}

  private cacheKey(context: HookContext) {
    return JSON.stringify([context.groupId, context.scope, context.origin]);
  }

  private grants(context: HookContext) {
    const key = this.cacheKey(context);
    if (!this.cache.has(key))
      this.cache.set(
        key,
        this.dependencies.vault((vault) =>
          vault
            .hookNotifications(context.scope, context.origin)
            .filter(
              (grant) =>
                grant.groupId === context.groupId &&
                grant.profile === context.profile
            )
        )
      );
    return this.cache.get(key)!;
  }

  private fields(binding: HookNotificationBinding, context: HookContext) {
    return this.dependencies.vault((vault) => {
      const status = vault.status();
      if (!status.enabled || !status.ai)
        throw new Error('Personal Data AI access is disabled.');
      const item = vault
        .records(context.scope)
        .find(
          (record) =>
            record.id === binding.recordId &&
            (!record.origin || record.origin === context.origin)
        );
      if (!item)
        throw new Error(
          'The selected record is unavailable in this group or website.'
        );
      const choose = (name: string) => {
        const matches = item.fields.filter((field) => field.name === name);
        if (matches.length !== 1)
          throw new Error(
            'Choose one unambiguous saved field by its exact name.'
          );
        return matches[0].value;
      };
      const endpoint = choose(binding.fieldName);
      const url = webhookURL(endpoint);
      const recipient = binding.recipientField
        ? choose(binding.recipientField)
        : undefined;
      if (
        url.hostname === 'api.telegram.org' &&
        (!binding.recipientField ||
          !recipient ||
          recipient.length > 120 ||
          !/^\/bot[^/]+\/sendMessage$/.test(url.pathname))
      )
        throw new Error(
          'Select the Telegram sendMessage webhook and a saved chat ID field.'
        );
      if (url.hostname !== 'api.telegram.org' && binding.recipientField)
        throw new Error(
          'Chat ID fields are only used by Telegram sendMessage destinations.'
        );
      return { endpoint, recipient, label: item.title, host: url.hostname };
    });
  }

  redact(value: string, context: HookContext) {
    let safe = value.replace(
      /https:\/\/api\.telegram\.org\/bot[^\s'"`/]+\/sendMessage/gi,
      '[private webhook]'
    );
    try {
      this.dependencies.vault((vault) => {
        vault.records(context.scope).forEach((record) => {
          const privateValues = [
            record.password,
            ...record.fields
              .filter(isProtectedField)
              .map((field) => field.value),
          ];
          privateValues
            .filter((secret) => secret && secret.length >= 4)
            .forEach((secret) => {
              safe = safe.split(secret).join('[private value]');
            });
        });
      });
    } catch {
      // Locked fallback vaults cannot establish that existing source is secret-free.
      if (value)
        safe =
          '[Unlock Personal Data locally to inspect existing hook source safely]';
    }
    return safe;
  }

  candidates(query: string, context: HookContext) {
    if (this.dependencies.locked(context.groupId))
      throw new Error('Group is locked.');
    if (!query.trim() || query.length > 500)
      throw new Error('Enter a short field or record search.');
    return this.dependencies.vault((vault) => {
      if (!vault.status().enabled || !vault.status().ai)
        throw new Error('Personal Data AI access is disabled.');
      const terms = query.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
      if (!terms.length) return [];
      const matches = vault
        .records(context.scope)
        .filter(
          (item) =>
            (!item.origin || item.origin === context.origin) &&
            terms.every((term) =>
              `${item.title} ${item.fields
                .map((field) =>
                  [field.name, ...(field.aliases || [])].join(' ')
                )
                .join(' ')}`
                .toLowerCase()
                .includes(term)
            )
        )
        .slice(0, 5)
        .map((item) => ({
          id: item.id,
          title: item.title,
          fields: item.fields.slice(0, 30).map((field) => ({
            name: field.name,
            private: isProtectedField(field),
          })),
        }));
      while (JSON.stringify(matches).length > 4000) matches.pop();
      return matches;
    });
  }

  prepare(
    binding: HookNotificationBinding,
    context: HookContext
  ): HookNotificationGrant {
    if (
      !/^[a-z][a-z0-9-]{0,59}$/.test(binding.key) ||
      !binding.recordId ||
      !binding.fieldName ||
      binding.fieldName.length > 120
    )
      throw new Error(
        'Choose a notification key, record and exact field name.'
      );
    const source = this.fields(binding, context);
    if (
      [
        context.config.before,
        context.config.after,
        context.config.css,
        ...(context.config.hooks || []).flatMap((hook) => [
          hook.before,
          hook.after,
          hook.css,
        ]),
      ].some(
        (code) =>
          code.includes(source.endpoint) ||
          (!!source.recipient && code.includes(source.recipient))
      )
    )
      throw new Error(
        'Use context.notify with an opaque key; never embed a saved webhook in script source.'
      );
    return {
      ...binding,
      id: randomUUID(),
      groupId: context.groupId,
      profile: context.profile,
      scope: context.scope,
      origin: context.origin,
      label: source.label,
      destinationHost: source.host,
      endpointHash: fingerprint(source.endpoint, source.recipient),
      scriptHash: hookScriptHash(context.config),
    };
  }

  verify(grant: HookNotificationGrant, context: HookContext) {
    if (
      this.dependencies.locked(context.groupId) ||
      grant.groupId !== context.groupId ||
      grant.scope !== context.scope ||
      grant.origin !== context.origin ||
      grant.profile !== context.profile ||
      hookScriptHash(context.config) !== grant.scriptHash
    )
      throw new Error(
        'Script or group changed. Review this notification permission again.'
      );
    const source = this.fields(grant, context);
    if (fingerprint(source.endpoint, source.recipient) !== grant.endpointHash)
      throw new Error(
        'Saved destination changed. Review this notification permission again.'
      );
    return source;
  }

  save(grant: HookNotificationGrant, context: HookContext) {
    this.verify(grant, context);
    const previous = this.grants(context);
    this.dependencies.vault((vault) => vault.saveHookNotification(grant));
    previous
      .filter((item) => item.key === grant.key)
      .forEach((item) => this.deactivate(item.id));
    this.cache.delete(this.cacheKey(context));
    this.grants(context);
    this.active.set(grant.id, this.dependencies.epoch());
  }

  permissions(context: HookContext) {
    try {
      return this.grants(context).map((grant) => ({
        id: grant.id,
        key: grant.key,
        label: grant.label,
        destinationHost: grant.destinationHost,
        active:
          this.active.get(grant.id) === this.dependencies.epoch() &&
          !this.dependencies.locked(context.groupId) &&
          context.config.enabled &&
          hookScriptHash(context.config) === grant.scriptHash,
      }));
    } catch {
      return [];
    }
  }

  find(id: string, context: HookContext) {
    const grant = this.grants(context).find((item) => item.id === id);
    if (!grant) throw new Error('This notification permission is unavailable.');
    return grant;
  }

  activate(id: string, context: HookContext) {
    const grant = this.find(id, context);
    this.verify(grant, context);
    this.active.set(id, this.dependencies.epoch());
  }

  revoke(id: string, context: HookContext) {
    this.deactivate(id);
    this.dependencies.vault((vault) =>
      vault.revokeHookNotification(id, context.groupId, context.scope)
    );
    this.cache.delete(this.cacheKey(context));
  }

  deactivate(id: string) {
    this.active.delete(id);
    this.pending.get(id)?.abort();
  }

  revokeSession(group?: string) {
    if (!group) [...this.active.keys()].forEach((id) => this.deactivate(id));
    this.cache.forEach((grants) =>
      grants.forEach((grant) => {
        if (!group || grant.groupId === group) this.deactivate(grant.id);
      })
    );
  }

  dataChanged() {
    const previous = [...this.cache.values()].flat();
    this.cache.clear();
    previous.forEach((grant) => {
      try {
        const context = { ...grant, config: {} as SiteDeveloperConfig };
        if (!this.grants(context).some((item) => item.id === grant.id))
          throw new Error('Permission removed');
        const source = this.fields(grant, context);
        if (
          fingerprint(source.endpoint, source.recipient) !== grant.endpointHash
        )
          throw new Error('Destination changed');
      } catch {
        this.deactivate(grant.id);
      }
    });
  }

  revokeLocked() {
    this.cache.forEach((grants) =>
      grants.forEach((grant) => {
        if (this.dependencies.locked(grant.groupId)) this.deactivate(grant.id);
      })
    );
  }

  reconcile(
    profile: string,
    origin: string,
    config: SiteDeveloperConfig | undefined
  ) {
    this.cache.forEach((grants) =>
      grants.forEach((grant) => {
        if (
          grant.profile === profile &&
          grant.origin === origin &&
          (!config?.enabled || hookScriptHash(config) !== grant.scriptHash)
        )
          this.deactivate(grant.id);
      })
    );
  }

  async notify(
    key: string,
    text: string,
    context: HookContext,
    sourceSignal?: AbortSignal
  ) {
    if (typeof text !== 'string' || !text.trim() || text.length > 2000)
      throw new Error('Notification text must be 1–2000 characters.');
    const grant = this.grants(context).find((item) => item.key === key);
    if (
      !grant ||
      !context.config.enabled ||
      this.active.get(grant.id) !== this.dependencies.epoch()
    )
      throw new Error(
        'Approve this notification permission in Developer before using it.'
      );
    let source;
    try {
      source = this.verify(grant, context);
    } catch (error) {
      this.deactivate(grant.id);
      throw error;
    }
    const now = this.dependencies.now();
    const hash = createHash('sha256').update(text).digest('hex');
    const recent = (this.deliveries.get(grant.id) || []).filter(
      (item) => now - item.time < 3600000
    );
    if (
      this.pending.has(grant.id) ||
      recent.length >= 20 ||
      recent.some(
        (item) =>
          now - item.time < 30000 ||
          (item.hash === hash && now - item.time < 300000)
      )
    )
      throw new Error(
        'Notification rate limit reached. Wait before sending another update.'
      );
    recent.push({ time: now, hash });
    this.deliveries.set(grant.id, recent);
    const controller = new AbortController();
    this.pending.set(grant.id, controller);
    try {
      return await this.dependencies.send(
        source.endpoint,
        source.recipient,
        text,
        sourceSignal
          ? AbortSignal.any([controller.signal, sourceSignal])
          : controller.signal
      );
    } finally {
      this.pending.delete(grant.id);
    }
  }
}
let service: HookNotifications | undefined;
export function hookNotifications() {
  if (!service) {
    service = new HookNotifications({
      vault: withPersonalData,
      epoch: personalDataRevision,
      send: deliverHookWebhook,
      now: Date.now,
      locked: (id) => getGroupLocks().locked(id),
    });
    onPersonalDataRevoked(() => service!.revokeSession());
    passwordVault().onChange(() => service!.dataChanged());
    getGroupLocks().subscribe(() => {
      service!.revokeLocked();
    });
    onSiteSettingsChanged((profile, origin) =>
      service!.reconcile(profile, origin, effectiveHookConfig(profile, origin))
    );
  }
  return service;
}
