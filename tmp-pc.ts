import { sql } from "./src/lib/db/mysql.server";
const p = async (l:string,q:string,a:unknown[]=[])=>{try{console.log("== "+l, JSON.stringify(await sql<any>(q,a),null,1).slice(0,2500));}catch(e){console.log("ERR "+l,String(e));}};
await p("petty_cash", `SELECT * FROM petty_cash`);
await p("detail", `SELECT * FROM petty_cash_detail ORDER BY ID DESC LIMIT 3`);
await p("ncf_kinds", `SELECT * FROM ncf_kinds`);
await p("expenses_kinds", `SELECT * FROM expenses_kinds`);
await p("isr", `SHOW TABLES LIKE '%isr%'`);
process.exit(0);
