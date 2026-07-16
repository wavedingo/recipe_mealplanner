#!/bin/sh
set -e

echo "Applying database migrations..."
npx prisma migrate deploy

echo "Seeding household user (idempotent)..."
node scripts/seed-household.mjs

echo "Starting Next.js app..."
exec node server.js
