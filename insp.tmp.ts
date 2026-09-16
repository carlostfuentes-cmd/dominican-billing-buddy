import { sql } from "./src/lib/db/mysql.server";
const cols = await sql<any>("SHOW COLUMNS FROM inventory_operations");
console.log(cols.map((c:any)=>`${c.Field} ${c.Type}`).join("\n"));
console.log("---rows---");
console.log(JSON.stringify(await sql<any>("SELECT * FROM inventory_operations WHERE COALESCE(source_app,'')='INV'"),null,1));
console.log("---source_doc samples---");
console.log(JSON.stringify(await sql<any>("SELECT inventory_op_id, source_doc, COUNT(*) n FROM inventory GROUP BY inventory_op_id, source_doc ORDER BY inventory_op_id, n DESC LIMIT 40")));
