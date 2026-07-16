# Phase 1: User Model + Per-User Auth — Design

Date: 2026-07-09 · Branch: `multi-user-phase-0` · Parent plan: [`docs/MULTI_USER_PLAN.md`](../../MULTI_USER_PLAN.md)

## Goal

Replace the shared-env-password auth with individual user accounts and scope all
data per user — with zero data loss and zero workflow change for the household
currently using the app.

## Decisions (locked with owner)

| Decision | Choice |
|---|---|
| Existing household data | Migrates to a **single shared household account**; the family keeps sharing one login. Individual accounts arrive when social features need them. |
| OAuth (Google/GitHub) | **Deferred** to public deployment. Adapter tables created now so it's config-only later. |
| Registration | **Minimal sign-up page** in Phase 1 (email, name, password). No email verification yet. |
| Sessions | **JWT** (unchanged, 30-day). Mobile-friendlier; no per-request DB hit. |
| Migration style | **Approach A**: single expand migration + idempotent seed. Expand/contract deferred until rolling deploys exist. |

## Schema changes

New models (NextAuth `@auth/prisma-adapter`-compatible):

- `User`: `id` (cuid), `email String @unique`, `passwordHash String?`,
  `name String?`, `image String?`, `emailVerified DateTime?`, timestamps.
- `Account`, `Session`, `VerificationToken`: standard adapter shapes. Inert in
  Phase 1 (JWT sessions, no OAuth, no verification) — they exist so enabling
  OAuth later requires no migration.

Changed models:

- `Recipe.userId String` (required) → `User`, `onDelete: Cascade`,
  `@@index([userId, createdAt])`.
- `MealPlan.userId String` (required) → `User`, `onDelete: Cascade`.
  `weekStartDate @unique` **replaced** by `@@unique([userId, weekStartDate])`.
- `GroceryList`/`GroceryItem`: unchanged — scoped through `MealPlan`.
- `Tag`/`RecipeTag`: unchanged — tags remain a global vocabulary.

## Migration + seed (Approach A)

One Prisma migration, in order, single transaction:

1. Create `User`/`Account`/`Session`/`VerificationToken` tables.
2. Insert household user row: fixed id `household-user`, placeholder unique
   email (`household@placeholder.local`), `passwordHash` NULL.
3. Add `userId` columns as NULLable; backfill every `Recipe` and `MealPlan`
   row with `household-user`.
4. Set `userId` NOT NULL; add FKs, indexes, and the new composite unique;
   drop the old `weekStartDate` unique.

**Seed step** (`scripts/seed-household.mjs` — plain JS, since the runtime
image has no TS compiler; run by entrypoint after `migrate deploy`,
idempotent):

- Reads `HOUSEHOLD_EMAIL` and `HOUSEHOLD_PASSWORD_HASH` env vars.
- Upserts the `household-user` row's real email + password hash **only if the
  row still has the placeholder email** (never overwrites later edits).
- Result: the family logs in with the same password as today, plus an email.

Entrypoint becomes: `migrate deploy` → `node seed` → `node server.js`.

## Auth changes

- `authorize()` in `src/lib/auth.ts`: look up `User` by email, bcrypt-compare
  against `passwordHash` (NULL hash = cannot password-login). Returns
  `{ id, name, email }`.
- JWT/session callbacks expose `user.id` on the session (typed via module
  augmentation).
- `POST /api/auth/register`: validates email format + password length (min 8),
  bcrypt-hashes, creates user; 409 on duplicate email.
- `/register` page: minimal form matching the existing `/login` styling; login
  page gains an email field and a link to register.
- `HOUSEHOLD_PASSWORD_HASH` env var: consumed by seed, then documented as
  removable. `.env.example` updated (`HOUSEHOLD_EMAIL` added).

## Route scoping

Every data handler resolves the session (middleware already gates, but
handlers re-check and read `session.user.id`) and constrains queries:

- `GET/POST /api/recipes`, `GET/DELETE /api/recipes/[id]` — `where userId`.
- `GET /api/meal-plan` (get-or-create) — upsert keyed by
  `userId_weekStartDate`.
- `POST /api/meal-plan/[id]/entry`, `/auto-fill` — verify plan ownership
  first; auto-fill draws only from the caller's recipes.
- Grocery list routes — ownership verified through
  `groceryList.mealPlan.userId`, including nested item routes (an item id
  alone must never authorize access).
- `POST /api/recipes/parse` — session-gated (no data scoping needed).
- IMAP poller — imports into the user named by `IMPORT_USER_EMAIL` env
  (default: `HOUSEHOLD_EMAIL`). `/api/cron/poll-email` auth unchanged.

## Testing

- Unit: register-route validation (email/password rules, duplicate email),
  auth `authorize()` logic (jest, mocked prisma).
- Migration gate (the critical one): restore the latest `backups/` dump into a
  scratch postgres → `migrate deploy` → seed → assert (a) row counts unchanged,
  (b) every Recipe/MealPlan has `userId = 'household-user'`, (c) household
  login works with the old password, (d) composite unique holds.
- Isolation check: seed a second user; cross-user reads/writes return **404**
  (not 403 — don't leak resource existence).
- CI (existing workflow) validates the migration on a fresh DB + drift check.

## Rollout

1. Dump live DB (`backups/pre-phase-1-<date>.dump`).
2. Merge branch work; `docker compose build && up -d`.
3. Entrypoint applies migration + seed on boot.
4. Verify: family logs in (same password + email), recipes/plans visible.
5. Rollback path: restore dump + previous image tag.

## Out of scope (deferred)

- OAuth providers, email verification, password reset (public-deployment work).
- Household/group co-ownership model (post-Phase-2 sharing feature).
- Recipe visibility/follows/forks (Phase 2).
- Mobile token endpoint (with the mobile app, later).
