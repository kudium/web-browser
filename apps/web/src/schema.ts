import { pgTable, text, integer, bigint, timestamp, jsonb, primaryKey, uniqueIndex, boolean, index } from 'drizzle-orm/pg-core';
import type { Envelope, ReleaseManifest } from './validation';
export const accounts = pgTable('sync_accounts', {
  id: text('id').primaryKey(), changeCount: integer('change_count').notNull().default(0), revision: bigint('revision', { mode: 'number' }).notNull().default(0),
  historyBytes: integer('history_bytes').notNull().default(0), usedBytes: integer('used_bytes').notNull().default(0), recordCount: integer('record_count').notNull().default(0),
});
export const records = pgTable('sync_records', {
  accountId: text('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  id: text('id').notNull(), revision: bigint('revision', { mode: 'number' }).notNull(),
  envelope: jsonb('envelope').$type<Envelope>(), bytes: integer('bytes').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.accountId, t.id] })]);
export const changes = pgTable('sync_changes', {
  accountId: text('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  revision: bigint('revision', { mode: 'number' }).notNull(), recordId: text('record_id').notNull(),
  // Immutable events make bounded, interrupted pagination safe even when a record changes again.
  envelope: jsonb('envelope').$type<Envelope>(), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.accountId, t.revision] })]);
export const releases = pgTable('app_releases', {
  id: text('id').primaryKey(), version: text('version').notNull(), platform: text('platform').notNull(),
  arch: text('arch').notNull(), channel: text('channel').notNull(), manifest: jsonb('manifest').$type<ReleaseManifest>().notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex('release_target_version').on(t.platform, t.arch, t.channel, t.version)]);

// Better Auth's schema keys are mapped explicitly; these names do not overlap sync_accounts.
export const authUser = pgTable('auth_users', {
  id: text('id').primaryKey(), name: text('name').notNull(), email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false), image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export const authSession = pgTable('auth_sessions', {
  id: text('id').primaryKey(), token: text('token').notNull().unique(),
  userId: text('user_id').notNull().references(() => authUser.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text('ip_address'), userAgent: text('user_agent'),
}, t => [index('auth_sessions_user').on(t.userId)]);
export const authAccount = pgTable('auth_accounts', {
  id: text('id').primaryKey(), accountId: text('account_id').notNull(), providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => authUser.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'), refreshToken: text('refresh_token'), idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'), password: text('password'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('auth_accounts_user').on(t.userId), uniqueIndex('auth_provider_identity').on(t.providerId, t.accountId)]);
export const authVerification = pgTable('auth_verifications', {
  id: text('id').primaryKey(), identifier: text('identifier').notNull(), value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('auth_verification_identifier').on(t.identifier)]);
export const authRateLimit = pgTable('auth_rate_limits', {
  id: text('id').primaryKey(), key: text('key').notNull().unique(), count: integer('count').notNull(),
  lastRequest: bigint('last_request', { mode: 'number' }).notNull(),
});

export const authDeviceCode = pgTable('auth_device_codes', {
  id: text('id').primaryKey(), deviceCode: text('device_code').notNull().unique(), userCode: text('user_code').notNull().unique(),
  userId: text('user_id').references(() => authUser.id, {onDelete: 'cascade'}), expiresAt: timestamp('expires_at', {withTimezone: true}).notNull(),
  status: text('status').notNull(), lastPolledAt: timestamp('last_polled_at', {withTimezone: true}), pollingInterval: integer('polling_interval'), clientId: text('client_id'), scope: text('scope'),
});

export const authPasskey = pgTable('auth_passkeys', {
  id: text('id').primaryKey(), name: text('name'), publicKey: text('public_key').notNull(),
  userId: text('user_id').notNull().references(() => authUser.id, { onDelete: 'cascade' }),
  credentialID: text('credential_id').notNull().unique(), counter: bigint('counter', { mode: 'number' }).notNull(),
  deviceType: text('device_type').notNull(), backedUp: boolean('backed_up').notNull(),
  transports: text('transports'), createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(), aaguid: text('aaguid'),
}, t => [index('auth_passkeys_user').on(t.userId)]);
