// Fuente única de la documentación del Centro de Ayuda.
// REGLA: cada nueva pantalla o función del ERP debe agregar o actualizar su guía aquí.

export type TipoNota = "tip" | "aviso" | "requisito";

export type GuiaAyuda = {
  id: string;
  titulo: string;
  ruta?: string;
  proposito: string;
  pasos: string[];
  notas?: { tipo: TipoNota; texto: string }[];
  palabras?: string[];
};

export type SeccionAyuda = { id: string; titulo: string; guias: GuiaAyuda[] };

export const SECCIONES_AYUDA: SeccionAyuda[] = [
  {
    id: "inicio",
    titulo: "Inicio rápido",
    guias: [
      {
        id: "entrar",
        titulo: "Entrar al sistema",
        proposito: "Acceder con su usuario y clave asignados por el administrador.",
        pasos: [
          "Escriba su usuario y su clave.",
          "Use el ícono del ojo para ver la clave si tiene dudas.",
          "Pulse Entrar. Verá solo las pantallas que su perfil permite.",
        ],
        notas: [{ tipo: "tip", texto: "Si no ve una pantalla, pida al administrador que la habilite en su perfil." }],
      },
      {
        id: "panel",
        titulo: "Panel principal",
        ruta: "/",
        proposito: "Ver de un vistazo ventas, cobros, pagos, liquidez y alertas fiscales.",
        pasos: [
          "Elija el rango de fechas y la moneda en los filtros superiores.",
          "Revise las alertas (comprobantes por agotarse, facturas vencidas).",
          "Pulse Ver detalle en una tarjeta para ver los documentos que la forman.",
        ],
      },
      {
        id: "tour",
        titulo: "Recorrido guiado",
        proposito: "Conocer los elementos principales de la pantalla donde está.",
        pasos: [
          "Pulse el botón de ayuda (?) del menú.",
          "Pulse Iniciar tour guiado.",
          "Avance con Siguiente o cierre con Salir.",
        ],
      },
    ],
  },
  {
    id: "ventas",
    titulo: "Ventas",
    guias: [
      {
        id: "facturas",
        titulo: "Pedidos y facturas",
        ruta: "/facturas",
        proposito: "Crear pedidos, convertirlos en factura con NCF y reimprimirlas.",
        pasos: [
          "Pulse Nuevo pedido y elija el cliente.",
          "Confirme la moneda y la tasa de cambio.",
          "Agregue los artículos, cantidades y observaciones por línea.",
          "Aplique un descuento global si corresponde.",
          "Guarde el pedido y luego pulse Facturar para asignar el NCF.",
          "Desde el detalle puede imprimir o enviar por correo en PDF.",
        ],
        notas: [
          { tipo: "aviso", texto: "Una factura emitida no se edita; use una devolución o nota de crédito." },
          { tipo: "tip", texto: "El correo del cliente se precarga, pero puede cambiarlo antes de enviar." },
        ],
        palabras: ["ncf", "itbis", "pedido", "reimprimir"],
      },
      {
        id: "cotizaciones",
        titulo: "Cotizaciones",
        ruta: "/cotizaciones",
        proposito: "Preparar ofertas para clientes y convertirlas luego en pedido.",
        pasos: ["Pulse Nueva cotización.", "Complete cliente, moneda y artículos.", "Guarde; puede editarla mientras no esté anulada."],
      },
      {
        id: "conduces",
        titulo: "Conduces",
        ruta: "/conduces",
        proposito: "Registrar la entrega de mercancía al cliente.",
        pasos: ["Pulse Nuevo conduce.", "Seleccione cliente y artículos entregados.", "Guarde e imprima para la firma del cliente."],
      },
      {
        id: "devoluciones",
        titulo: "Devoluciones y notas de crédito",
        ruta: "/devoluciones",
        proposito: "Revertir total o parcialmente una factura con su comprobante B04.",
        pasos: ["Busque la factura original.", "Indique los artículos y cantidades devueltas.", "Elija el motivo y guarde."],
        notas: [{ tipo: "requisito", texto: "Debe tener una secuencia de NCF B04 vigente." }],
      },
      {
        id: "recurrentes",
        titulo: "Facturas recurrentes",
        ruta: "/recurrentes",
        proposito: "Programar facturas que se repiten (mensualidades, igualas).",
        pasos: ["Cree la plantilla con cliente, artículos y frecuencia.", "Emita las facturas pendientes cuando llegue la fecha."],
      },
      {
        id: "cxc",
        titulo: "Cuentas por cobrar",
        ruta: "/cxc",
        proposito: "Registrar cobros y ver la antigüedad de saldos de clientes.",
        pasos: ["Pulse Nuevo cobro.", "Elija el cliente y las facturas a aplicar.", "Indique monto y forma de pago y guarde."],
      },
    ],
  },
  {
    id: "compras",
    titulo: "Compras y finanzas",
    guias: [
      {
        id: "compras",
        titulo: "Órdenes de compra",
        ruta: "/compras",
        proposito: "Pedir mercancía a suplidores y registrar su recepción.",
        pasos: ["Cree la orden con suplidor y artículos.", "Al llegar la mercancía, registre la recepción.", "La factura del suplidor pasa a cuentas por pagar."],
      },
      {
        id: "cxp",
        titulo: "Cuentas por pagar",
        ruta: "/cxp",
        proposito: "Registrar facturas de suplidores y controlar lo adeudado.",
        pasos: ["Pulse Nueva factura.", "Complete suplidor, NCF, montos e ITBIS.", "Revise el asiento propuesto y guarde."],
      },
      {
        id: "bancos",
        titulo: "Operaciones bancarias",
        ruta: "/bancos",
        proposito: "Registrar cheques, transferencias, depósitos y pagos a suplidores.",
        pasos: [
          "Pulse Nueva operación y elija la cuenta bancaria y el tipo.",
          "Si es un pago, aplique el monto a las facturas pendientes.",
          "Revise el asiento: la cuenta del banco se afecta siempre.",
          "Guarde. Puede copiar un movimiento anterior para agilizar.",
        ],
        notas: [{ tipo: "tip", texto: "Al copiar y cambiar el monto, las cuentas se ajustan solas." }],
      },
      {
        id: "caja",
        titulo: "Caja chica",
        ruta: "/caja-chica",
        proposito: "Registrar gastos menores y reponer el fondo desde el banco.",
        pasos: [
          "Pulse Nuevo comprobante y elija la caja.",
          "Indique proveedor, tipo de comprobante y NCF.",
          "Escriba montos, ITBIS y retenciones; revise el asiento.",
           "Guarde el comprobante; se abrirá listo para imprimir y firmar.",
          "Cuando haga falta, use Reponer fondo con los comprobantes pendientes.",
        ],
         notas: [
           { tipo: "tip", texto: "Puede reimprimir cualquier comprobante con el ícono de impresora del listado." },
           { tipo: "aviso", texto: "Los comprobantes ya repuestos no se pueden editar ni eliminar." },
         ],
        palabras: ["606", "gastos menores", "b13"],
      },
      {
        id: "inventario",
        titulo: "Inventario",
        ruta: "/inventario",
        proposito: "Registrar entradas, salidas y ajustes de existencia.",
        pasos: ["Pulse Nueva operación.", "Elija el tipo y el almacén.", "Agregue los artículos y guarde."],
      },
      {
        id: "contabilidad",
        titulo: "Diario general",
        ruta: "/contabilidad",
        proposito: "Registrar y consultar asientos contables.",
        pasos: ["Pulse Nuevo asiento.", "Agregue débitos y créditos.", "Guarde cuando la partida esté cuadrada."],
        notas: [{ tipo: "requisito", texto: "Débitos y créditos deben ser iguales para guardar." }],
      },
    ],
  },
  {
    id: "maestros",
    titulo: "Maestros y fiscal",
    guias: [
      { id: "clientes", titulo: "Clientes", ruta: "/clientes", proposito: "Mantener los datos de clientes: RNC, moneda, crédito y correo.", pasos: ["Pulse Nuevo cliente.", "Complete los datos y guarde."] },
      { id: "items", titulo: "Ítems", ruta: "/items", proposito: "Mantener productos y servicios con precio e ITBIS.", pasos: ["Pulse Nuevo ítem.", "Indique descripción, precio y tasa de ITBIS.", "Guarde."] },
      {
        id: "ncf",
        titulo: "Comprobantes fiscales",
        ruta: "/ncf",
        proposito: "Administrar las secuencias de NCF autorizadas por la DGII.",
        pasos: ["Registre la secuencia con su rango y vencimiento.", "Vigile en el panel cuándo se esté agotando."],
      },
      { id: "reportes", titulo: "Reportes", ruta: "/reportes", proposito: "Consultar ventas, compras e informes fiscales.", pasos: ["Elija el reporte y el período.", "Exporte o imprima el resultado."] },
    ],
  },
  {
    id: "config",
    titulo: "Configuración",
    guias: [
      {
        id: "correo",
        titulo: "Servidor de correo",
        ruta: "/configuracion",
        proposito: "Enviar facturas y cotizaciones por correo con su propio servidor.",
        pasos: ["Entre a Configuración → Datos servidor de correos.", "Escriba servidor, puerto, usuario y clave.", "Envíe una prueba; si llega, queda guardado."],
        notas: [{ tipo: "aviso", texto: "Con Gmail debe usar una contraseña de aplicación de 16 caracteres." }],
      },
      { id: "plantillas", titulo: "Diseñador de documentos", ruta: "/plantillas", proposito: "Diseñar cómo se imprimen facturas y demás documentos.", pasos: ["Elija el tipo de documento.", "Arrastre campos, textos y logo.", "Use la vista previa y guarde."] },
      { id: "usuarios", titulo: "Usuarios y perfiles", ruta: "/usuarios", proposito: "Crear usuarios y definir a qué pantallas y acciones tienen acceso.", pasos: ["Cree el perfil con sus permisos.", "Cree el usuario y asígnele el perfil."] },
      { id: "licencia", titulo: "Licencia del sistema", ruta: "/licencia", proposito: "Ver el estado, plan y vencimiento de su licencia.", pasos: ["Entre a Licencia del sistema.", "Pulse Revalidar si renovó recientemente."], notas: [{ tipo: "aviso", texto: "Con la licencia vencida el sistema queda en solo lectura." }] },
      { id: "auditoria", titulo: "Auditoría", ruta: "/auditoria", proposito: "Ver quién creó, editó o eliminó cada registro.", pasos: ["Filtre por usuario, fecha o tipo de cambio."] },
    ],
  },
];

// Pasos del recorrido guiado: se muestran solo los elementos presentes en la pantalla.
export const PASOS_TOUR = [
  { selector: '[data-tour="menu"]', titulo: "Menú principal", texto: "Desde aquí entra a cada módulo del sistema." },
  { selector: '[data-tour="titulo"]', titulo: "Pantalla actual", texto: "El título indica dónde está y para qué sirve." },
  { selector: '[data-tour="acciones"]', titulo: "Acciones", texto: "Botones para crear, exportar o imprimir." },
  { selector: '[data-tour="contenido"]', titulo: "Contenido", texto: "Aquí verá listados, formularios y filtros." },
  { selector: '[data-tour="ayuda"]', titulo: "Ayuda", texto: "Vuelva aquí cuando tenga dudas." },
];
