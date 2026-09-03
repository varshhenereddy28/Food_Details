import { query, pool } from './db.js';
await query("INSERT INTO users(phone_number) VALUES('+10000000000') ON CONFLICT DO NOTHING");
const user = await query("SELECT id FROM users WHERE phone_number='+10000000000'");
for (const [name, days] of [['Yogurt',7],['Spinach',15],['Rice',-2]]) await query("INSERT INTO products(user_id,name,category,quantity,unit,exp_date,source) VALUES($1,$2,'sample',1,'item',CURRENT_DATE + $3,'manual')",[user.rows[0].id,name,days]);
await pool.end();
