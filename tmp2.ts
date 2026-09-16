import { sql } from "./src/lib/db/mysql.server";
const p = async (l:string,q:string,a:unknown[]=[])=>{try{console.log("== "+l, JSON.stringify(await sql<any>(q,a),null,1));}catch(e){console.log("ERR "+l,String(e));}};
await p("cols products group", `SHOW COLUMNS FROM products LIKE '%group%'`);
await p("propositos", `SELECT name, COUNT(*) n FROM inventory_groups_accounts GROUP BY name ORDER BY n DESC`);
await p("grupos con cuentas", `SELECT COUNT(DISTINCT inventory_group_id) g FROM inventory_groups_accounts`);
await p("gl_catalog cols", `SHOW COLUMNS FROM gl_catalog`);
await p("ejemplo grupo 0", `SELECT * FROM inventory_groups_accounts WHERE inventory_group_id='0'`);
process.exit(0);
