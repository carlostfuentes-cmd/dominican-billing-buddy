
## Correo (SMTP propio) — sep 2026
- [x] Pantalla "Datos servidor de correos" en Configuración (guardada en tabla `config` por empresa)
- [x] Envío SMTP con PDF anexo a través de `puente-mysql.php` (bloque de correo agregado)
- [x] Botón "Enviar por correo" en factura/pedido, cotización, conduce y devolución
- [ ] El usuario debe volver a subir `puente-mysql.php` actualizado al servidor

## Estabilidad de conexión MariaDB — sep 2026
- [x] Agrupar lecturas simultáneas en una sola llamada HTTPS
- [x] Eliminar la consulta preliminar duplicada y reintentar solo lecturas seguras
- [x] Añadir límites de conexión/consulta y diagnóstico real en el puente
- [x] Añadir prueba visible de puente, clave y MariaDB en Configuración
- [ ] El usuario debe reemplazar una vez `puente-mysql.php` por la nueva versión

## Cotizaciones editables y scroll superior — sep 2026
- [x] Editar cotizaciones desde la lista y el detalle (/cotizaciones/nueva?editar=ID)
- [x] Guardado como edición con auditoría tipo "E" (UPDATE + líneas reemplazadas)
- [x] Barra de desplazamiento horizontal superior en cotizaciones y clientes
- [ ] Verificar en producción (el usuario debe probar con su sesión)
