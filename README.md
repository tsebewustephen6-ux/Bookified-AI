# Bookified

Upload a PDF, choose an account-verified voice, and talk to its contents.

Read [PROJECT.md](PROJECT.md) for the authoritative build contract, implementation evidence, setup, deployment configuration, and remaining live acceptance. The application is implemented with live verification blocked by missing Clerk, Atlas, private Blob and Vapi configuration.

Use Node 24. Run `npm ci`, configure ignored `.env.local` from `.env.example`, then run `npm run config:check` and `npm run db:indexes`. Start `npm run dev` and `npm run worker` in separate terminals. Open http://localhost:3000.

Local checks: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e`. The integration suite uses a disposable real MongoDB replica set and isolated provider fixtures; it does not prove live checkout or audio works. See PROJECT.md for the required live acceptance checklist.
