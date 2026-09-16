import { sql as query } from "./src/lib/db/mysql.server";
console.log(JSON.stringify(await query("SHOW TABLES")).match(/[^"]*(?:menu|profil|user|role|permis)[^"]*/gi));
console.log(await query("SELECT user_id,login,first_name,last_name,status,profile_id,is_supervisor,companies,salesman_id,max_discount,last_login FROM users LIMIT 8"));
console.log(await query("SELECT * FROM menues WHERE application_id=1 AND level<=3 ORDER BY menu_id LIMIT 40"));
process.exit(0);
