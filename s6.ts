import { sql as query } from "./src/lib/db/mysql.server";
const r = await query("SELECT menu_id,name,level,url,application_id FROM menues WHERE status='A' AND url IS NOT NULL AND url<>'' ORDER BY application_id,menu_id") as any[];
console.log(r.filter(x=>typeof x.menu_id==="string").map(x=>`${x.application_id} ${x.menu_id} | ${x.name} | ${x.url}`).join("\n"));
process.exit(0);
