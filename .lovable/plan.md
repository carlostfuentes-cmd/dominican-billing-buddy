# Compras y Cuentas por pagar

Se construye el ciclo completo de compras sobre las tablas que ya existen, sin crear tablas nuevas: `purchases`, `purchases_detail`, `ap`, `ap_detail`, `ap_reference`, `ap_kinds`, `expenses_kinds`, `isr`, `suppliers`, `supplier_accounts`.

## 1. Orden de compra

Pantallas: lista, nueva y detalle (igual estilo que pedidos).

- Suplidor buscable (código, nombre, dirección y contacto), emisión, moneda y tasa, sucursal, almacén, destino, uso, condiciones en días, descuento general, solicitante, proyecto, requisición, fecha de requisición, dirección de entrega, observaciones generales y nota del producto.
- Líneas: producto buscable, cantidad, precio, descuento, subtotal e ITBIS. Casilla "Productos sin valor" para órdenes sin precios.
- Totales: descuentos, ITBIS, otros cargos y gran total, en moneda del documento con equivalente en pesos.
- Estado: autorizada / no autorizada / nula, más estado de recepción calculado (pendiente, parcial, completa) comparando cantidad solicitada contra recibida.
- Acciones: guardar, imprimir, anular.

## 2. Recepción de mercancías

Una sola pantalla con dos pestañas, como en el sistema actual.

**Pestaña "Datos orden de compra"** (recepción de almacén)
- Se elige la orden; carga suplidor, moneda, condiciones y las líneas con cantidad solicitada y recibida.
- Almacén que recibe, fecha de recepción, descuento, observaciones.
- Se captura la cantidad recibida por línea; no permite recibir más de lo pendiente.
- Al guardar: acumula lo recibido en la orden, registra la entrada al inventario con su consecutivo y genera el asiento contable de inventario.

**Pestaña "Datos factura"** (recepción de contabilidad)
- Además de lo anterior: número de factura del suplidor, NCF, fecha de factura y vencimiento, tasa de cambio, tipo de gasto, forma de pago, subtotales de bienes y servicios, propina, ISC, otros impuestos, ITBIS, ITBIS retenido, retención de ISR (con su concepto y tasa), ITBIS llevado al costo, ITBIS sujeto a proporcionalidad y total de la factura.
- Asiento contable propuesto automáticamente y editable, igual que en ventas.
- Al guardar: crea la factura del suplidor en cuentas por pagar, la enlaza a la orden, afecta inventario y registra el asiento.

## 3. Factura de suplidor directa (sin orden)

Pantalla de captura para servicios y gastos: suplidor, dirección, teléfono, uso, número de factura, fecha, conduce, días de crédito, vencimiento, moneda y tasa, NCF, tipo de gasto, forma de pago, orden asociada opcional, proveedor informal, gasto menor, todos los impuestos y retenciones, sucursal, observaciones y asiento contable editable. Afecta solo cuentas por pagar y contabilidad, nunca inventario.

## 4. Cuentas por pagar

Lista de movimientos con filtros por suplidor, fecha, tipo y NCF; saldo por suplidor y documentos pendientes; detalle imprimible de cada documento con su asiento.

## Reglas que se aplican

- Multimoneda siempre: moneda y tasa del documento, importes en su moneda y equivalente en pesos.
- Retención de ISR calculada con la tasa del concepto elegido; el asiento se recalcula al cambiarla.
- No se permite recibir más de lo ordenado; la orden queda cerrada al completarse.
- El costo del producto se actualiza con el costo real de la recepción cuando viene con precios.
- Toda operación queda en la auditoría; las pantallas respetan los permisos por menú.

## Detalles técnicos

- `compras.server.ts` y `cxp.server.ts` con las consultas; `compras.functions.ts` y `cxp.functions.ts` como server functions validadas con Zod.
- Las cuentas se resuelven con el helper existente (`inventory_groups_accounts` para inventario, `supplier_accounts` para el suplidor) y se muestran en `AsientoContable`, editable.
- El asiento se escribe en `gl_journal`/`gl_journal_detail` y su reflejo en `ap_detail` (cuentas de `gl_catalog`, que es el mismo catálogo).
- Documentos de CxP con `ap_kind_id = 'I'` (factura suplidores) y su registro en `ap_reference`; `purchases.invoice_id` guarda la factura del suplidor.
- Rutas nuevas: `/compras`, `/compras/nueva`, `/compras/$id`, `/compras/$id/recepcion`, `/cxp`, `/cxp/nueva`, con sus entradas en el menú y en `pantallas.ts`.
