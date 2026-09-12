# ERP Contable RD — Módulo de Facturación

Aplicación web en español para un ERP contable dominicano. Primera entrega: Facturación completa (clientes, ítems, facturas con ITBIS, secuencias NCF B01/B02/B14/B15, listados y reportes básicos), con la lógica de datos preparada para tu MySQL/MariaDB externo mediante credenciales seguras.

## Pantallas

- **Panel** (`/`): resumen del mes — facturado, ITBIS, facturas emitidas, pendientes de cobro, últimas facturas y alerta de NCF por agotarse.
- **Clientes** (`/clientes`): listado con búsqueda, alta y edición. Campos: nombre/razón social, RNC/Cédula, tipo de comprobante por defecto, teléfono, correo, dirección, condición de pago, estado.
- **Ítems** (`/items`): productos y servicios con código, descripción, unidad, precio, tasa de ITBIS (18%, 16%, 0%, exento) y estado.
- **Nueva factura** (`/facturas/nueva`): selección de cliente, líneas con cantidad/precio/descuento, cálculo automático de subtotal, ITBIS por tasa y total; asignación automática del siguiente NCF según el tipo elegido; condición de pago y vencimiento.
- **Facturas** (`/facturas`): listado filtrable por fecha, cliente, tipo de NCF y estado; anular factura (queda registrada como anulada, nunca se borra).
- **Detalle de factura** (`/facturas/$id`): vista imprimible con datos fiscales de la empresa, NCF, cliente, líneas, desglose de ITBIS y total; botón de impresión/PDF.
- **Secuencias NCF** (`/ncf`): por tipo (B01, B02, B14, B15) con serie, desde/hasta, próximo número, vencimiento de autorización y consumo restante.
- **Reportes** (`/reportes`): ventas por período, ITBIS cobrado por tasa, ventas por cliente, y exportación del formato 606/607-estilo (ventas) en CSV.
- **Configuración** (`/configuracion`): datos de la empresa (razón social, RNC, dirección, teléfono, correo, logo) usados en las facturas.

## Reglas fiscales aplicadas

- ITBIS calculado por línea según la tasa del ítem; desglose por tasa en el total.
- Totales redondeados a 2 decimales, moneda DOP.
- NCF: formato de 11 caracteres (tipo + 8 dígitos secuenciales), asignado de forma atómica al emitir y nunca reutilizado; bloqueo si la secuencia está agotada o vencida.
- Facturas emitidas son inmutables: correcciones vía anulación o nota de crédito (nota de crédito queda para la siguiente entrega).

## Detalles técnicos

- **Backend**: funciones de servidor de TanStack Start (`createServerFn`) en `src/lib/*.functions.ts`, con validación Zod de toda entrada y helpers server-only en `src/lib/db/*.server.ts`. Estos cumplen el rol de las "Edge Functions" en este stack.
- **Acceso a datos**: capa única `src/lib/db/mysql.server.ts` que abre la conexión usando `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD` y `MYSQL_SSL` como secretos del proyecto (nunca en el código ni en el navegador). Todas las consultas parametrizadas.
- **Esquema**: script SQL versionado en `db/schema.sql` con `empresa`, `clientes`, `items`, `ncf_secuencias`, `facturas`, `factura_lineas`, índices y restricción única sobre el NCF emitido. Lo ejecutas una vez en tu servidor.
- **Modo demostración**: mientras no haya credenciales configuradas, la app funciona con datos de ejemplo en memoria y un aviso claro en la interfaz, de modo que puedas revisar todo el flujo antes de conectar tu servidor.
- **Aspecto**: español, corporativo sobrio (azul profundo, grises, acentos discretos), tablas densas legibles, tipografía limpia; tokens de color en `src/styles.css`.
- **SEO/metadatos**: cada página con su propio título y descripción.

## Consideración importante sobre MySQL directo

El entorno donde se publica esta app no garantiza conexiones directas a MySQL: funciona en la vista previa, pero al publicar puede requerir que tu servidor MySQL acepte conexiones desde internet y, en algunos casos, un pequeño puente HTTP en tu servidor. La capa de datos queda aislada en un solo archivo, así que cambiar a puente HTTP más adelante es un ajuste pequeño. Lo verifico y te informo el resultado al terminar.

## Fuera de alcance en esta entrega

Notas de crédito, e-CF con firma digital y envío a la DGII (E31/E32), inventario, contabilidad general, cuentas por cobrar avanzadas y usuarios/roles.
