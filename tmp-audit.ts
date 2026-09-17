import { sql } from "./src/lib/db/mysql.server";
const p = async (l:string,q:string)=>{try{console.log("== "+l, JSON.stringify(await sql<any>(q),null,1));}catch(e){console.log("ERR "+l,String(e));}};
await p("create audit", `SHOW CREATE TABLE audit`);
await p("count", `SELECT COUNT(*) c, MIN(date) mn, MAX(date) mx FROM audit`);
await p("rows", `SELECT * FROM audit ORDER BY 1 DESC LIMIT 10`);
await p("tablas audit", `SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE() AND (table_name LIKE '%audit%' OR table_name LIKE '%log%' OR table_name LIKE '%bitacor%')`);
process.exit(0);
