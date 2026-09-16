import { ejecutar } from "./src/lib/db/mysql.server";
await ejecutar("DELETE FROM users WHERE login = 'zz_prueba'");
console.log("eliminado");
process.exit(0);
