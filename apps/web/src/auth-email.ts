import { readFileSync } from 'node:fs';
const logo = readFileSync(new URL('../public/product/origin-logo.png', import.meta.url));
type EmailKind = 'welcome' | 'verification' | 'password-reset' | 'email-change';
const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);

/** Table layout and inline styles keep authentication emails usable in mail clients. */
export function authEmail(kind: EmailKind, url: string, newEmail?: string) {
  const content = {
    welcome: { subject: 'Welcome to Kudium', title: 'Make yourself at home.', intro: 'Welcome to Kudium. A calmer space for your tabs, ideas and work starts here.', action: 'Download Kudium Browser', note: 'Need help getting started? Just reach out to hello@kudium.com.' },
    verification: { subject: 'Verify your Kudium email', title: 'One last step.', intro: 'Verify your email address to finish setting up your Kudium account.', action: 'Verify email address', note: 'If you didn’t create a Kudium account, you can safely ignore this email.' },
    'password-reset': { subject: 'Reset your Kudium password', title: 'A fresh start.', intro: 'We received a request to reset your password. Choose a new one using the link below.', action: 'Reset password', note: 'If you didn’t request a password reset, you can safely ignore this email. Your password will stay the same.' },
    'email-change': { subject: 'Confirm your Kudium email change', title: 'Confirm your new email.', intro: `You requested to change your Kudium email address to ${newEmail || ''}. Confirm this change using the link below.`, action: 'Confirm email change', note: 'If you didn’t request this change, do not open the link. Contact hello@kudium.com for help.' },
  }[kind];
  const download = 'https://browser.kudium.com/download';
  const safeURL = escape(url);
  const supportText = kind === 'welcome' ? '\n\nKudium is free and open source. Help support its development: https://github.com/sponsors/kudium' : '';
  const supportHTML = kind === 'welcome' ? '<p style="margin:22px 0 0;font-size:12px;line-height:1.65;color:#86868b;">Kudium is free and open source. <a href="https://github.com/sponsors/kudium" style="color:#6e6e73;text-decoration:underline;">Help support its development</a>.</p>' : '';
  return {
    subject: content.subject,
    attachments: [{ filename: 'kudium-logo.png', content: logo, cid: 'kudium-logo', contentDisposition: 'inline' as const }],
    text: `${content.intro}\n\n${content.action}:\n${url}\n\n${content.note}\n\nDownload Kudium Browser: ${download}\nHelp: hello@kudium.com${supportText}`,
    html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(content.subject)}</title></head><body style="margin:0;padding:0;background:#f5f5f7;color:#1d1d1f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escape(content.intro)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f5f7;"><tr><td align="center" style="padding:48px 16px;">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" style="width:100%;max-width:560px;background:#fff;border-radius:20px;"><tr><td style="padding:44px 40px 40px;">
<a href="https://browser.kudium.com" style="text-decoration:none;"><img src="cid:kudium-logo" width="42" height="46" alt="Kudium" style="display:block;border:0;width:42px;height:46px;"></a>
<p style="margin:26px 0 12px;font-size:12px;font-weight:600;letter-spacing:1.6px;color:#86868b;">KUDIUM ACCOUNT</p>
<h1 style="margin:0 0 20px;font-size:36px;line-height:1.15;letter-spacing:-1.2px;font-weight:600;">${escape(content.title)}</h1>
<p style="margin:0 0 28px;font-size:16px;line-height:1.65;color:#515154;">${escape(content.intro)}</p>
<table role="presentation" cellspacing="0" cellpadding="0"><tr><td bgcolor="#1d1d1f" style="border-radius:9px;"><a href="${safeURL}" style="display:inline-block;padding:15px 24px;font-size:15px;font-weight:600;color:#fff;text-decoration:none;">${escape(content.action)}</a></td></tr></table>
<p style="margin:26px 0 0;font-size:13px;line-height:1.65;color:#86868b;">${escape(content.note)}</p>
<hr style="border:0;border-top:1px solid #e8e8ed;margin:32px 0;">
<p style="margin:0 0 7px;font-size:16px;font-weight:600;">Your browser. Your space.</p>
<p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#86868b;">Bring your tabs, ideas and work together with Kudium.</p>
<a href="${download}" style="font-size:14px;color:#287c79;text-decoration:none;font-weight:500;">Download Kudium Browser &rarr;</a>
${supportHTML}
</td></tr></table>
<table role="presentation" width="560" cellspacing="0" cellpadding="0" style="width:100%;max-width:560px;"><tr><td align="center" style="padding:24px 24px 0;font-size:12px;line-height:1.7;color:#86868b;">Kudium LTD<br>Need a hand? <a href="mailto:hello@kudium.com" style="color:#6e6e73;text-decoration:underline;">hello@kudium.com</a><br><a href="${safeURL}" style="color:#6e6e73;text-decoration:underline;">Open the ${kind === 'welcome' ? 'download' : kind === 'password-reset' ? 'password reset' : 'confirmation'} link</a> if the button doesn’t work.</td></tr></table>
</td></tr></table></body></html>`,
  };
}
