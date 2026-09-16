import { sql as query } from "./src/lib/db/mysql.server";
const t = ["profiles","users","menues"];
for (const x of t) {
  try {
    const cols = await query(`SHOW FULL COLUMNS FROM \`${x}\``);
    console.log("==== "+x);
    for (const c of cols as any[]) console.log(` ${c.Field} | ${c.Type} | null=${c.Null} | key=${c.Key} | def=${c.Default} | ${c.Comment??''}`);
    const n = await query(`SELECT COUNT(*) c FROM \`${x}\``);
    console.log(" filas:", (n as any)[0].c);
    const s = await query(`SELECT * FROM \`${x}\` LIMIT 5`);
    console.log(JSON.stringify(s, null, 1).slice(0, 2500));
  } catch (e) { console.log("ERR "+x, (e as Error).message); }
}
const like = await query("SHOW TABLES LIKE '%user%'");
console.log("tablas user:", JSON.stringify(like));
const like2 = await query("SHOW TABLES LIKE '%men%'");
console.log("tablas men:", JSON.stringify(like2));
const like3 = await query("SHOW TABLES LIKE '%profil%'");
console.log("tablas profil:", JSON.stringify(like3));
process.exit(0);
