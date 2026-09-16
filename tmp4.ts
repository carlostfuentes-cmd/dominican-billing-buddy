import { sql } from "./src/lib/db/mysql.server";
const p = async (l:string,q:string)=>{try{console.log("== "+l, JSON.stringify(await sql<any>(q),null,1));}catch(e){console.log("ERR "+l,String(e));}};
await p("customers cuentas", `SHOW COLUMNS FROM customers WHERE Field LIKE '%account%' OR Field LIKE '%class%'`);
await p("ar_classes", `SELECT * FROM ar_classes LIMIT 10`);
await p("cols ar_classes", `SHOW COLUMNS FROM ar_classes`);
await p("gl_accounts vs catalog", `SELECT (SELECT COUNT(*) FROM gl_accounts) a,(SELECT COUNT(*) FROM gl_catalog) c,(SELECT COUNT(*) FROM inventory_groups_accounts g JOIN gl_accounts x ON x.account=g.catalog_account) ok, (SELECT COUNT(*) FROM inventory_groups_accounts g JOIN gl_accounts x ON x.account=g.catalog_account WHERE x.is_detail=1) det`);
process.exit(0);
