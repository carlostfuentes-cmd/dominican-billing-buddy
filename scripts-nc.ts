import { sql, ejecutar } from "./src/lib/db/mysql.server";
const cols = await sql<{Field:string}>("SHOW COLUMNS FROM reverse_invoices LIKE 'void'");
if (!cols.length) {
  await ejecutar("ALTER TABLE reverse_invoices ADD COLUMN `void` TINYINT(1) NOT NULL DEFAULT 0");
  console.log("columna void agregada");
} else console.log("ya existe");
console.log(await sql("SHOW COLUMNS FROM reverse_invoices LIKE 'void'"));
process.exit(0);
