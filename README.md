# Bookified

Upload a PDF, choose an account-verified voice, and talk to its contents.

New conversations save private text history per book; audio recording remains disabled. View and continue a saved session, or start from the beginning without deleting earlier chats. Continuing creates a new quota-enforced timed call. Older conversations made before history was enabled cannot be recovered. Retrieval expands relevant passages with neighbouring context and supports focused alternative searches; illustrative teaching examples are distinguished from book evidence.

Read [PROJECT.md](PROJECT.md) for the build contract, reconciled implementation ledger, setup and remaining acceptance gates. The current working tree uses Better Auth with MongoDB. Hubtel MoMo/card checkout is implemented but disabled pending merchant onboarding, prices and approved status-API egress; see [payment setup](docs/hubtel-payments.md). Voice configuration requires live provider verification.

Use Node 24. Run npm ci, configure ignored .env.local from .env.example, then npm run config:check and npm run db:indexes. Start npm run dev and npm run worker separately.

Vercel hosts the web application and a Vercel Queues PDF processor. MongoDB jobs remain durable; signed queue messages use atomic leases, and authenticated daily cron recovery republishes stranded jobs. Owner status polling also retries dispatch. The local npm run worker remains available for development. Set independent random BOOKIFIED_QUEUE_SECRET and CRON_SECRET values in Vercel production. Configure APP_BASE_URL and BETTER_AUTH_URL to the hosted HTTPS origin; keep all secrets in encrypted environment settings.

Local gates: npm run lint, npm run typecheck, npm test, npm run build, npm run test:e2e. Browser tests accept BOOKIFIED_TEST_PORT when the normal preview port is occupied. Provider fixtures do not prove real checkout or audio.
