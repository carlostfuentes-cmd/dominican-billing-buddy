import { sql as query } from "./src/lib/db/mysql.server";
for (const t of ["profiles_menues","users_has_menues","companies_applications_profiles","users_web","applications"]) {
 try{
  console.log("==== "+t);
  console.log((await query(`SHOW FULL COLUMNS FROM \`${t}\``) as any[]).map(c=>`${c.Field} ${c.Type} null=${c.Null} key=${c.Key} // ${c.Comment??''}`).join("\n"));
  console.log("filas", (await query(`SELECT COUNT(*) c FROM \`${t}\``) as any)[0].c);
  console.log(await query(`SELECT * FROM \`${t}\` LIMIT 4`));
 }catch(e){console.log("ERR",t,(e as Error).message);}
}
process.exit(0);
