import { ejecutar, sql } from "./src/lib/db/mysql.server";
const run = async (q:string)=>{try{await ejecutar(q);console.log("OK",q.slice(0,60));}catch(e){console.log("ERR",q.slice(0,60),String(e).slice(0,200));}};
await run("ALTER TABLE audit ADD COLUMN `changes` LONGTEXT NULL COMMENT 'Cambios realizados (antes/despues)' AFTER `accion`");
await run("ALTER TABLE audit ADD COLUMN `app` VARCHAR(10) NULL COMMENT 'Origen: WEB / DESKTOP' AFTER `version`");
console.log(JSON.stringify(await sql("SHOW COLUMNS FROM audit")));
process.exit(0);
