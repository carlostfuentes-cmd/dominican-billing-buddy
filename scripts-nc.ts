import { sql } from "./src/lib/db/mysql.server";
const p = (t:string,r:unknown)=>console.log("\n=== "+t+"\n"+JSON.stringify(r,null,1));
p("ar_kinds", await sql("SELECT ar_kind_id,name,kind,ncf FROM ar_kinds ORDER BY ar_kind_id"));
p("inv_ops", await sql("SELECT inventory_op_id,name,type,source_app,adicional FROM inventory_operations ORDER BY inventory_op_id"));
p("reverse_invoices cols", await sql("SHOW COLUMNS FROM reverse_invoices"));
p("motivos", await sql("SELECT * FROM reverse_invoices_motives"));
p("muestra", await sql("SELECT reverse_invoice_id,date,invoice_id,apply_to,ncf_doc,posted,open_ri,authorized FROM reverse_invoices ORDER BY reverse_invoice_id DESC LIMIT 5"));
process.exit(0);
