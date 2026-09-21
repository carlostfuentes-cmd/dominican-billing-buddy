# Estabilizar definitivamente la conexión con MariaDB

## Objetivo
Mantener el puente HTTPS actual, pero convertirlo en una conexión predecible: menos solicitudes, tiempos límite cortos, errores identificables y recuperación automática sin congelar pantallas.

## Cambios
1. **Puente con consultas agrupadas**
   - Aceptar varias consultas de lectura en una sola llamada HTTPS y ejecutarlas con una única conexión a MariaDB.
   - Conservar las escrituras individualmente para evitar repeticiones o efectos dobles.
   - Mantener todos los valores como parámetros vinculados.

2. **Conexión controlada en PHP**
   - Limitar explícitamente el tiempo para abrir MariaDB y ejecutar la petición.
   - Añadir una comprobación real que valide también MariaDB, no solo que PHP esté vivo.
   - Responder con códigos claros para distinguir clave incorrecta, MariaDB inaccesible, consulta inválida y tiempo agotado.

3. **Cliente estable en la aplicación**
   - Eliminar la consulta adicional `SELECT 1` antes de trabajar.
   - Agrupar automáticamente las lecturas simultáneas del panel y demás pantallas.
   - Reintentar una sola vez únicamente las lecturas seguras cuando haya un fallo temporal.
   - Activar una pausa breve tras fallos consecutivos y recuperarse automáticamente después.

4. **Diagnóstico visible**
   - Añadir en Configuración una prueba única que confirme: puente accesible, clave válida, MariaDB conectada y tiempo de respuesta.
   - Mostrar mensajes concretos sin dejar la aplicación en blanco.

5. **Validación**
   - Probar inicio de sesión, panel, pedidos/facturas y configuración.
   - Verificar carga móvil y escritorio, errores de ejecución y compilación.

## Requisito de puesta en marcha
El nuevo archivo `puente-mysql.php` deberá descargarse desde Configuración y reemplazar una sola vez el archivo actual del servidor. La dirección y la clave existentes se mantienen.
