import { createHash } from 'node:crypto';
import { passkey } from '@better-auth/passkey';
import { betterAuth } from 'better-auth';
import { bearer, deviceAuthorization } from 'better-auth/plugins';
import { createAuthMiddleware } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import nodemailer from 'nodemailer';
import type { Database } from './db';
import type { AuthConfig } from './config';
import { authUser, authSession, authAccount, authVerification, authRateLimit, authDeviceCode, authPasskey } from './schema';
export type Authenticate = (token: string) => Promise<string>;
export function syncAccountId(userId: string) {
  return createHash('sha256').update(`better-auth\0${userId}`).digest('hex');
}
export type MailDelivery = (message: { from?: string; to: string; subject: string; text: string }) => Promise<unknown>;
export function createAuth(db: Database, config: AuthConfig, delivery?: MailDelivery) {
  const mailer = config.smtpURL ? nodemailer.createTransport(config.smtpURL) : undefined;
  const sendMail = delivery ?? (mailer ? (message: Parameters<MailDelivery>[0]) => mailer.sendMail(message) : undefined);
  const auth = betterAuth({
    appName: 'Kudium Browser', secret: config.secret, baseURL: config.baseURL, basePath: '/api/auth',
    trustedOrigins: [config.baseURL],
    database: drizzleAdapter(db, { provider: 'pg', schema: { user: authUser, session: authSession, account: authAccount, verification: authVerification, rateLimit: authRateLimit, deviceCode: authDeviceCode, passkey: authPasskey } }),
    socialProviders: config.google ? { google: { ...config.google, prompt: 'select_account' } } : {},
    account: { encryptOAuthTokens: true, accountLinking: { enabled: true, requireLocalEmailVerified: true, allowDifferentEmails: false } },
    emailAndPassword: {
      enabled: true, minPasswordLength: 12, maxPasswordLength: 128,
      requireEmailVerification: Boolean(sendMail),
      revokeSessionsOnPasswordReset: true,
      ...(sendMail ? { sendResetPassword: async ({ user, url }: { user: { email: string }; url: string }) => {
        await sendMail!({ from: config.smtpFrom, to: user.email, subject: 'Reset your Kudium password', text: `Reset your password using this link:\n${url}\n\nIf you did not request this, ignore this email.` });
      } } : {}),
    },
    ...(sendMail ? { emailVerification: {
      sendOnSignUp: true, sendOnSignIn: true,
      sendVerificationEmail: async ({ user, url }: { user: { email: string }; url: string }) => {
        await sendMail!({ from: config.smtpFrom, to: user.email, subject: 'Verify your Kudium email', text: `Verify your email using this link:\n${url}` });
      },
    } } : {}),
    session: { expiresIn: 7 * 24 * 60 * 60, updateAge: 24 * 60 * 60, cookieCache: { enabled: false } },
    advanced: { useSecureCookies: new URL(config.baseURL).protocol === 'https:', cookiePrefix: 'kudium', defaultCookieAttributes: { httpOnly: true, sameSite: 'lax' } },
    plugins: [
      passkey({ rpID: new URL(config.baseURL).hostname, rpName: 'Kudium Browser', origin: config.baseURL, authenticatorSelection: { residentKey: 'required', userVerification: 'required' } }),
      deviceAuthorization({ expiresIn: '10m', interval: '5s', deviceCodeLength: 64, validateClient: clientId => clientId === 'kudium-desktop', verificationUri: `${config.baseURL}/device` }),
      { id: 'desktop-signed-session', hooks: { after: [{ matcher: ctx => ctx.path === '/device/token', handler: createAuthMiddleware(async ctx => { if (ctx.context.newSession) await setSessionCookie(ctx, ctx.context.newSession); }) }] } },
      bearer({ requireSignature: true }),
    ],
    rateLimit: { enabled: true, storage: 'database', window: 60, max: 100, customRules: { '/sign-in/email': { window: 60, max: 10 }, '/sign-up/email': { window: 60, max: 5 }, '/request-password-reset': { window: 60, max: 5 } } },
    logger: { disabled: true },
  });
  return auth;
}
export type Auth = ReturnType<typeof createAuth>;
export function authenticateSession(auth: Auth): Authenticate {
  return async token => {
    // Only the explicit signed desktop credential is considered; browser cookies cannot override it.
    const session = await auth.api.getSession({ headers: new Headers({ Authorization: `Bearer ${token}` }), query: { disableCookieCache: true } });
    if (!session) throw new Error('Invalid session');
    return syncAccountId(session.user.id);
  };
}
