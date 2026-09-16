import { sql } from "./src/lib/db/mysql.server";
console.log(JSON.stringify(await sql<any>(`SELECT (SELECT COUNT(*) FROM gl_accounts) a,(SELECT COUNT(*) FROM gl_catalog) c,(SELECT COUNT(*) FROM inventory_groups_accounts g JOIN gl_accounts x ON x.account=g.catalog_account) ok, (SELECT COUNT(*) FROM inventory_groups_accounts g JOIN gl_accounts x ON x.account=g.catalog_account WHERE x.is_detail=1) det`)));
process.exit(0);
