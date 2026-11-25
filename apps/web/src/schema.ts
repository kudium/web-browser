import { sql } from 'drizzle-orm';
import { pgTable, text, integer, bigint, timestamp, jsonb, primaryKey, uniqueIndex, boolean, index, check } from 'drizzle-orm/pg-core';
import type { Envelope, ReleaseManifest } from './validation';
import type { HookPackage } from '../../../packages/hooks/package';
export const hookListings = pgTable('hook_listings', {
  id: text('id').primaryKey(), authorId: text('author_id').notNull().references(() => authUser.id, { onDelete: 'cascade' }),
  images: jsonb('images').$type<string[]>().notNull().default([]),
  name: text('name').notNull(), description: text('description').notNull(), applicability: text('applicability').notNull(),
  status: text('status').$type<'pending' | 'approved' | 'rejected'>().notNull().default('approved'), statusReason: text('status_reason'),
  version: integer('version').notNull().default(1), likes: integer('likes').notNull().default(0),
  publishedAt: timestamp('published_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(), updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
}, t => [index('hook_author').on(t.authorId), index('hook_public_cursor').on(t.publishedAt.desc().nullsFirst(), t.id.desc().nullsFirst()).where(sql`${t.status} = 'approved'`), index('hook_name_search').using('gin', sql`${t.name} gin_trgm_ops`).where(sql`${t.status} = 'approved'`)]);
export const hookVersions = pgTable('hook_versions', {
  hookId: text('hook_id').notNull().references(() => hookListings.id, { onDelete: 'cascade' }), version: integer('version').notNull(),
  status: text('status').$type<'pending' | 'approved' | 'rejected'>().notNull().default('approved'),
  package: jsonb('package').$type<HookPackage>().notNull(), contentHash: text('content_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.hookId, t.version] })]);
export const hookTargets = pgTable('hook_targets', {
  hookId: text('hook_id').notNull().references(() => hookListings.id, { onDelete: 'cascade' }), host: text('host').notNull(), includeSubdomains: boolean('include_subdomains').notNull(),
}, t => [primaryKey({ columns: [t.hookId, t.host] }), index('hook_target_host').on(t.host, t.hookId)]);
export const hookLikes = pgTable('hook_likes', {
  hookId: text('hook_id').notNull().references(() => hookListings.id, { onDelete: 'cascade' }), userId: text('user_id').notNull().references(() => authUser.id, { onDelete: 'cascade' }),
}, t => [primaryKey({ columns: [t.hookId, t.userId] })]);
export const hookComments = pgTable('hook_comments', {
  id: text('id').primaryKey(), hookId: text('hook_id').notNull().references(() => hookListings.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => authUser.id, { onDelete: 'cascade' }), body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(), updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
}, t => [index('hook_comment_cursor').on(t.hookId, t.createdAt, t.id)]);
export const hookReports = pgTable('hook_reports', {
  id: text('id').primaryKey(), hookId: text('hook_id').notNull().references(() => hookListings.id, { onDelete: 'cascade' }),
  commentId: text('comment_id').references(() => hookComments.id, { onDelete: 'set null' }), userId: text('user_id').notNull().references(() => authUser.id, { onDelete: 'cascade' }),
  reason: text('reason').notNull(), resolved: boolean('resolved').notNull().default(false), createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
});
export const hookModeration = pgTable('hook_moderation', {
  id: text('id').primaryKey(), hookId: text('hook_id').notNull().references(() => hookListings.id, { onDelete: 'cascade' }),
  adminId: text('admin_id').notNull().references(() => authUser.id), action: text('action').notNull(), reason: text('reason'), createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
});
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
  username: text('username').notNull().default(sql`'publisher_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)`).unique(),
  emailVerified: boolean('email_verified').notNull().default(false), image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [check('auth_users_username_format', sql`${t.username} ~ '^(?:[a-z][a-z0-9_]{2,29}|publisher-[a-f0-9]{32})$'`)]);
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
