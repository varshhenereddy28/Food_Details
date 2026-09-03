import fs from 'node:fs/promises';
import { pool } from './db.js';

const migrations = ['000_extensions.sql', '001_init.sql'];
for (const migration of migrations) {
  const sql = await fs.readFile(new URL(`../migrations/${migration}`, import.meta.url), 'utf8');
  await pool.query(sql);
  console.log(`Applied ${migration}`);
}
await pool.end();