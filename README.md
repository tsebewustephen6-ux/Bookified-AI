# Bookified

Upload a PDF, choose an account-verified voice, and talk to its contents.

Read [PROJECT.md](PROJECT.md) for the build contract, reconciled implementation ledger, setup and remaining acceptance gates. The current working tree uses Better Auth with MongoDB; paid checkout is unavailable. Voice configuration and a persistent processing worker require live setup.

Use Node 24. Run npm ci, configure ignored .env.local from .env.example, then npm run config:check and npm run db:indexes. Start npm run dev and npm run worker separately.

Vercel hosts the web application. Host npm run worker on a persistent supervised Node service with the same database/storage/voice settings. Configure APP_BASE_URL and BETTER_AUTH_URL to the hosted HTTPS origin; keep all secrets in encrypted environment settings.

Local gates: npm run lint, npm run typecheck, npm test, npm run build, npm run test:e2e. Browser tests accept BOOKIFIED_TEST_PORT when the normal preview port is occupied. Provider fixtures do not prove real checkout or audio.
