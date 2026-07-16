# Multi-User Social Platform — Phased Plan

Evolution of the household meal planner into a multi-user social recipe platform.
Full background/context in [`fable-context.md`](../fable-context.md). This plan was
drafted with Claude (Fable 5) in July 2026.

**Model recommendations** — which Claude model to use for the work in each phase,
and which the app should call at runtime:

| Phase | Work | Claude Code model | Runtime model |
|---|---|---|---|
| 0 | Migrate baseline, CI, safety | Sonnet 5 | — |
| 1 | User model, auth, data backfill | Opus 4.8 (design/auth), Sonnet 5 (route sweep) | — |
| 2 | Visibility / follows / forks | Sonnet 5 | — |
| 3 | Job queue, async parsing | Sonnet 5 | Haiku 4.5 → Sonnet 5 fallback; Batch API for email imports |
| 4 | Search, feed, indexes | Sonnet 5 | — |
| 5 | Deploy, CDN, pooling | Sonnet 5 (Opus 4.8 for decisions) | — |

---

## Phase 0 — Foundations ✅ COMPLETE (2026-07-08, branch `multi-user-phase-0`)

Goal: migration safety before any schema changes.

**Done:**
- Baselined Prisma Migrate: `prisma/migrations/0_init` generated via
  `prisma migrate diff --from-empty --to-schema`, verified zero drift against the
  live DB, marked applied with `prisma migrate resolve --applied 0_init`.
- Entrypoint now runs `prisma migrate deploy` (previously
  `prisma db push --accept-data-loss` — destructive-capable on every boot).
- CI (`.github/workflows/ci.yml`): type-check, jest, migrations applied to a fresh
  postgres, schema-drift check (`migrate diff --from-config-datasource --to-schema --exit-code`).
- Compose project name pinned to `recipe_mealplanner` in `docker-compose.yml`.

**Incident found & fixed along the way:** two postgres containers were running
against the same data volume (`recipe_mealplan_postgres_data`). Cause: directory
renames (`recipe_mealplan` → `recipe_mealplanner` → `social_recipe_mealplanner`)
made `docker compose up` create a new stack each time, all pointing at the same
external volume; a power outage on ~2026-07-06 auto-restarted the stale container
(`restart: unless-stopped`). The stale container and its network were removed.
The `name:` pin prevents recurrence.

**Operational notes:**
- Pre-baseline dump: `backups/pre-baseline-2026-07-08.dump` (pg_dump custom
  format, gitignored). Take a new dump before each phase's migration:
  `docker exec recipe_mealplanner-db-1 pg_dump -U mealplanner -d mealplanner --format=custom > backups/<name>.dump`
- The db publishes no host ports. Run Prisma CLI against the live DB through the
  app container: `docker exec recipe_mealplanner-app-1 npx prisma <cmd>`
- Leftover volume `recipe_mealplanner_postgres_data` (middle-era, unused) still
  exists; check contents before deleting.

## Phase 1 — User model + auth migration ✅ IMPLEMENTED (2026-07-16) — NOT YET DEPLOYED

**Status:** complete on branch `multi-user-phase-0`, final code review passed
("Ready to merge"), **PR #2 open**: https://github.com/wavedingo/recipe_mealplanner/pull/2.
The live app still runs Phase 0 — nothing changes at home until the deploy below.
Spec: `docs/superpowers/specs/2026-07-09-phase-1-multi-user-auth-design.md` ·
Plan: `docs/superpowers/plans/2026-07-09-phase-1-multi-user-auth.md`

Verified so far: 61 jest tests + type-check green; migration gate script proved a
lossless upgrade against a restore of the production dump (all recipes/meal plans
backfilled to the household account); end-to-end smoke on a throwaway stack passed
(register 201, duplicate email 409, unauthenticated 401/307, two-user isolation
verified at BOTH the API layer and the rendered `/recipes` page).

### Owner test & deploy checklist (do in order)

1. **Merge**: confirm PR #2 CI is green, then merge it into `main`.
2. **Configure**: add one line to `.env`:
   `HOUSEHOLD_EMAIL=james.varga@icloud.com`
   (keep `HOUSEHOLD_PASSWORD_HASH` exactly as it is — see "About the password" below).
3. **Backup**:
   `docker exec recipe_mealplanner-db-1 pg_dump -U mealplanner -d mealplanner --format=custom > backups/pre-phase-1-$(date +%F).dump`
4. **Deploy**: `git checkout main && git pull && docker compose build app && docker compose up -d`
   (the migration + seed run automatically on boot; watch with `docker logs -f recipe_mealplanner-app-1` —
   expect "Applying database migrations", "seed-household: configured household user as james.varga@icloud.com", then Next.js start).
5. **Expect a one-time logout**: everyone's existing session is invalidated by
   design; the login page now asks for **email + password**.
6. **Log in** (do NOT use the register page for the household email):
   email `james.varga@icloud.com`, password = **the same household password as
   always**. All recipes, meal plans, and grocery lists should be there.
7. **Test isolation** (optional but recommended): use the "Create one" link to
   register a throwaway second account (any other email) — its library should be
   empty, and it must not see household recipes (try a household recipe URL → 404).
8. **Test the flows you use daily**: assign a recipe to the week, regenerate the
   grocery list, check off items, import a recipe by URL.
9. **Rollback if anything is wrong**: `git checkout 7b02610 && docker compose build app && docker compose up -d`,
   then restore the step-3 dump if the DB needs reverting:
   `docker exec -i recipe_mealplanner-db-1 pg_restore -U mealplanner -d mealplanner --clean < backups/pre-phase-1-<date>.dump`

**About the password:** there is no new password and no first-login setup step.
The deploy's seed script copies your *existing* household password hash onto the
new user account — so at the new login screen you type your email plus the exact
password the family uses today. Nothing to create or reset. (A password-change /
reset feature is deliberately deferred to the public-deployment phase; until
then the household password stays what it is.) The register page will refuse
`james.varga@icloud.com` with "log in instead" — that's intentional protection,
not an error.

### Original Phase 1 goals (for reference)

Goal: individual accounts, all data scoped per user, zero data loss for existing
household data. **Use Opus 4.8 for the schema/auth design and migration; Sonnet 5
for the mechanical route sweep.**

1. **`User` model + NextAuth adapter tables** (`@auth/prisma-adapter` schema:
   `User`, `Account`, plus `Session` if switching to DB sessions — JWT sessions
   are fine initially).
2. **Ownership**: required `userId` on `Recipe` and `MealPlan`. Replace
   `MealPlan.weekStartDate @unique` with `@@unique([userId, weekStartDate])`.
   `GroceryList` inherits scope through `MealPlan`. `Tag` stays global.
3. **Data migration**: create household user(s) → backfill `userId` on all
   existing rows → then add NOT NULL. One migration, tested against a restored
   dump first.
4. **Auth**: per-user email+password (bcrypt) via Credentials provider; then
   Google/GitHub OAuth (mostly config once the adapter is in). Email verification
   before going public. Keep the shared-password login during a transition
   window, mapped to the household user, then remove it.
5. **Route sweep**: every API query gains `where: { userId: session.user.id }`.
   Point the IMAP importer at a specific user's library.

## Phase 2 — Visibility, follows, forks

Goal: the social data model. **Sonnet 5.**

- `visibility Visibility @default(PRIVATE)` enum (`PRIVATE` / `PUBLIC`) on Recipe.
- `Follow` join table (`@@id([followerId, followingId])`, index on `followingId`).
- Keep `forkedFromId` (fork = copy row + set owner + `forkedFromId`,
  `onDelete: SetNull`). JSON `ingredients`/`steps` stay as JSON — copies come free;
  revisit only if ingredient-level relational queries become a requirement.
- Indexes: `@@index([visibility, createdAt])`, `@@index([userId, createdAt])`.
- Public recipe page = `/recipes/[id]` + visibility check → shareable links.
- Likes/bookmarks (if confirmed): join tables shaped like `Follow`.

## Phase 3 — Async parsing + cost control

Goal: unblock the 5–15s Claude parse and cap API spend. **Build: Sonnet 5.
Runtime: Haiku 4.5, Sonnet 5 fallback.**

- **pg-boss** job queue on the existing Postgres (no Redis). Parse endpoint
  enqueues and returns a job id; client polls or SSE.
- Worker = separate small Node process in compose; the IMAP poller moves there
  too (replaces the cron route).
- Parsing model: `claude-haiku-4-5` with **structured outputs**
  (`output_config.format` json_schema matching `ParsedRecipe`) — no more
  prompt-and-parse. On low confidence/failure, retry once on `claude-sonnet-5`.
  Email imports can use the Batch API (50% cost).
- Per-user rate limit on parses (counter table or pg-boss throttling).

## Phase 4 — Discovery & feed

Goal: browse/search/feed over public recipes. **Sonnet 5.**

- Postgres FTS: generated `tsvector` column (title + description) + GIN index.
  No Elasticsearch.
- Feed query: recipes from followed users, `visibility = PUBLIC`, newest first —
  served by Phase 2 indexes. Precomputed feeds are a much-later problem.
- No read replicas yet; indexes + Next.js caching of public pages first.

## Phase 5 — Infrastructure

Goal: leave the single host gracefully. **Sonnet 5 (Opus 4.8 for target choice).**

- Stay a monolith: Next.js app + one worker process. Split only on asymmetric
  scaling pain.
- Deploy target: Fly.io or Railway (Docker + managed Postgres + long-lived
  worker; Vercel is an awkward fit for the worker).
- Images: download to Cloudflare R2/S3 + CDN at import (stop hotlinking),
  resize with `sharp` in the worker.
- PgBouncer (transaction mode) the moment there's a second app instance.

---

## Standing rules (all phases)

- Every schema change = a Prisma migration on a branch, CI green, dump taken
  before deploy. Never `prisma db push` against the live DB.
- `docker-compose.yml` keeps `name: recipe_mealplanner` — see Phase 0 incident.
- Verify each phase against a restore of the latest dump before deploying.
