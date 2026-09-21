# Barra horizontal superior en listados anchos

## Objetivo
Hacer que toda tabla cuyo contenido exceda el ancho visible muestre una barra de desplazamiento horizontal al inicio y conserve la barra inferior.

## Cambios
- Ajustar el componente compartido de tablas para detectar automáticamente cuándo existe desbordamiento horizontal.
- Mostrar la barra superior solo cuando sea necesaria, sincronizada en ambos sentidos con la barra inferior.
- Aplicar el comportamiento automáticamente a los listados existentes, incluidos Caja chica, bancos, compras, cuentas, inventario, NCF, recurrentes y documentos.
- Evitar espacio vacío en las tablas que caben completamente en la pantalla.

## Verificación
- Confirmar que el proyecto compile sin errores.
- Revisar un listado ancho en escritorio y en pantalla móvil para comprobar ambas barras y su sincronización.
