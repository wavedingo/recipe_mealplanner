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
