# Corregir copia de movimientos bancarios

## Cambios
- Al copiar un movimiento, cargar todas sus líneas contables guardadas, incluyendo cuenta, descripción, centro de costo, débito y crédito.
- Evitar que la propuesta automática reemplace inmediatamente el asiento copiado por uno genérico.
- Mantener disponible la opción de recalcular cuando el usuario quiera reconstruir el asiento.
- Dar más espacio a débito y crédito para mostrar importes de millones sin recortes.

## Verificación
- Copiar un movimiento con varias cuentas y confirmar que aparecen todas.
- Cambiar el monto y confirmar que las cuentas copiadas permanecen visibles.
- Revisar la presentación en escritorio y móvil, además de compilación y errores.
