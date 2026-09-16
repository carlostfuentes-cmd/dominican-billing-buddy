import { sql } from "./src/lib/db/mysql.server";
const p = async (l:string,q:string)=>{try{console.log("== "+l, JSON.stringify(await sql<any>(q),null,1));}catch(e){console.log("ERR "+l,String(e));}};
await p("inv_ops", `SHOW CREATE TABLE inventory_operations`);
await p("ops", `SELECT * FROM inventory_operations WHERE COALESCE(source_app,'')='INV'`);
process.exit(0);
