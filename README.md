# Kudium monorepo

The desktop browser and web service are separate applications in one Git repository.
Each keeps its own dependencies, lockfile, build and deployment configuration.

```text
apps/
  browser/    Electron + React desktop browser (npm)
  web/        Bun + Hono + Better Auth + PostgreSQL/Drizzle web service (Bun)
```

- [Browser setup and documentation](apps/browser/README.md)
- [Web service setup](apps/web/README.md)
- [Deploy webbrowser.kudium.com](apps/web/deploy/README.md)

## Start development

Run these commands from the monorepo root, in separate terminals:

```sh
npm run dev:browser
npm run dev:web
```

The web app requires an untracked `apps/web/.env` configured from
`apps/web/.env.example`. For local development use
`BETTER_AUTH_URL=http://localhost:3000`. Generate a persistent Better Auth secret,
configure PostgreSQL and run `npm run db:migrate` before starting it.

## Install and check

```sh
npm run install:browser
npm run install:web
npm run check:web
npm run test:web
npm run test:browser -- --runInBand
npm run build:browser
```

Browser requirements and native build steps are in its README. The web app runs on
Bun. Commands can also run directly inside each app's directory. Dependencies remain
app-local; run installs through the app-specific commands above.

Set `TEST_DATABASE_URL` to a dedicated PostgreSQL test database when running the web
integration tests. Without it, those tests are explicitly skipped.

`npm run package:browser` packages the browser with its existing GitHub update feed.
`npm run package:web` packages the browser with the feed at
`https://webbrowser.kudium.com`. The name refers to the update provider; the web
service itself deploys from `apps/web/Dockerfile` or `apps/web/compose.yaml`.

The web backend supports Better Auth sessions, encrypted sync records and update
feeds. Desktop account connection and encryption-key onboarding remain separate
work. Deployment instructions and current limitations live with the web app.
