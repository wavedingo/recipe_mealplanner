# Recipe Meal Planner — Context for Architecture Review

You are being asked to advise on evolving this project from a single-household tool into a
**scalable, multi-user social recipe platform**. This document gives you full project context so
you can provide specific, grounded architectural recommendations without exploring the codebase.

---

## What This App Does Today

A self-hosted household meal planning tool with:
- **Recipe library**: import via URL (JSON-LD/microdata/Claude AI fallback), paste-and-parse,
  or manual entry. Recipes store title, description, source URL, image, servings, prep/cook times,
  ingredients (JSON), steps (JSON), tags, rating, notes.
- **Meal planner**: weekly (Mon–Sun) grid where you assign recipes to days.
- **Grocery list**: auto-generated from the week's recipes, with smart ingredient aggregation
  (unit conversion, descriptor normalization, category grouping), check-off tracking, manual items.
- **Email import**: IMAP poller that watches an inbox and auto-imports recipe URLs found in emails.
- **Authentication**: single shared household password (bcrypt hash in env var), NextAuth.js v5
  Credentials provider, JWT sessions (30-day max age).

---

## Current Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16, App Router, React 19 |
| Language | TypeScript 5 (strict) |
| Styling | Tailwind CSS 4 |
| ORM | Prisma 7 (`@prisma/adapter-pg` + raw pg Pool) |
| Database | PostgreSQL 16 |
| Auth | NextAuth.js v5 beta (Credentials provider) |
| AI | Anthropic Claude API (`claude-sonnet-4-6`) — recipe parsing fallback |
| Email | imapflow (IMAP polling) |
| Deployment | Docker Compose, multi-stage Dockerfile, standalone Next.js output |
| Testing | Jest 30 + ts-jest (48 tests, 2 files) |

---

## Current Data Model (Prisma Schema)

```prisma
model Recipe {
  id           String   @id @default(cuid())
  title        String
  description  String?
  sourceUrl    String?
  imageUrl     String?
  servings     Int?
  prepTimeMins Int?
  cookTimeMins Int?
  ingredients  Json     // Ingredient[]
  steps        Json     // RecipeStep[]
  rating       Int?     // 1–5
  notes        String?
  forkedFromId String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  tags            RecipeTag[]
  mealPlanEntries MealPlanEntry[]
  forks           Recipe[]  @relation("RecipeForks")
  forkedFrom      Recipe?   @relation("RecipeForks", fields: [forkedFromId], references: [id])
}

model Tag {
  id      String      @id @default(cuid())
  name    String      @unique
  recipes RecipeTag[]
}

model RecipeTag {
  recipeId String
  tagId    String
  recipe   Recipe @relation(fields: [recipeId], references: [id], onDelete: Cascade)
  tag      Tag    @relation(fields: [tagId], references: [id], onDelete: Cascade)
  @@id([recipeId, tagId])
}

model MealPlan {
  id            String   @id @default(cuid())
  weekStartDate DateTime @unique  // Always Monday, UTC
  createdAt     DateTime @default(now())

  entries     MealPlanEntry[]
  groceryList GroceryList?
}

model MealPlanEntry {
  id          String   @id @default(cuid())
  mealPlanId  String
  dayOfWeek   Int      // 0=Mon … 6=Sun
  recipeId    String?
  customLabel String?

  mealPlan MealPlan @relation(fields: [mealPlanId], references: [id], onDelete: Cascade)
  recipe   Recipe?  @relation(fields: [recipeId], references: [id], onDelete: SetNull)
}

model GroceryList {
  id         String   @id @default(cuid())
  mealPlanId String   @unique
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  mealPlan GroceryList @relation(fields: [mealPlanId], references: [id], onDelete: Cascade)
  items    GroceryItem[]
}

model GroceryItem {
  id            String  @id @default(cuid())
  groceryListId String
  name          String
  amount        Float?
  unit          String?
  category      String  @default("other")
  checked       Boolean @default(false)
  isManual      Boolean @default(false)

  groceryList GroceryList @relation(fields: [groceryListId], references: [id], onDelete: Cascade)
}
```

**Important note**: There is currently NO `User` model. Authentication is a single shared bcrypt
password in an environment variable. All data is shared by the household (no per-user ownership).

---

## Current API Surface

```
GET  /api/recipes                             # list (search, tag filter)
POST /api/recipes                             # create
GET  /api/recipes/[id]                        # get one
DELETE /api/recipes/[id]                      # delete
POST /api/recipes/parse                       # parse from URL or paste text (calls Claude API)

GET  /api/meal-plan?weekStart=<ISO>           # get-or-create for week (upsert)
POST /api/meal-plan/[id]/entry                # assign recipe to day slot
POST /api/meal-plan/[id]/auto-fill            # fill empty slots randomly

POST /api/grocery-list                        # generate list from meal plan
GET  /api/grocery-list/[id]                   # get list + items
PATCH /api/grocery-list/[id]/items/[itemId]   # toggle check
POST /api/grocery-list/[id]/items             # add manual item

GET  /api/cron/poll-email                     # trigger IMAP poll (external cron)
POST /api/auth/callback/credentials           # NextAuth sign-in
```

---

## Key Implementation Details

### Recipe Parsing Pipeline
1. Fetch URL → strip scripts/styles → extract JSON-LD → extract microdata → Claude API fallback
2. Claude prompt truncates HTML to 15k chars; paste text to 20k chars
3. Parsing returns a `ParsedRecipe` type that maps to the Prisma schema

### Ingredient Aggregation (Grocery List Generation)
- 60+ unit aliases (tbsp, tsp, cup, oz, lb, g, kg, ml, l, etc.)
- Unicode fraction support (½, ⅓, ¾) + slash notation (1/2)
- Mixed number parsing (1 1/2, 1.5)
- Descriptor stripping ("fresh diced carrot" → "carrot") for name normalization
- Cross-unit conversion via `convert-units` library
- Category inference via keyword matching

### Deployment
- Docker Compose: `app` (Next.js) + `db` (Postgres 16)
- Entrypoint runs `prisma db push --accept-data-loss` then `node server.js`
- No migration files — schema-first approach with `prisma db push`
- Named Docker volume for Postgres data persistence

### Current Limitations Relevant to Scaling
- **No user model**: impossible to scope data per user without schema changes
- **Schema-push only**: `prisma db push` is fine for single-dev; becomes risky with multiple
  deployments or team members modifying schema concurrently
- **All API routes run in Next.js server**: no separation between read-heavy and write-heavy paths
- **Claude API calls are synchronous**: recipe parsing blocks the HTTP response (can be 5–15s)
- **IMAP polling is a Next.js cron route**: not a real background worker
- **Images stored by URL only**: no CDN or object storage
- **Single PostgreSQL instance**: no read replicas, no connection pooling middleware
- **No rate limiting or request queuing**: Claude API costs scale directly with user count

---

## The Goal: Social Recipe Platform

The owner wants to evolve this into a **multi-user social platform** with:

### User Accounts
- Replace shared password with proper individual user accounts
- Email + password auth (and ideally OAuth: Google, GitHub)
- Per-user recipe libraries, meal plans, and grocery lists
- User profiles

### Social Features
- **Public/private recipes**: recipes default to private, can be set to public
- **Following**: users can follow other users
- **Recipe discovery**: browse/search public recipes from the community
- **Fork**: save a copy of another user's public recipe into your own library
  (the `forkedFromId` field exists but is not yet wired to a user concept)
- **Sharing**: share a recipe link with anyone (public URL)
- **Likes / bookmarks** (possibly — not yet confirmed)

### Scale Requirements
- Must handle significantly more traffic than a single household
- Multiple concurrent users browsing, parsing, and planning

---

## Questions for You

Please advise on:

1. **Data model evolution**: What changes to the Prisma schema are needed to support users,
   per-user data isolation, public/private visibility, follows, and forks? Specifically:
   - Where does a `User` model attach to the existing models?
   - How should `MealPlan` and `GroceryList` be scoped to users?
   - How to model follows (self-referential User relation)?
   - Is the current `forkedFromId` on Recipe sufficient, or should forks be tracked differently?

2. **Auth strategy**: NextAuth.js v5 Credentials is in place. What's the path to:
   - Adding per-user accounts with email/password
   - Adding OAuth providers (Google, GitHub)
   - Maintaining backward compatibility during migration

3. **Async recipe parsing**: Claude API calls currently block the HTTP response for 5–15s.
   What's the right pattern for Next.js App Router? Options considered:
   - Streaming response to the client
   - Background job queue (what technology fits this stack?)
   - Keep synchronous but add timeout + retry UX

4. **Database scaling**: Single Postgres instance today. For a social platform:
   - When/how to introduce connection pooling (PgBouncer, Prisma Accelerate)?
   - When do read replicas make sense vs. just better indexing?
   - What indexes should be added for social query patterns (feed, follower list, public recipe search)?
   - Should `ingredients` and `steps` stay as JSON columns or be normalized?

5. **Migration strategy**: The app currently uses `prisma db push` (no migration history).
   For a multi-user production app, what's the right path to Prisma Migrate, and how do we
   handle the transition safely?

6. **Infrastructure**: Currently Docker Compose on a single host. For the social platform:
   - What deployment target makes sense (Fly.io, Railway, Render, Vercel + managed DB)?
   - When does horizontal scaling of the Next.js app matter?
   - CDN/object storage for recipe images (currently just URLs)?
   - Rate limiting for Claude API calls per user

7. **Architecture shape**: Should this remain a monolithic Next.js app (API routes + UI),
   or is there a point where separating the backend API makes sense? What would trigger that
   decision?

8. **Feature prioritization**: Given the current codebase and the goals above, what order
   would you recommend tackling these changes? What are the highest-leverage first steps?
