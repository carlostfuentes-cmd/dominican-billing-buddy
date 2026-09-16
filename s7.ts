import { sql as query } from "./src/lib/db/mysql.server";
const r = await query("SELECT menu_id,name,level,url,application_id,status FROM menues WHERE application_id IN (0,1,9,32) ORDER BY application_id,menu_id") as any[];
console.log(r.filter(x=>typeof x.menu_id==="string").map(x=>`${x.application_id} ${x.menu_id} L${x.level} ${x.status} | ${x.name} | ${x.url??''}`).join("\n"));
process.exit(0);
