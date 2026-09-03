import pg from 'pg';
const { Pool } = pg;
export const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgres://food:food@localhost:5432/food' });
export const query = (text, params) => pool.query(text, params);
