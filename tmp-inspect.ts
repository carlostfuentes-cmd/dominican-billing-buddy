import { sql } from "./src/lib/db/mysql.server";
const show = async (t: string) => {
  try {
    const c = await sql<any>(`SHOW CREATE TABLE \`${t}\``);
    console.log("=== " + t + " ===\n" + (c[0]?.["Create Table"] ?? JSON.stringify(c[0])));
    const r = await sql<any>(`SELECT * FROM \`${t}\` LIMIT 8`);
    console.log("ROWS:", JSON.stringify(r, null, 1));
    const n = await sql<any>(`SELECT COUNT(*) c FROM \`${t}\``);
    console.log("COUNT:", n[0]?.c);
  } catch (e) { console.log("ERR " + t, String(e)); }
};
for (const t of ["inventory_groups","inventory_groups_accounts","products","gl_accounts"]) await show(t);
process.exit(0);
