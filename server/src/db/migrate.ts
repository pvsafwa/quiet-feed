import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pool, closePool } from './pool';

// Applies schema.sql. Idempotent — every statement uses IF NOT EXISTS.
export async function migrate(): Promise<void> {
  const sql = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('[db] schema applied');
}

// Allow running directly: `npm run migrate`
if (require.main === module) {
  migrate()
    .then(() => closePool())
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('[db] migration failed', e);
      process.exit(1);
    });
}
