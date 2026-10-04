import 'dotenv/config';
import fs from 'node:fs/promises';
import { pool } from './db.js';

const sql = await fs.readFile(new URL('../sql/schema.sql', import.meta.url), 'utf8');
await pool.query(sql);
console.log('Database initialized.');
await pool.end();
