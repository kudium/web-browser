# Local email with Mailpit

Mailpit captures signup verification, password reset and email-change messages
without sending them to real inboxes. Kudium can share KudiTrust's existing
Mailpit service on this Mac.

Install once, then start from the repository root:

```sh
brew install mailpit
npm run mailpit:up
```

Set these values in the untracked `apps/web/.env`:

```env
BETTER_AUTH_URL=http://localhost:3000
SMTP_URL=smtp://127.0.0.1:1025
SMTP_FROM=Kudium Local <hello@kudium.local>
```

Keep your existing database configuration and Better Auth secret. Restart
`npm run dev:web` after changing the environment. Both SMTP settings must be
present to enable verification and recovery.

Open http://127.0.0.1:8025 to read captured messages and follow their local links.
Create a disposable account at http://localhost:3000/sign-up, verify it from
Mailpit, then request a reset at http://localhost:3000/forgot-password.

```sh
npm run mailpit:status
npm run mailpit:down
```

Stopping the shared service also stops KudiTrust's local email capture. When
Mailpit is unavailable, Kudium reports the mail failure so local QA can catch it.
Production uses its separate Maileroo configuration in Coolify; never point
production at Mailpit or copy production credentials into local fixtures.
