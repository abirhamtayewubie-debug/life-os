# Life OS

A personal operating system: priorities, plans, money, health, reflection and progress in one secure app.

- Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Database: [docs/DATABASE.md](docs/DATABASE.md)
- Design system: [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md)
- Roadmap & log: [docs/ROADMAP.md](docs/ROADMAP.md)
- Deployment, backups, monitoring: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- Security and accessibility reviews: [docs/SECURITY.md](docs/SECURITY.md), [docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md)

## Run it

Requires Node 20.9+.

```bash
npm install
npm run dev            # http://localhost:3000
```

With no `.env.local` the app runs in **demo mode**: clearly labelled sample data, nothing saved.

### With a database (local)

Requires Docker.

```bash
npx supabase start                 # prints the API URL and publishable key
cp .env.example .env.local         # fill NEXT_PUBLIC_SUPABASE_URL / _PUBLISHABLE_KEY
npm run dev
```

Sign up at `/signup` (local Supabase skips email confirmation). Load sample data from **Settings → Your data**, and remove it the same way.

### With a hosted Supabase project

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Checks

```bash
npm run check          # typecheck + lint + unit tests
npm run test:db        # database tests (local Supabase running)
npm run build && ANTHROPIC_API_KEY=e2e-mock ANTHROPIC_BASE_URL=http://127.0.0.1:3299 PORT=3200 npm start &
npm run test:e2e       # Playwright end-to-end (needs the local stack)
```

## Environment variables

See [.env.example](.env.example). Only the Supabase URL and publishable key are public; RLS protects the data. Secrets are server-only: the Anthropic key (optional, for the assistant); the service key and cron secret aren't used yet.
