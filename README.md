# Recipe & Meal Planner

A self-hosted meal planning app with recipe import, AI-powered suggestions, and email-based recipe capture. Built with Next.js, Prisma, and PostgreSQL.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/) (v2+)
- An Anthropic API key (for AI meal plan suggestions)
- Optional: an IMAP email account for automatic recipe capture from forwarded emails

## Setup

### 1. Configure environment variables

Copy the example env file and fill in your values:

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

The app uses a single shared household password. Generate a bcrypt hash of your chosen password:

```bash
node -e "const b = require('bcryptjs'); b.hash('your-password', 10).then(h => console.log(h))"
```

Paste the output as `HOUSEHOLD_PASSWORD_HASH` in your `.env` file.

### 3. Run with Docker Compose

```bash
docker compose up --build -d
```

This will:
- Build the Next.js app image
- Start a PostgreSQL 16 database
- Run any pending database migrations automatically
- Start the app on port 3000

### 4. Access the app

Open [http://localhost:3000](http://localhost:3000) in your browser.

If running on a home server, replace `localhost` with the server's local IP address, e.g. `http://192.168.1.100:3000`.

### 5. Stopping the app

```bash
docker compose down
```

To also remove the database volume (all data will be lost):

```bash
docker compose down -v
```

## Email Recipe Poller

The app can capture recipes from emails forwarded to a designated inbox. The poller is not a persistent daemon — it is designed to be run periodically via cron.

### Cron setup example

Add an entry to your crontab (`crontab -e`) to poll every 15 minutes:

```cron
*/15 * * * * docker compose -f /path/to/app/docker-compose.yml exec -T app node scripts/poll-email.js >> /var/log/recipe-poller.log 2>&1
```

Or if running the poller as a separate script on the host:

```cron
*/15 * * * * cd /path/to/app && node scripts/poll-email.js >> /var/log/recipe-poller.log 2>&1
```

Set the following variables in `.env` to enable email polling:

```env
IMAP_HOST=imap.example.com
IMAP_PORT=993
IMAP_USER=recipes@example.com
IMAP_PASSWORD=your-imap-password
IMAP_MAILBOX=INBOX
```

## Development Setup

To run locally against a development database:

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

### 2. Configure your local `.env`

```env
DATABASE_URL=postgresql://mealplanner:mealplanner@localhost:5432/mealplanner
```

### 3. Apply migrations and generate the Prisma client

```bash
npx prisma migrate dev
npx prisma generate
```

### 4. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
src/
  app/          # Next.js App Router pages and API routes
  components/   # React components
  lib/          # Shared utilities (db, auth, AI client, etc.)
prisma/
  schema.prisma # Database schema
  migrations/   # Applied migration files
scripts/        # Standalone scripts (email poller, etc.)
```

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Database:** PostgreSQL 16 via Prisma ORM
- **Auth:** NextAuth.js v5
- **AI:** Anthropic Claude API
- **Email:** ImapFlow
- **Styling:** Tailwind CSS v4
