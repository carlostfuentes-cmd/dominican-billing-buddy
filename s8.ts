import { sql as query } from "./src/lib/db/mysql.server";
const r = await query("SELECT menu_id,name,url,application_id FROM menues WHERE name REGEXP 'iscal|omprobant|ormato|ersonaliz|mpresa|arámetro|arametro|onfigur|suario|erfil' ORDER BY menu_id") as any[];
console.log(r.map(x=>`${x.application_id} ${x.menu_id} | ${x.name} | ${x.url??''}`).join("\n"));
process.exit(0);
