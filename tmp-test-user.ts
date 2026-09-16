import { createHash } from "node:crypto";
import { ejecutar, sql } from "./src/lib/db/mysql.server";

const md5 = (t: string) => createHash("md5").update(t).digest("hex");
const max = await sql<{ m: number | null }>("SELECT MAX(user_id) m FROM users");
const id = Number(max[0]?.m ?? 0) + 1;
await ejecutar(
  `INSERT INTO users (user_id, login, first_name, last_name, password, password2, policy, language, main_email, birthdate, status, is_supervisor, profile_id, max_discount, mail_html)
   VALUES (?, 'zz_prueba', 'Prueba', 'Temporal', '', ?, 0, 'SP', NULL, '1900-01-01', 'A', 0, 4, 0, 0)`,
  [id, md5("Prueba1234")],
);
console.log("creado", id);
process.exit(0);
