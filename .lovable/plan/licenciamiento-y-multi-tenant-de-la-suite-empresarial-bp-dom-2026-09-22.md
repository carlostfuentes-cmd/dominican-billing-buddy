# Licenciamiento y multi-tenant de la Suite Empresarial BP Dominicana

## Objetivo
Que BP Dominicana controle desde un solo lugar quién puede usar la Suite, con qué plan, cuántos usuarios y hasta cuándo — tanto para clientes en la nube como para los que alojan el sistema en su propio local.

## Decisiones de base (recomendadas)
- **Una base de datos por cliente.** En lugar de añadir una columna de cliente a cada tabla del ERP, cada empresa tiene su propia base. Es más seguro, más simple y no obliga a reescribir el sistema actual.
- **Licencia vencida = solo lectura.** El cliente puede consultar e imprimir su información histórica, pero no facturar ni registrar nada nuevo. Bloquear el acceso completo genera pánico y reclamos; solo lectura cobra igual de rápido.
- **En local no se persigue la protección perfecta.** Quien aloja el sistema puede alterarlo. La licencia firmada disuade, deja rastro y da base legal; no pretende ser infalible.

## Fase 1 — Servidor de licencias (lo primero)
Un panel interno, solo para BP Dominicana, con:
- Alta de clientes: nombre, RNC, contacto, modalidad (nube o local).
- Licencia por cliente: plan, cantidad de usuarios permitidos, fecha de vencimiento, estado (activa, suspendida, vencida, cancelada).
- Acciones: renovar, suspender, reactivar, cancelar.
- Historial de cada cambio con usuario y fecha.
- Registro de contactos de cada instalación: última vez que se comunicó, versión, cantidad de usuarios en uso.

## Fase 2 — Validación dentro de la Suite
- Al iniciar sesión y cada cierto tiempo, la instalación consulta su licencia contra el servidor de BP Dominicana.
- La respuesta viene firmada, con fecha y dirigida a esa instalación en particular, para que no pueda copiarse ni reutilizarse.
- La respuesta se guarda localmente por unas horas, para que un corte de internet no detenga el trabajo.
- Si no logra comunicarse, opera con un **período de gracia de 7 días**. Pasado ese plazo, queda en solo lectura.
- Toda la validación ocurre del lado del servidor de la aplicación; el navegador nunca decide si la licencia es válida.

## Fase 3 — Límites y bloqueo
- **Usuarios:** al crear o activar un usuario se verifica el tope del plan. Si está lleno, avisa cuántos permite y ofrece ampliar el plan.
- **Solo lectura:** cuando la licencia está vencida o suspendida, se rechaza cualquier registro, modificación o eliminación, con un mensaje claro y el contacto de BP Dominicana. Consultas, reportes y reimpresiones siguen funcionando.

## Fase 4 — Pantalla de licencia para el cliente
En Configuración → Licencia, visible al administrador de cada empresa:
- Plan, estado, fecha de vencimiento, usuarios permitidos y usuarios en uso.
- Aviso destacado a 30, 15 y 7 días del vencimiento, y aviso permanente cuando esté suspendida o en solo lectura.
- Botón para revalidar la licencia al instante.

## Fase 5 — Instalación en local del cliente (solo si se vende)
- La conexión a la base del cliente se configura por variables de entorno; nunca dentro del código.
- Paquete de instalación con su propio archivo de configuración e instrucciones.
- Cada instalación se identifica con una clave única entregada por BP Dominicana.

## Detalles técnicos
- **Tablas nuevas (requieren su aprobación explícita, ya que la regla del proyecto es no crear tablas):** `licencias`, `licencia_eventos`, `licencia_instalaciones`. Viven en la base de control de BP Dominicana, no en la base del cliente.
- Todas las consultas pasan por `src/lib/db/mysql.server.ts` con `sql(consulta, params)` y parámetros vinculados.
- Lógica de licencia en `src/lib/db/licencias.server.ts` + `src/lib/licencias.functions.ts` con `createServerFn`.
- Puerta de escritura centralizada: un chequeo que se aplica en las funciones de servidor que escriben (documentos, bancos, contabilidad, caja chica, maestros), para no repetir la validación pantalla por pantalla.
- Firma de la respuesta de licencia con clave privada del proveedor; la Suite verifica con la clave pública incluida en el paquete. Claves y direcciones del servidor de licencias vía variables de entorno/secretos.
- Caché de licencia en la propia instalación con vencimiento corto y marca de hora, más el contador del período de gracia.
- Pantalla `/licencia` enlazada a `src/lib/pantallas.ts` con el menú de Sistema y visible solo a administradores; panel interno del proveedor separado del ERP del cliente.

## Orden sugerido de entrega
1. Servidor de licencias y panel interno.
2. Validación firmada, caché y período de gracia.
3. Tope de usuarios y modo solo lectura.
4. Pantalla de licencia y avisos de vencimiento.
5. Empaquetado para instalación local.
