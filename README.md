# Recipe & Meal Planner

A self-hosted household meal planning app with recipe import, weekly meal planning, and grocery list generation. Built with Next.js, Prisma, and PostgreSQL.

## Features

- **Recipe Library** — browse, search, and filter recipes by tag
- **Recipe Import** — three ways to add recipes:
  - Parse from a URL (AI-powered extraction with JSON-LD/microdata fallback)
  - Paste & Parse — paste raw recipe text, Claude extracts the structured data
  - Manual entry
- **Email Capture** — forward recipes to a designated inbox; a cron-run poller imports them automatically
- **Meal Plan** — assign recipes to any day of the week; navigate between weeks
- **Grocery List** — generate a smart list from the week's meal plan:
  - Ingredients aggregated and unit-converted across recipes (e.g. 1 cup + 2 Tbsp = 1.13 cups)
  - Descriptor normalization merges variants ("finely diced carrot" + "pound carrots" → "Carrot")
  - Volume and mass measurements for the same ingredient are merged into one row
  - Items grouped by category (Produce, Dairy, Meat, Pantry, Other)
  - Check items off as you shop; manually add extras
  - Copy the full list to clipboard as plain text
  - Past week lists are preserved for reference; regeneration is limited to current and next week

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/) (v2+)
- An Anthropic API key (used for recipe parsing and Paste & Parse)
- Optional: an IMAP email account for automatic recipe capture

## Setup

### 1. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and set at minimum:

```env
DATABASE_URL=postgresql://mealplanner:mealplanner@db:5432/mealplanner
AUTH_SECRET=<random secret, generate with: openssl rand -base64 32>
HOUSEHOLD_PASSWORD_HASH=<bcrypt hash of your household password>
ANTHROPIC_API_KEY=<your Anthropic API key>
```

### 2. Generate a household password hash

The app uses a single shared household password. Generate a bcrypt hash:

```bash
node -e "const b = require('bcryptjs'); b.hash('your-password', 10).then(h => console.log(h))"
```

Paste the output (60 characters, starts with `$2b$`) as `HOUSEHOLD_PASSWORD_HASH` in `.env`. Use **single quotes** to prevent shell expansion of `$`:

```env
HOUSEHOLD_PASSWORD_HASH='$2b$10$...'
```

### 3. Run with Docker Compose

```bash
docker compose up --build -d
```

This will:
- Build the Next.js app image
- Start a PostgreSQL 16 database
- Apply the schema automatically (`prisma db push`)
- Start the app on port 3000

### 4. Access the app

Open [http://localhost:3000](http://localhost:3000). If running on a home server, use its local IP, e.g. `http://192.168.1.100:3000`.

### 5. Stopping the app

```bash
docker compose down
```

To also remove the database volume (all data will be lost):

```bash
docker compose down -v
```

## Recipe Import Notes

### URL Parsing

The app fetches the page and attempts to extract structured recipe data (JSON-LD → microdata → Claude fallback). Some sites return 403 errors to automated requests. Known workaround: **enabling a VPN (e.g. Tailscale) resolves 403 errors on sites like Food Network**. For sites that still block, use Paste & Parse instead.

### Paste & Parse

Copy the full text of a recipe page and paste it into the "Paste & Parse" tab. Claude extracts the title, ingredients, steps, servings, and cook time.

### Email Capture

Forward recipe emails to your configured IMAP inbox. The poller detects recipe URLs or content in the email body and imports them.

## Email Recipe Poller

The poller is designed to run periodically via cron. Add to your crontab (`crontab -e`):

```cron
*/15 * * * * docker compose -f /path/to/app/docker-compose.yml exec -T app node scripts/poll-email.js >> /var/log/recipe-poller.log 2>&1
```

Set the following in `.env`:

```env
IMAP_HOST=imap.example.com
IMAP_PORT=993
IMAP_USER=recipes@example.com
IMAP_PASSWORD=your-imap-password
IMAP_MAILBOX=INBOX
```

## Development

### 1. Start a local PostgreSQL instance

```bash
docker run -d \
  --name mealplanner-dev-db \
  -e POSTGRES_USER=mealplanner \
  -e POSTGRES_PASSWORD=mealplanner \
  -e POSTGRES_DB=mealplanner \
  -p 5432:5432 \
  postgres:16-alpine
```

### 2. Configure local `.env`

```env
DATABASE_URL=postgresql://mealplanner:mealplanner@localhost:5432/mealplanner
```

### 3. Apply schema and generate the Prisma client

```bash
npx prisma db push
npx prisma generate
```

### 4. Start the dev server

```bash
npm run dev
```

### Other commands

```bash
npm test           # Jest (48 tests)
npm run type-check # tsc --noEmit
npm run build      # Production build
```

## Project Structure

```
src/
  app/                    # Next.js App Router pages and API routes
    api/
      grocery-list/       # Grocery list CRUD + generation
      meal-plan/          # Meal plan get-or-create, entry assignment
      recipes/            # Recipe CRUD + AI parsing endpoint
    grocery-list/         # Grocery list page
    meal-plan/            # Weekly meal plan page
    recipes/              # Recipe library + detail pages
  lib/
    auth.ts               # NextAuth v5 Credentials provider
    db.ts                 # Prisma client singleton (Prisma 7 + pg adapter)
    ingredient-aggregator.ts  # Unit conversion and ingredient grouping
    imap-poller.ts        # Email polling via imapflow
    recipe-parser.ts      # JSON-LD / microdata / Claude extraction
    recipe-utils.ts       # Shared ingredient/step parsers
  types/
    index.ts              # Ingredient, RecipeStep, ParsedRecipe interfaces
prisma/
  schema.prisma           # 7 models: Recipe, Tag, MealPlan, MealPlanEntry, GroceryList, GroceryItem, RecipeTag
  config.ts               # Prisma 7 connection config
scripts/                  # Standalone scripts (email poller)
```

## Tech Stack

- **Framework:** Next.js 16 (App Router), TypeScript
- **Database:** PostgreSQL 16 via Prisma 7 (with `@prisma/adapter-pg`)
- **Auth:** NextAuth.js v5 beta — single shared household password
- **AI:** Anthropic Claude (`claude-sonnet-4-6`) — recipe parsing and Paste & Parse
- **Email:** imapflow — IMAP polling
- **Unit conversion:** convert-units
- **Styling:** Tailwind CSS v4
- **Deployment:** Docker Compose (Next.js standalone output)

## Notable Implementation Details

- **Prisma 7**: No `url` in `schema.prisma` — connection string lives in `prisma.config.ts`. Requires `@prisma/adapter-pg` driver adapter.
- **No migration files**: Uses `prisma db push` in the Docker entrypoint since there's no live DB to generate migration history against.
- **`HOUSEHOLD_PASSWORD_HASH`**: Must use single quotes in `.env` to prevent `$` expansion.
- **`bcryptjs` and `imapflow`**: Listed in `serverExternalPackages` in `next.config.ts` to prevent bundling issues.
- **Auth route**: Requires `export const runtime = 'nodejs'` for `process.env` access in the NextAuth Credentials provider.
