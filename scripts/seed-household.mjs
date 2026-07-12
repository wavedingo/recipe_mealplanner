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
