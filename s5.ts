import { sql as query } from "./src/lib/db/mysql.server";
console.log(await query("SELECT user_id, LENGTH(password) lp, LENGTH(password2) lp2 FROM users WHERE user_id IN (1,3,103)"));
process.exit(0);
