#!/bin/sh
set -e

echo "Running database migrations..."
npx prisma migrate deploy || {
  echo "Warning: prisma migrate deploy encountered an issue (this is expected if no migrations exist yet). Continuing..."
}

echo "Starting Next.js app..."
exec node server.js
