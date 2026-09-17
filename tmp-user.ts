import { guardarUsuario } from "./src/lib/db/usuarios.server";
console.log(await guardarUsuario({login:"zz_prueba",nombre:"Prueba",apellido:"Auditoria",perfil_id:1,activo:true,supervisor:false,descuento_maximo:0,clave:"Prueba1234"}));
process.exit(0);
