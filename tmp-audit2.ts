import { sql } from "./src/lib/db/mysql.server";
const p = async (l:string,q:string)=>{try{console.log("== "+l, JSON.stringify(await sql<any>(q),null,1));}catch(e){console.log("ERR "+l,String(e));}};
await p("menus audit", `SELECT menu_id,name,level,url,application_id FROM menues WHERE name LIKE '%AUDIT%' OR url LIKE '%audit%'`);
await p("kinds usados", `SELECT kind, COUNT(*) n FROM audit GROUP BY kind`);
await p("cols", `SHOW COLUMNS FROM audit`);
process.exit(0);
