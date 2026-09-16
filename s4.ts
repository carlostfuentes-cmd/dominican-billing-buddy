import { sql as query } from "./src/lib/db/mysql.server";
console.log(await query("SELECT application_id, COUNT(*) c FROM menues GROUP BY application_id"));
try{console.log(await query("SELECT * FROM applications LIMIT 30"));}catch(e){console.log((e as Error).message)}
console.log(await query("SELECT user_id, LENGTH(password) lp, LENGTH(password2) lp2, password2 FROM users WHERE user_id IN (1,3,103)"));
console.log(await query("SELECT menu_id,name,level,url,parent,icon FROM menues WHERE application_id=1 AND level=3 ORDER BY menu_id LIMIT 60"));
process.exit(0);
