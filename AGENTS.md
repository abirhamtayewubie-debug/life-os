<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project conventions

- Read docs/ARCHITECTURE.md before adding a module. Domain logic lives in `src/features/<module>`; reads go through `src/server/*` starting with `getViewer()`; mutations are Server Actions validated with zod and using the user-scoped Supabase client.
- Every new user-owned table: `user_id`, `source data_source`, timestamps, composite FKs, and `select private.apply_owner_policies('public.<table>')`. Add a case to `supabase/tests/rls_isolation.sql`.
- Never invent data outside `src/lib/sample-data.ts`; every sample row has `source = 'sample'`.
- Run `npm run check` before committing.
