# Phase 1: Multi-User Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Individual user accounts with all recipes/meal-plans/grocery-lists scoped per user; existing household data migrates losslessly to a single shared household account.

**Architecture:** One expand migration creates NextAuth-adapter-compatible tables, inserts a fixed `household-user` row, and backfills `userId` onto all existing rows; an idempotent seed script sets that user's real email/password from env at boot. NextAuth Credentials switches from env-hash to DB lookup using the split-config pattern (edge-safe config for middleware). Every data route filters by the session's `userId`.

**Tech Stack:** Next.js 16 App Router, NextAuth v5 beta (JWT sessions), Prisma 7 + `@prisma/adapter-pg`, bcryptjs, PostgreSQL 16, Jest 30 + ts-jest.

**Spec:** `docs/superpowers/specs/2026-07-09-phase-1-multi-user-auth-design.md`

## Global Constraints

- Branch: `multi-user-phase-0`. Commit after every task.
- NEVER run `prisma db push`. Schema changes go through migration files only.
- NEVER point any command at the live DB (`db:5432` via the app container) except the final deploy. All verification uses scratch containers.
- The live DB is reachable ONLY through `docker exec recipe_mealplanner-app-1` — and this plan never needs it until deploy.
- Household user constants (exact strings, used across tasks): id `household-user`, placeholder email `household@placeholder.local`.
- Duplicate-email register copy (exact): `An account with this email already exists — log in instead.`
- Password minimum: 8 characters. bcrypt cost: 12.
- Cross-user access returns **404**, never 403.
- **Type-check note:** `npm run type-check` will be RED from Task 1 until Task 7 completes (required `userId` breaks existing `create()` calls until routes are updated). Run the targeted jest commands given in each task instead; Task 9 restores the full green gate.

---

### Task 1: Schema + expand migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260709000000_add_users/migration.sql`

**Interfaces:**
- Produces: Prisma models `User`, `Account`, `Session`, `VerificationToken`; `Recipe.userId: string`, `MealPlan.userId: string`; unique `MealPlan @@unique([userId, weekStartDate])` (client accessor `userId_weekStartDate`).

- [ ] **Step 1: Update `prisma/schema.prisma`**

Add the new models at the end of the file:

```prisma
model User {
  id            String    @id @default(cuid())
  email         String    @unique
  emailVerified DateTime?
  passwordHash  String?
  name          String?
  image         String?
  accounts      Account[]
  sessions      Session[]
  recipes       Recipe[]
  mealPlans     MealPlan[]
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
}

model Account {
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([provider, providerAccountId])
}

model Session {
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

model VerificationToken {
  identifier String
  token      String
  expires    DateTime

  @@id([identifier, token])
}
```

In `model Recipe`, add after `notes String?`:

```prisma
  userId       String
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
```

and add index lines at the bottom of the model body:

```prisma
  @@index([userId, createdAt])
```

In `model MealPlan`, replace:

```prisma
  weekStartDate DateTime       @unique // Monday of the week
```

with:

```prisma
  weekStartDate DateTime       // Monday of the week
  userId        String
  user          User           @relation(fields: [userId], references: [id], onDelete: Cascade)
```

and add at the bottom of the model body:

```prisma
  @@unique([userId, weekStartDate])
```

- [ ] **Step 2: Generate the migration DDL by diffing old vs new schema**

```bash
git show HEAD:prisma/schema.prisma > /tmp/schema-old.prisma
mkdir -p prisma/migrations/20260709000000_add_users
npx prisma migrate diff --from-schema /tmp/schema-old.prisma \
  --to-schema prisma/schema.prisma --script \
  > prisma/migrations/20260709000000_add_users/migration.sql
```

Expected: file contains `CREATE TABLE "User"`, `CREATE TABLE "Account"`, `CREATE TABLE "Session"`, `CREATE TABLE "VerificationToken"`, `ALTER TABLE "Recipe" ADD COLUMN "userId" TEXT NOT NULL;`, `ALTER TABLE "MealPlan" ADD COLUMN "userId" TEXT NOT NULL;`, `DROP INDEX "MealPlan_weekStartDate_key"`, new indexes, and FK constraints.

- [ ] **Step 3: Edit the migration for expand + backfill**

The generated `ADD COLUMN ... NOT NULL` statements fail on non-empty tables. Make exactly three edits:

(a) Immediately AFTER the `CREATE TABLE "User" (...);` statement, insert:

```sql
-- Seed the household user that existing data is assigned to.
-- Real email + password hash are set by scripts/seed-household.mjs at boot.
INSERT INTO "User" ("id", "email", "name", "createdAt", "updatedAt")
VALUES ('household-user', 'household@placeholder.local', 'Household', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
```

(b) Replace `ALTER TABLE "Recipe" ADD COLUMN "userId" TEXT NOT NULL;` with:

```sql
ALTER TABLE "Recipe" ADD COLUMN "userId" TEXT;
UPDATE "Recipe" SET "userId" = 'household-user';
ALTER TABLE "Recipe" ALTER COLUMN "userId" SET NOT NULL;
```

(c) Replace `ALTER TABLE "MealPlan" ADD COLUMN "userId" TEXT NOT NULL;` with:

```sql
ALTER TABLE "MealPlan" ADD COLUMN "userId" TEXT;
UPDATE "MealPlan" SET "userId" = 'household-user';
ALTER TABLE "MealPlan" ALTER COLUMN "userId" SET NOT NULL;
```

Leave every other generated statement untouched (constraint/index names must stay Prisma-generated or the CI drift check fails).

- [ ] **Step 4: Verify against a fresh scratch database**

```bash
docker run -d --rm --name phase1-scratch -p 15433:5432 \
  -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=test postgres:16-alpine
sleep 4
DATABASE_URL=postgresql://test:test@localhost:15433/test npx prisma migrate deploy
DATABASE_URL=postgresql://test:test@localhost:15433/test npx prisma migrate diff \
  --from-config-datasource --to-schema prisma/schema.prisma --exit-code
echo "drift: $?"
```

Expected: both migrations apply; drift exit code `0`.

- [ ] **Step 5: Verify against a restore of the real dump**

```bash
LATEST_DUMP=$(ls -t backups/*.dump | head -1)
docker exec -i phase1-scratch dropdb -U test test && docker exec -i phase1-scratch createdb -U test test
docker exec -i phase1-scratch pg_restore -U test -d test --no-owner --no-privileges < "$LATEST_DUMP"
DATABASE_URL=postgresql://test:test@localhost:15433/test npx prisma migrate resolve --applied 0_init
DATABASE_URL=postgresql://test:test@localhost:15433/test npx prisma migrate deploy
docker exec phase1-scratch psql -U test -d test -tc \
  "SELECT (SELECT count(*) FROM \"Recipe\" WHERE \"userId\" = 'household-user'),
          (SELECT count(*) FROM \"Recipe\"),
          (SELECT count(*) FROM \"MealPlan\" WHERE \"userId\" = 'household-user'),
          (SELECT count(*) FROM \"MealPlan\");"
```

Expected: first pair equal (all recipes backfilled), second pair equal (all plans backfilled). Row counts match the live counts noted at dump time.

- [ ] **Step 6: Regenerate the Prisma client**

```bash
npx prisma generate
```

- [ ] **Step 7: Clean up scratch and commit**

```bash
docker stop phase1-scratch
git add prisma/ && git commit -m "feat: add User model, expand migration with household backfill"
```

---

### Task 2: Seed script + entrypoint + env docs

**Files:**
- Create: `scripts/seed-household.mjs`
- Modify: `docker-entrypoint.sh`
- Modify: `.env.example`
- Modify: `Dockerfile` (copy `scripts/` into runner image)

**Interfaces:**
- Consumes: `User` table from Task 1; env vars `HOUSEHOLD_EMAIL`, `HOUSEHOLD_PASSWORD_HASH`, `DATABASE_URL`.
- Produces: idempotent `node scripts/seed-household.mjs` (exit 0 always unless DB unreachable).

- [ ] **Step 1: Write `scripts/seed-household.mjs`**

```js
// Idempotent: sets the household user's real email + password hash from env,
// but ONLY while the row still has the migration's placeholder email.
// Safe to run on every boot; a no-op on fresh DBs without env config.
import pg from 'pg';

const HOUSEHOLD_USER_ID = 'household-user';
const PLACEHOLDER_EMAIL = 'household@placeholder.local';

const email = process.env.HOUSEHOLD_EMAIL?.trim().toLowerCase();
const hash = process.env.HOUSEHOLD_PASSWORD_HASH;

if (!email || !hash) {
  console.log('seed-household: HOUSEHOLD_EMAIL / HOUSEHOLD_PASSWORD_HASH not set, skipping');
  process.exit(0);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const res = await pool.query(
    'UPDATE "User" SET "email" = $1, "passwordHash" = $2, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $3 AND "email" = $4',
    [email, hash, HOUSEHOLD_USER_ID, PLACEHOLDER_EMAIL]
  );
  console.log(
    res.rowCount === 1
      ? `seed-household: configured household user as ${email}`
      : 'seed-household: household user already configured, skipping'
  );
} finally {
  await pool.end();
}
```

- [ ] **Step 2: Test both seed paths against scratch**

```bash
docker run -d --rm --name phase1-scratch -p 15433:5432 \
  -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=test postgres:16-alpine
sleep 4
DATABASE_URL=postgresql://test:test@localhost:15433/test npx prisma migrate deploy
DATABASE_URL=postgresql://test:test@localhost:15433/test HOUSEHOLD_EMAIL=test@example.com \
  HOUSEHOLD_PASSWORD_HASH='$2b$12$abcdefghijklmnopqrstuv' node scripts/seed-household.mjs
DATABASE_URL=postgresql://test:test@localhost:15433/test HOUSEHOLD_EMAIL=test@example.com \
  HOUSEHOLD_PASSWORD_HASH='$2b$12$abcdefghijklmnopqrstuv' node scripts/seed-household.mjs
docker exec phase1-scratch psql -U test -d test -tc "SELECT email FROM \"User\" WHERE id = 'household-user';"
docker stop phase1-scratch
```

Expected: first run prints `configured household user as test@example.com`; second prints `already configured, skipping`; psql shows `test@example.com`.

- [ ] **Step 3: Update `docker-entrypoint.sh`**

```sh
#!/bin/sh
set -e

echo "Applying database migrations..."
npx prisma migrate deploy

echo "Seeding household user (idempotent)..."
node scripts/seed-household.mjs

echo "Starting Next.js app..."
exec node server.js
```

- [ ] **Step 4: Copy scripts into the runner image**

In `Dockerfile`, after `COPY --from=builder /app/prisma.config.ts ./prisma.config.ts` add:

```dockerfile
COPY --from=builder /app/scripts ./scripts
```

- [ ] **Step 5: Update `.env.example`**

Replace the `HOUSEHOLD_PASSWORD_HASH` line block with:

```
# Household account (Phase 1 migration): the pre-existing data is owned by this user.
# The seed script sets these on the household user row at boot (idempotent).
HOUSEHOLD_EMAIL=you@example.com
HOUSEHOLD_PASSWORD_HASH=<PASSWORD HASH>
# IMAP recipe imports go into this user's library (defaults to HOUSEHOLD_EMAIL):
# IMPORT_USER_EMAIL=you@example.com
```

- [ ] **Step 6: Commit**

```bash
git add scripts/ docker-entrypoint.sh Dockerfile .env.example
git commit -m "feat: idempotent household seed script wired into entrypoint"
```

---

### Task 3: Auth swap (split config, DB credentials, session userId)

**Files:**
- Create: `src/lib/auth.config.ts`
- Create: `src/types/next-auth.d.ts`
- Create: `src/lib/session.ts`
- Modify: `src/lib/auth.ts` (full replacement below)
- Modify: `src/middleware.ts`
- Modify: `src/app/login/page.tsx`
- Test: `src/lib/__tests__/auth-authorize.test.ts`

**Interfaces:**
- Consumes: `prisma.user.findUnique` (Task 1 client).
- Produces: `getSessionUserId(): Promise<string | null>` from `@/lib/session`; `session.user.id: string`; login form posts `email` + `password`.

- [ ] **Step 1: Create `src/lib/auth.config.ts`** (edge-safe: no prisma, no bcrypt)

```ts
import type { NextAuthConfig } from 'next-auth';

// Shared, edge-safe NextAuth options. middleware.ts builds its own NextAuth
// instance from this (JWT decode only); src/lib/auth.ts adds the Credentials
// provider, which pulls in prisma/bcrypt and must stay out of the middleware bundle.
export const authConfig = {
  secret: process.env.AUTH_SECRET,
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: '/login',
  },
  callbacks: {
    jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.id) session.user.id = token.id as string;
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
```

- [ ] **Step 2: Replace `src/lib/auth.ts`**

```ts
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
// bcryptjs is used instead of bcrypt because it is pure JS (no native addon) and works everywhere.
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { authConfig } from '@/lib/auth.config';

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email =
          typeof credentials?.email === 'string'
            ? credentials.email.trim().toLowerCase()
            : '';
        const password =
          typeof credentials?.password === 'string' ? credentials.password : '';
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        // NULL passwordHash (e.g. unseeded placeholder user) can never password-login.
        if (!user?.passwordHash) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, name: user.name, email: user.email };
      },
    }),
  ],
});
```

- [ ] **Step 3: Create `src/types/next-auth.d.ts`**

```ts
import 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string;
  }
}
```

- [ ] **Step 4: Create `src/lib/session.ts`**

```ts
import { auth } from '@/lib/auth';

/** Returns the signed-in user's id, or null when unauthenticated. */
export async function getSessionUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}
```

- [ ] **Step 5: Update `src/middleware.ts`** (edge-safe instance + allow /register)

```ts
import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { authConfig } from '@/lib/auth.config';

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isAuthRoute =
    req.nextUrl.pathname.startsWith('/api/auth') ||
    req.nextUrl.pathname.startsWith('/login') ||
    req.nextUrl.pathname.startsWith('/register');

  if (!isLoggedIn && !isAuthRoute) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

- [ ] **Step 6: Write the failing authorize test** — `src/lib/__tests__/auth-authorize.test.ts`

Test the credential-checking logic directly (extract it so it's testable without NextAuth):
add to `src/lib/auth.ts` an exported helper used by `authorize`:

```ts
export async function verifyCredentials(
  emailRaw: unknown,
  passwordRaw: unknown
): Promise<{ id: string; name: string | null; email: string } | null> {
  const email = typeof emailRaw === 'string' ? emailRaw.trim().toLowerCase() : '';
  const password = typeof passwordRaw === 'string' ? passwordRaw : '';
  if (!email || !password) return null;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user?.passwordHash) return null;
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return null;
  return { id: user.id, name: user.name, email: user.email };
}
```

and make `authorize` a one-liner: `return verifyCredentials(credentials?.email, credentials?.password);`

```ts
import bcrypt from 'bcryptjs';

jest.mock('@/lib/db', () => ({
  prisma: { user: { findUnique: jest.fn() } },
}));

import { prisma } from '@/lib/db';
import { verifyCredentials } from '@/lib/auth';

const findUnique = prisma.user.findUnique as jest.Mock;

describe('verifyCredentials', () => {
  const hash = bcrypt.hashSync('correct-password', 4);

  beforeEach(() => findUnique.mockReset());

  it('returns the user for a valid email + password', async () => {
    findUnique.mockResolvedValue({
      id: 'u1', email: 'a@b.com', name: 'A', passwordHash: hash,
    });
    await expect(verifyCredentials('A@b.com ', 'correct-password')).resolves.toMatchObject({ id: 'u1' });
    expect(findUnique).toHaveBeenCalledWith({ where: { email: 'a@b.com' } });
  });

  it('rejects a wrong password', async () => {
    findUnique.mockResolvedValue({
      id: 'u1', email: 'a@b.com', name: 'A', passwordHash: hash,
    });
    await expect(verifyCredentials('a@b.com', 'wrong')).resolves.toBeNull();
  });

  it('rejects an unknown email', async () => {
    findUnique.mockResolvedValue(null);
    await expect(verifyCredentials('nobody@b.com', 'x')).resolves.toBeNull();
  });

  it('rejects a user with NULL passwordHash', async () => {
    findUnique.mockResolvedValue({
      id: 'household-user', email: 'household@placeholder.local', name: 'Household', passwordHash: null,
    });
    await expect(verifyCredentials('household@placeholder.local', 'anything')).resolves.toBeNull();
  });

  it('rejects missing email or password', async () => {
    await expect(verifyCredentials(undefined, 'x')).resolves.toBeNull();
    await expect(verifyCredentials('a@b.com', undefined)).resolves.toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });
});
```

Run: `npx jest src/lib/__tests__/auth-authorize.test.ts`
Expected: FAIL (`verifyCredentials` not exported yet) — then apply the Step 6 auth.ts edit and re-run.
Expected: PASS (5 tests).

- [ ] **Step 7: Update `src/app/login/page.tsx`**

Changes to the existing file: pass email through the server action, add the email input, update copy, add register link, show a "registered" success note.

```tsx
import { auth, signIn } from '@/lib/auth';
import { AuthError } from 'next-auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; registered?: string }>;
}) {
  const session = await auth();
  if (session) redirect('/recipes');

  // Note: only the presence of `error` / `registered` is checked below, not the
  // value, so the query params are never rendered directly into the DOM.
  const { error, registered } = await searchParams;

  async function handleSignIn(formData: FormData) {
    'use server';
    try {
      await signIn('credentials', {
        email: formData.get('email'),
        password: formData.get('password'),
        redirectTo: '/recipes',
      });
    } catch (err) {
      if (err instanceof AuthError) {
        redirect(`/login?error=InvalidCredentials`);
      }
      // Re-throw non-AuthError (e.g. NEXT_REDIRECT from next-auth signIn with redirectTo)
      // so Next.js can handle the redirect correctly.
      throw err;
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#080c14]">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-700/60 rounded-2xl shadow-2xl shadow-black/60 p-8 flex flex-col gap-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-slate-50">Meal Planner</h1>
          <div className="mt-2 mx-auto w-10 h-0.5 bg-amber-400 rounded-full" />
          <p className="mt-3 text-sm text-slate-400">Sign in to continue</p>
        </div>

        {registered && (
          <p className="text-sm text-emerald-400 bg-emerald-950/40 border border-emerald-800/50 rounded-lg p-3">
            Account created. Sign in below.
          </p>
        )}

        <form action={handleSignIn} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm text-slate-400">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoFocus
              className="block w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-slate-100 placeholder:text-slate-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/40 transition-colors"
              placeholder="you@example.com"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm text-slate-400">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              className="block w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-slate-100 placeholder:text-slate-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/40 transition-colors"
              placeholder="Password"
            />
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-950/40 border border-red-800/50 rounded-lg p-3">
              Incorrect email or password. Please try again.
            </p>
          )}

          <button
            type="submit"
            className="w-full rounded-xl bg-amber-400 py-3 text-sm font-semibold text-slate-900 hover:bg-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 focus:ring-offset-slate-900 transition-colors"
          >
            Sign in
          </button>
        </form>

        <p className="text-center text-sm text-slate-400">
          No account?{' '}
          <Link href="/register" className="text-amber-400 hover:text-amber-300">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Run targeted tests and commit**

```bash
npx jest src/lib/__tests__/auth-authorize.test.ts
git add src/lib/auth.ts src/lib/auth.config.ts src/lib/session.ts src/types/next-auth.d.ts src/middleware.ts src/app/login/page.tsx src/lib/__tests__/auth-authorize.test.ts
git commit -m "feat: per-user credentials auth with split config and session userId"
```

---

### Task 4: Registration (validation lib, API route, page)

**Files:**
- Create: `src/lib/validate-registration.ts`
- Create: `src/app/api/auth/register/route.ts`
- Create: `src/app/register/page.tsx`
- Test: `src/lib/__tests__/validate-registration.test.ts`

**Interfaces:**
- Consumes: `prisma.user.create` (Task 1).
- Produces: `validateRegistration(body: unknown): { ok: true; value: { email: string; name: string; password: string } } | { ok: false; error: string }`; `POST /api/auth/register` → 201 `{id,email,name}` | 400 | 409.

- [ ] **Step 1: Write the failing validation tests** — `src/lib/__tests__/validate-registration.test.ts`

```ts
import { validateRegistration } from '../validate-registration';

describe('validateRegistration', () => {
  const valid = { email: 'A@Example.com ', name: ' Jane ', password: 'longenough' };

  it('accepts valid input, normalizing email and trimming name', () => {
    const r = validateRegistration(valid);
    expect(r).toEqual({
      ok: true,
      value: { email: 'a@example.com', name: 'Jane', password: 'longenough' },
    });
  });

  it.each([
    [null, 'Invalid request body'],
    ['x', 'Invalid request body'],
    [{ ...valid, email: 'not-an-email' }, 'A valid email is required'],
    [{ ...valid, email: undefined }, 'A valid email is required'],
    [{ ...valid, name: '  ' }, 'Name is required'],
    [{ ...valid, password: 'short7!' }, 'Password must be at least 8 characters'],
    [{ ...valid, password: 12345678 }, 'Password must be at least 8 characters'],
  ])('rejects %j', (input, error) => {
    expect(validateRegistration(input)).toEqual({ ok: false, error });
  });
});
```

Run: `npx jest src/lib/__tests__/validate-registration.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 2: Implement `src/lib/validate-registration.ts`**

```ts
export interface RegistrationInput {
  email: string;
  name: string;
  password: string;
}

export type RegistrationValidation =
  | { ok: true; value: RegistrationInput }
  | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateRegistration(body: unknown): RegistrationValidation {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid request body' };
  }
  const data = body as Record<string, unknown>;

  const email =
    typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
  if (!email || !EMAIL_RE.test(email)) {
    return { ok: false, error: 'A valid email is required' };
  }

  const name = typeof data.name === 'string' ? data.name.trim() : '';
  if (!name) {
    return { ok: false, error: 'Name is required' };
  }

  const password = typeof data.password === 'string' ? data.password : '';
  if (password.length < 8) {
    return { ok: false, error: 'Password must be at least 8 characters' };
  }

  return { ok: true, value: { email, name, password } };
}
```

Run: `npx jest src/lib/__tests__/validate-registration.test.ts` — Expected: PASS.

- [ ] **Step 3: Create `src/app/api/auth/register/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { validateRegistration } from '@/lib/validate-registration';

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const result = validateRegistration(body);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const { email, name, password } = result.value;
  const passwordHash = await bcrypt.hash(password, 12);

  try {
    const user = await prisma.user.create({
      data: { email, name, passwordHash },
      select: { id: true, email: true, name: true },
    });
    return NextResponse.json(user, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return NextResponse.json(
        { error: 'An account with this email already exists — log in instead.' },
        { status: 409 }
      );
    }
    throw err;
  }
}
```

- [ ] **Step 4: Create `src/app/register/page.tsx`** (client form posting to the route)

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const form = new FormData(e.currentTarget);
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: form.get('email'),
        name: form.get('name'),
        password: form.get('password'),
      }),
    });
    if (res.ok) {
      router.push('/login?registered=1');
      return;
    }
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    setError(data?.error ?? 'Something went wrong. Please try again.');
    setSubmitting(false);
  }

  const inputClass =
    'block w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-slate-100 placeholder:text-slate-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/40 transition-colors';

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#080c14]">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-700/60 rounded-2xl shadow-2xl shadow-black/60 p-8 flex flex-col gap-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-slate-50">Create account</h1>
          <div className="mt-2 mx-auto w-10 h-0.5 bg-amber-400 rounded-full" />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="name" className="text-sm text-slate-400">Name</label>
            <input id="name" name="name" type="text" required autoFocus className={inputClass} placeholder="Your name" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm text-slate-400">Email</label>
            <input id="email" name="email" type="email" required className={inputClass} placeholder="you@example.com" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm text-slate-400">Password</label>
            <input id="password" name="password" type="password" required minLength={8} className={inputClass} placeholder="At least 8 characters" />
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-950/40 border border-red-800/50 rounded-lg p-3">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-amber-400 py-3 text-sm font-semibold text-slate-900 hover:bg-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 focus:ring-offset-slate-900 transition-colors disabled:opacity-60"
          >
            {submitting ? 'Creating…' : 'Create account'}
          </button>
        </form>

        <p className="text-center text-sm text-slate-400">
          Already have an account?{' '}
          <Link href="/login" className="text-amber-400 hover:text-amber-300">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run tests and commit**

```bash
npx jest src/lib/__tests__/validate-registration.test.ts
git add src/lib/validate-registration.ts src/app/api/auth/register src/app/register src/lib/__tests__/validate-registration.test.ts
git commit -m "feat: registration endpoint and page"
```

---

### Task 5: Scope recipe routes per user

**Files:**
- Modify: `src/app/api/recipes/route.ts`
- Modify: `src/app/api/recipes/[id]/route.ts`
- Modify: `src/app/api/recipes/parse/route.ts`

**Interfaces:**
- Consumes: `getSessionUserId()` from `@/lib/session` (Task 3).
- Produces: all recipe reads/writes constrained to the caller; cross-user access → 404; unauthenticated → 401 `{ error: 'Unauthorized' }`.

Every handler starts with this gate (exact code, reused across Tasks 5–7):

```ts
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
```

- [ ] **Step 1: `src/app/api/recipes/route.ts`**

Add import: `import { getSessionUserId } from '@/lib/session';`

GET — add the gate at the top, then change the query to:

```ts
  let recipes = await prisma.recipe.findMany({
    where: { userId },
    include: { tags: { include: { tag: true } } },
    orderBy: { createdAt: 'desc' },
  });
```

POST — add the gate at the top, then in `prisma.recipe.create` add `userId,` as the first property of `data: {`.

- [ ] **Step 2: `src/app/api/recipes/[id]/route.ts`**

Add import: `import { getSessionUserId } from '@/lib/session';`

GET — add the gate, then replace `findUnique({ where: { id }, ...})` with:

```ts
  const recipe = await prisma.recipe.findFirst({
    where: { id, userId },
    include: {
      tags: { include: { tag: true } },
      forkedFrom: { select: { id: true, title: true } },
    },
  });
```

PUT — add the gate, then inside the transaction, FIRST verify ownership (before the tag replacement):

```ts
    const recipe = await prisma.$transaction(async (tx) => {
      const existing = await tx.recipe.findFirst({ where: { id, userId }, select: { id: true } });
      if (!existing) {
        throw new Prisma.PrismaClientKnownRequestError('Not found', {
          code: 'P2025',
          clientVersion: 'ownership-check',
        });
      }
      // ...existing tag-replacement + update code unchanged...
```

(The existing `catch` for `P2025` already returns 404.)

DELETE — add the gate, then replace the delete with an ownership-scoped delete:

```ts
  const deleted = await prisma.recipe.deleteMany({ where: { id, userId } });
  if (deleted.count === 0) {
    return NextResponse.json({ error: 'Recipe not found' }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
```

(Remove the now-unneeded try/catch and `Prisma` import if unused elsewhere in the file — it is still used by PUT.)

- [ ] **Step 3: `src/app/api/recipes/parse/route.ts`**

Add import and the gate at the top of `POST` (parse returns a transient parse result, not stored data — the gate alone is sufficient).

- [ ] **Step 4: Verify and commit**

```bash
npx jest   # existing suites still pass (they don't import routes)
git add src/app/api/recipes
git commit -m "feat: scope recipe routes to session user"
```

---

### Task 6: Scope meal-plan routes per user

**Files:**
- Modify: `src/app/api/meal-plan/route.ts`
- Modify: `src/app/api/meal-plan/[id]/entry/route.ts`
- Modify: `src/app/api/meal-plan/[id]/auto-fill/route.ts`

**Interfaces:**
- Consumes: `getSessionUserId()`; composite unique accessor `userId_weekStartDate` (Task 1).

- [ ] **Step 1: `src/app/api/meal-plan/route.ts`**

Add import + gate, then change the upsert to the composite key:

```ts
  const mealPlan = await prisma.mealPlan.upsert({
    where: { userId_weekStartDate: { userId, weekStartDate: weekStart } },
    create: {
      userId,
      weekStartDate: weekStart,
      entries: {
        create: Array.from({ length: 7 }, (_, i) => ({ dayOfWeek: i })),
      },
    },
    update: {},
    include: { /* unchanged */ },
  });
```

- [ ] **Step 2: `src/app/api/meal-plan/[id]/entry/route.ts`**

Add import + gate, then scope both existence checks:

```ts
  // Validate recipe exists (and belongs to the caller) when recipeId is provided
  if (recipeId !== null) {
    const recipe = await prisma.recipe.findFirst({ where: { id: recipeId, userId } });
    if (!recipe) {
      return NextResponse.json({ error: 'Recipe not found' }, { status: 404 });
    }
  }

  // Check meal plan exists and belongs to the caller
  const mealPlan = await prisma.mealPlan.findFirst({ where: { id, userId } });
  if (!mealPlan) {
    return NextResponse.json({ error: 'Meal plan not found' }, { status: 404 });
  }
```

- [ ] **Step 3: `src/app/api/meal-plan/[id]/auto-fill/route.ts`**

Add import + gate, then:

- `prisma.mealPlan.findUnique({ where: { id }, ...` → `prisma.mealPlan.findFirst({ where: { id, userId }, ...` (both the initial load AND the final re-fetch at the bottom of the handler).
- Library fetch scopes to the caller: `prisma.recipe.findMany({ where: { userId }, select: { ... } })`.

- [ ] **Step 4: Verify and commit**

```bash
npx jest
git add src/app/api/meal-plan
git commit -m "feat: scope meal-plan routes to session user"
```

---

### Task 7: Scope grocery-list routes per user

**Files:**
- Modify: `src/app/api/grocery-list/route.ts`
- Modify: `src/app/api/grocery-list/[id]/route.ts`
- Modify: `src/app/api/grocery-list/[id]/items/route.ts`
- Modify: `src/app/api/grocery-list/[id]/items/[itemId]/route.ts`

**Interfaces:**
- Consumes: `getSessionUserId()`. Ownership derives from `groceryList.mealPlan.userId` — grocery models have no `userId` column.

- [ ] **Step 1: `src/app/api/grocery-list/route.ts`** (generate)

Add import + gate, then scope the meal-plan lookup:

```ts
  const mealPlan = await prisma.mealPlan.findFirst({
    where: { id: mealPlanId, userId },
    include: {
      entries: { include: { recipe: true } },
      groceryList: true,
    },
  });
```

- [ ] **Step 2: `src/app/api/grocery-list/[id]/route.ts`** (get one)

Add import + gate, then:

```ts
  const groceryList = await prisma.groceryList.findFirst({
    where: { id, mealPlan: { userId } },
    include: { items: { orderBy: [{ category: 'asc' }, { name: 'asc' }] } },
  });
```

- [ ] **Step 3: `src/app/api/grocery-list/[id]/items/route.ts`** (add manual item)

Add import + gate, then:

```ts
  const groceryList = await prisma.groceryList.findFirst({
    where: { id, mealPlan: { userId } },
  });
```

- [ ] **Step 4: `src/app/api/grocery-list/[id]/items/[itemId]/route.ts`** (toggle/delete)

Add import + gate to BOTH handlers, then in both replace the item lookup with the relation-scoped version (an item id alone must never authorize access):

```ts
  const item = await prisma.groceryItem.findFirst({
    where: { id: itemId, groceryList: { id, mealPlan: { userId } } },
  });
```

- [ ] **Step 5: Verify and commit**

```bash
npx jest
git add src/app/api/grocery-list
git commit -m "feat: scope grocery-list routes to session user"
```

---

### Task 8: IMAP importer targets the household account

**Files:**
- Modify: `src/lib/imap-poller.ts` (the `prisma.recipe.create` near line 60, plus a user lookup at the top of `pollEmailForRecipes`)

**Interfaces:**
- Consumes: env `IMPORT_USER_EMAIL` (fallback `HOUSEHOLD_EMAIL`); `prisma.user.findUnique`.
- Produces: imported recipes carry the resolved user's `userId`; a missing/unknown import user aborts the poll with an error entry (no unowned writes).

- [ ] **Step 1: Resolve the import user at the top of `pollEmailForRecipes`**

Read the file first. After the existing IMAP_USER/IMAP_PASSWORD guard, add:

```ts
  const importEmail = (process.env.IMPORT_USER_EMAIL ?? process.env.HOUSEHOLD_EMAIL ?? '')
    .trim()
    .toLowerCase();
  const importUser = importEmail
    ? await prisma.user.findUnique({ where: { email: importEmail } })
    : null;
  if (!importUser) {
    return {
      processed: 0,
      errors: ['Email import: IMPORT_USER_EMAIL / HOUSEHOLD_EMAIL is not set or does not match a user'],
    };
  }
```

(Match the function's actual return shape — adjust field names to what the existing code returns.)

- [ ] **Step 2: Stamp ownership on the create**

In the `prisma.recipe.create({ data: { ... } })` call, add `userId: importUser.id,` as the first data property.

- [ ] **Step 3: Type-check gate is now restorable — run it**

```bash
npm run type-check
```

Expected: PASS (all `create`/query call sites now satisfy the new schema). If anything else fails, it is a missed call site — fix it with the same scoping pattern before committing.

- [ ] **Step 4: Commit**

```bash
npx jest
git add src/lib/imap-poller.ts
git commit -m "feat: email importer writes into the configured household account"
```

---

### Task 9: Migration gate script + full verification

**Files:**
- Create: `scripts/verify-phase1-migration.sh`

**Interfaces:**
- Consumes: latest `backups/*.dump`, Tasks 1–2 artifacts.
- Produces: a repeatable pre-deploy gate; exits non-zero on any failed assertion.

- [ ] **Step 1: Write `scripts/verify-phase1-migration.sh`**

```bash
#!/bin/sh
# Pre-deploy gate: proves the Phase 1 migration + seed are lossless against a
# restore of the latest production dump. Run from the repo root.
set -eu

DUMP=$(ls -t backups/*.dump | head -1)
echo "Using dump: $DUMP"

docker rm -f phase1-gate >/dev/null 2>&1 || true
docker run -d --rm --name phase1-gate -p 15433:5432 \
  -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=test postgres:16-alpine >/dev/null
trap 'docker stop phase1-gate >/dev/null' EXIT
sleep 4

export DATABASE_URL=postgresql://test:test@localhost:15433/test

docker exec -i phase1-gate pg_restore -U test -d test --no-owner --no-privileges < "$DUMP"

BEFORE_RECIPES=$(docker exec phase1-gate psql -U test -d test -tAc 'SELECT count(*) FROM "Recipe";')
BEFORE_PLANS=$(docker exec phase1-gate psql -U test -d test -tAc 'SELECT count(*) FROM "MealPlan";')

# Dumps taken before the Phase 0 baseline lack _prisma_migrations; newer dumps
# already record 0_init — tolerate both.
npx prisma migrate resolve --applied 0_init || true
npx prisma migrate deploy

HOUSEHOLD_EMAIL=gate-test@example.com \
HOUSEHOLD_PASSWORD_HASH='$2b$12$abcdefghijklmnopqrstuv' \
  node scripts/seed-household.mjs

assert() {
  desc=$1; expected=$2; actual=$3
  if [ "$expected" = "$actual" ]; then echo "PASS: $desc"; else echo "FAIL: $desc (expected $expected, got $actual)"; exit 1; fi
}

assert "recipes preserved" "$BEFORE_RECIPES" \
  "$(docker exec phase1-gate psql -U test -d test -tAc 'SELECT count(*) FROM "Recipe";')"
assert "meal plans preserved" "$BEFORE_PLANS" \
  "$(docker exec phase1-gate psql -U test -d test -tAc 'SELECT count(*) FROM "MealPlan";')"
assert "all recipes owned by household" "$BEFORE_RECIPES" \
  "$(docker exec phase1-gate psql -U test -d test -tAc "SELECT count(*) FROM \"Recipe\" WHERE \"userId\" = 'household-user';")"
assert "all plans owned by household" "$BEFORE_PLANS" \
  "$(docker exec phase1-gate psql -U test -d test -tAc "SELECT count(*) FROM \"MealPlan\" WHERE \"userId\" = 'household-user';")"
assert "household email seeded" "gate-test@example.com" \
  "$(docker exec phase1-gate psql -U test -d test -tAc "SELECT email FROM \"User\" WHERE id = 'household-user';")"
assert "no schema drift" "0" \
  "$(npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code >/dev/null 2>&1; echo $?)"

echo "All migration-gate assertions passed."
```

- [ ] **Step 2: Make it executable and run it**

```bash
chmod +x scripts/verify-phase1-migration.sh
./scripts/verify-phase1-migration.sh
```

Expected: six `PASS:` lines and `All migration-gate assertions passed.`

- [ ] **Step 3: Full local gates**

```bash
npm run type-check   # PASS
npm test             # PASS (existing 48 + new suites)
docker compose build app   # image builds (includes scripts/ copy from Task 2)
```

- [ ] **Step 4: Commit**

```bash
git add scripts/verify-phase1-migration.sh
git commit -m "test: migration gate script proving lossless Phase 1 upgrade"
```

---

### Task 10: End-to-end smoke on a throwaway stack (NOT the live one)

No file changes — a verification checklist against a temporary stack with a **copy** of production data. This never touches the live DB or the live compose project.

- [ ] **Step 1: Boot a throwaway stack from the freshly built image**

```bash
docker run -d --rm --name phase1-e2e-db \
  -e POSTGRES_USER=mealplanner -e POSTGRES_PASSWORD=mealplanner -e POSTGRES_DB=mealplanner \
  postgres:16-alpine
sleep 4
LATEST_DUMP=$(ls -t backups/*.dump | head -1)
docker exec -i phase1-e2e-db pg_restore -U mealplanner -d mealplanner --no-owner --no-privileges < "$LATEST_DUMP"
# Baseline the restored copy, then boot the app against it on port 3100:
docker run -d --rm --name phase1-e2e-app -p 3100:3000 \
  --link phase1-e2e-db:db \
  -e DATABASE_URL=postgresql://mealplanner:mealplanner@db:5432/mealplanner \
  -e AUTH_SECRET=e2e-test-secret \
  -e HOUSEHOLD_EMAIL=james.varga@icloud.com \
  -e HOUSEHOLD_PASSWORD_HASH="$(grep '^HOUSEHOLD_PASSWORD_HASH=' .env | cut -d= -f2-)" \
  recipe_mealplanner-app sh -c "npx prisma migrate resolve --applied 0_init || true; ./docker-entrypoint.sh"
sleep 8
docker logs phase1-e2e-app | tail -20
```

Expected log lines: migrations applied (including `20260709000000_add_users`), `seed-household: configured household user as james.varga@icloud.com`, Next.js started.

- [ ] **Step 2: Smoke checks via curl**

```bash
# Unauthenticated API access → 401
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3100/api/recipes   # expect 401 (or 307 redirect from middleware)
# Register a second user → 201
curl -s -X POST http://localhost:3100/api/auth/register -H 'Content-Type: application/json' \
  -d '{"email":"other@example.com","name":"Other","password":"password123"}' -w '\n%{http_code}\n'
# Duplicate household email → 409 with the log-in-instead message
curl -s -X POST http://localhost:3100/api/auth/register -H 'Content-Type: application/json' \
  -d '{"email":"james.varga@icloud.com","name":"Dup","password":"password123"}' -w '\n%{http_code}\n'
```

- [ ] **Step 3: Browser checks** (http://localhost:3100)

- Log in as `james.varga@icloud.com` + current household password → all 33+ recipes visible; meal plan and grocery list load.
- Log out (or private window), log in as `other@example.com` → empty library; recipes created here do NOT appear for the household user and vice versa.
- Fetch a household recipe id as `other@example.com` via `/api/recipes/<id>` → 404.

- [ ] **Step 4: Tear down**

```bash
docker stop phase1-e2e-app phase1-e2e-db
```

- [ ] **Step 5: Push the branch**

```bash
git push
```

**STOP — live deploy requires the owner's go-ahead.** Deploy checklist (owner-gated):

1. Add `HOUSEHOLD_EMAIL=james.varga@icloud.com` to `.env` (keep `HOUSEHOLD_PASSWORD_HASH`).
2. `docker exec recipe_mealplanner-db-1 pg_dump -U mealplanner -d mealplanner --format=custom > backups/pre-phase-1-$(date +%F).dump`
3. `docker compose build app && docker compose up -d`
4. Verify: family logs in with email + same password; recipes/plans/grocery lists intact.
5. Rollback if needed: `git checkout <pre-phase-1 commit> -- . && docker compose build app && docker compose up -d`, then restore the dump.
