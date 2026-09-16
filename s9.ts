import { sql as query } from "./src/lib/db/mysql.server";
const r = await query("SELECT menu_id,name,url,level,status FROM menues WHERE application_id=51 ORDER BY menu_id") as any[];
console.log(r.map(x=>`${x.menu_id} L${x.level} ${x.status} | ${x.name} | ${x.url??''}`).join("\n"));
process.exit(0);
