
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

## Licenciamiento y multi-tenant — sep 2026
- [x] Tablas de control `licencias`, `licencia_eventos`, `licencia_instalaciones` (db/licencias-schema.sql)
- [x] Panel interno del proveedor en /licencias (alta, editar, renovar, suspender, historial, último contacto)
- [x] Endpoint firmado /api/public/licencia para que cada instalación valide su licencia
- [x] Validación con caché de 10 minutos y período de gracia de 7 días
- [x] Modo solo lectura centralizado en la capa de escritura (ejecutar)
- [x] Tope de usuarios del plan al crear un usuario
- [x] Pantalla /licencia para el administrador del cliente y avisos de vencimiento en todas las pantallas
- [ ] Definir claves Ed25519 (LICENSE_PRIVATE_KEY en el proveedor, LICENSE_PUBLIC_KEY + LICENSE_KEY + LICENSE_SERVER_URL en cada instalación)
- [ ] Fase 5: empaquetado para instalación local del cliente (solo si se vende)
