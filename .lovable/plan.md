# Caja Chica

Nuevo módulo de caja chica que reutiliza las tablas existentes `petty_cash`, `petty_cash_detail` y `petty_cash_detail_has_gl_department`, más los catálogos ya presentes (cuentas contables, departamentos, tipos de NCF, tipos de gasto fiscal 606, retenciones de ISR, cuentas de banco).

En los datos actuales existen dos cajas (LOGIKOS SRL y LOGIKOS PRINCIPAL) y 263 comprobantes, con reposiciones agrupadas por número (ej. 5033 del 13/08/2026). El módulo respeta ese comportamiento: los gastos se registran uno por uno y luego se reponen en grupo.

## Pantallas

**1. Caja chica (lista) — `/caja-chica`**
- Selector de caja, con su cuenta contable, sucursal y estado.
- Tarjetas arriba: monto de apertura del fondo, gastos pendientes de reposición, saldo disponible en efectivo, total repuesto del período.
- Tabla de comprobantes con filtros por fecha, beneficiario, NCF, tipo de gasto y estado (pendiente / repuesto / anulado). Barra de desplazamiento superior como en las demás pantallas.
- Acciones: nuevo comprobante, editar o eliminar solo si el comprobante aún no tiene reposición, y botón "Reponer fondo" con los seleccionados.
- Exportar a Excel/CSV los comprobantes del período para el formato 606.

**2. Comprobante de gasto — `/caja-chica/nuevo` (y editar)**
- Cabecera: caja, custodio, fecha del comprobante, referencia interna y período contable.
- Beneficiario: RNC/cédula y nombre, con búsqueda entre suplidores ya registrados y opción de escribir uno informal.
- Tipo de comprobante fiscal según `ncf_kinds`: crédito fiscal (B01/E31), gastos menores (B13/E43), proveedor informal (B11/E41), consumidor final, etc. Al elegir gastos menores se marca automáticamente como gasto menor y se piden autorización DGII y vigencia.
- Número de NCF/e-CF con validación de formato y aviso si ya se registró el mismo NCF del mismo RNC.
- Montos: bienes, servicios, ITBIS, propina legal, ISC, otros impuestos, retención de ITBIS y retención de ISR (con el tipo de retención tomado del catálogo `isr` para calcular el porcentaje). Total calculado en pantalla.
- Categoría de gasto DGII (formato 606) y casilla para incluir/excluir del reporte.
- Cuenta contable de gasto, cuentas de retención y proyecto contable, todas editables.
- Distribución por centros de costo: varias líneas con departamento y porcentaje o monto, guardadas en `petty_cash_detail_has_gl_department`.
- Vista previa del asiento contable (débito gastos e ITBIS adelantado, crédito caja chica o retenciones), editable antes de guardar, con el mismo componente que usan bancos y contabilidad.
- Adjuntos: subir imágenes o PDF de la factura física (se guardan en el almacenamiento del proyecto y se enlazan al comprobante por su referencia).
- Guardar como borrador (pendiente de aprobación) o aprobado.

**3. Reposición del fondo — `/caja-chica/reposicion`**
- Lista de comprobantes pendientes de la caja elegida, con selección múltiple y total a reponer.
- Cuenta bancaria desde la que sale el cheque o transferencia, número de documento y fecha.
- Vista previa del asiento de reposición y confirmación: genera el movimiento bancario, asigna número y fecha de reposición a los comprobantes y los marca como repuestos.
- Al quedar repuestos, esos comprobantes ya no se pueden editar ni borrar.

## Detalles técnicos

- Repositorio nuevo `src/lib/db/cajachica.server.ts` con todas las consultas (`sql(query, params)` con parámetros `?`), y funciones de servidor en `src/lib/cajachica.functions.ts` usando `createServerFn` + validación Zod.
- Tipos en `src/lib/erp-types.ts`: `CajaChica`, `ComprobanteCajaChica`, `LineaDepartamentoCaja`, `ListasCajaChica`.
- Montos siempre absolutos en la interfaz; al guardar se aplica el signo que usa el sistema heredado (egresos negativos en `amount` y `tax`), igual que los 263 registros existentes.
- Reposición: inserta el movimiento en `banks_book` reutilizando la lógica bancaria existente y actualiza `post_number`, `post_date` y `bank_book_id` del detalle.
- Asientos con las mismas reglas de partida doble del diario general (`gl_journal`), validando débito igual a crédito.
- Permisos: nuevas entradas en `src/lib/pantallas.ts` enlazadas al menú de caja chica existente; auditoría con `auditar()` en cada alta, edición, eliminación y reposición.
- El módulo aparece en el menú lateral dentro de Tesorería, junto a operaciones bancarias.
