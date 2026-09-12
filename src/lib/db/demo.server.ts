// Modo demostración: datos en memoria usados mientras no haya credenciales
// MySQL configuradas. Se reinicia con el servidor.

import type {
  Cliente,
  Empresa,
  Factura,
  Item,
  SecuenciaNCF,
  TipoNCF,
} from "@/lib/erp-types";

export interface EstadoDemo {
  empresa: Empresa;
  clientes: Cliente[];
  items: Item[];
  secuencias: SecuenciaNCF[];
  facturas: Factura[];
  siguienteId: { cliente: number; item: number; factura: number };
}

let estado: EstadoDemo | null = null;

function crearEstado(): EstadoDemo {
  const hoy = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const menos = (dias: number) => {
    const d = new Date(hoy);
    d.setDate(d.getDate() - dias);
    return iso(d);
  };

  const clientes: Cliente[] = [
    {
      id: "1",
      nombre: "Ferretería El Progreso SRL",
      rnc: "131234567",
      tipo_ncf: "B01",
      telefono: "809-555-1010",
      email: "compras@elprogreso.do",
      direccion: "Av. 27 de Febrero 145, Santo Domingo",
      dias_credito: 30,
      activo: true,
    },
    {
      id: "2",
      nombre: "María Altagracia Peña",
      rnc: "00112345678",
      tipo_ncf: "B02",
      telefono: "829-555-2244",
      email: "mpena@correo.do",
      direccion: "Calle Duarte 8, Santiago",
      dias_credito: 0,
      activo: true,
    },
    {
      id: "3",
      nombre: "Ministerio de Educación",
      rnc: "401007551",
      tipo_ncf: "B15",
      telefono: "809-555-3300",
      email: "pagos@minerd.gob.do",
      direccion: "Av. Máximo Gómez 2, Santo Domingo",
      dias_credito: 45,
      activo: true,
    },
    {
      id: "4",
      nombre: "Zona Franca Textil Caribe",
      rnc: "130998877",
      tipo_ncf: "B14",
      telefono: "809-555-7788",
      email: "admin@ztcaribe.do",
      direccion: "Parque Industrial, San Pedro de Macorís",
      dias_credito: 60,
      activo: true,
    },
  ];

  const items: Item[] = [
    {
      id: "1",
      codigo: "SERV-001",
      descripcion: "Servicio de consultoría contable (hora)",
      unidad: "HORA",
      precio: 3500,
      tasa_itbis: 18,
      activo: true,
    },
    {
      id: "2",
      codigo: "SERV-002",
      descripcion: "Preparación de declaración IT-1",
      unidad: "UND",
      precio: 12000,
      tasa_itbis: 18,
      activo: true,
    },
    {
      id: "3",
      codigo: "PROD-010",
      descripcion: "Licencia software contable (anual)",
      unidad: "UND",
      precio: 48000,
      tasa_itbis: 18,
      activo: true,
    },
    {
      id: "4",
      codigo: "PROD-020",
      descripcion: "Café molido premium 1 lb",
      unidad: "LB",
      precio: 450,
      tasa_itbis: 16,
      activo: true,
    },
    {
      id: "5",
      codigo: "PROD-030",
      descripcion: "Cuaderno escolar (exento)",
      unidad: "UND",
      precio: 85,
      tasa_itbis: 0,
      activo: true,
    },
  ];

  const secuencias: SecuenciaNCF[] = (["B01", "B02", "B14", "B15"] as TipoNCF[]).map((tipo, i) => ({
    tipo_ncf: tipo,
    desde: 1,
    hasta: [500, 1000, 200, 200][i]!,
    proximo: [4, 3, 1, 2][i]!,
    vence: `${hoy.getFullYear()}-12-31`,
    activa: true,
  }));

  const facturas: Factura[] = [
    {
      id: 1,
      ncf: "B0100000001",
      tipo_ncf: "B01",
      cliente_id: "1",
      cliente_nombre: clientes[0]!.nombre,
      cliente_rnc: clientes[0]!.rnc,
      fecha: menos(12),
      vencimiento: menos(-18),
      subtotal: 21000,
      descuento: 0,
      itbis: 3780,
      total: 24780,
      estado: "emitida",
      notas: "",
      lineas: [
        {
          item_id: "1",
          codigo: "SERV-001",
          descripcion: "Servicio de consultoría contable (hora)",
          cantidad: 6,
          precio: 3500,
          descuento_pct: 0,
          tasa_itbis: 18,
          subtotal: 21000,
          itbis: 3780,
          total: 24780,
        },
      ],
    },
    {
      id: 2,
      ncf: "B0200000001",
      tipo_ncf: "B02",
      cliente_id: "2",
      cliente_nombre: clientes[1]!.nombre,
      cliente_rnc: clientes[1]!.rnc,
      fecha: menos(6),
      vencimiento: menos(6),
      subtotal: 2250,
      descuento: 0,
      itbis: 360,
      total: 2610,
      estado: "pagada",
      notas: "Pago en efectivo",
      lineas: [
        {
          item_id: "4",
          codigo: "PROD-020",
          descripcion: "Café molido premium 1 lb",
          cantidad: 5,
          precio: 450,
          descuento_pct: 0,
          tasa_itbis: 16,
          subtotal: 2250,
          itbis: 360,
          total: 2610,
        },
      ],
    },
    {
      id: 3,
      ncf: "B1500000001",
      tipo_ncf: "B15",
      cliente_id: "3",
      cliente_nombre: clientes[2]!.nombre,
      cliente_rnc: clientes[2]!.rnc,
      fecha: menos(3),
      vencimiento: menos(-42),
      subtotal: 48000,
      descuento: 0,
      itbis: 8640,
      total: 56640,
      estado: "emitida",
      notas: "Orden de compra 2026-4471",
      lineas: [
        {
          item_id: "3",
          codigo: "PROD-010",
          descripcion: "Licencia software contable (anual)",
          cantidad: 1,
          precio: 48000,
          descuento_pct: 0,
          tasa_itbis: 18,
          subtotal: 48000,
          itbis: 8640,
          total: 56640,
        },
      ],
    },
    {
      id: 4,
      ncf: "B0100000002",
      tipo_ncf: "B01",
      cliente_id: "1",
      cliente_nombre: clientes[0]!.nombre,
      cliente_rnc: clientes[0]!.rnc,
      fecha: menos(1),
      vencimiento: menos(-29),
      subtotal: 12000,
      descuento: 0,
      itbis: 2160,
      total: 14160,
      estado: "emitida",
      notas: "",
      lineas: [
        {
          item_id: "2",
          codigo: "SERV-002",
          descripcion: "Preparación de declaración IT-1",
          cantidad: 1,
          precio: 12000,
          descuento_pct: 0,
          tasa_itbis: 18,
          subtotal: 12000,
          itbis: 2160,
          total: 14160,
        },
      ],
    },
    {
      id: 5,
      ncf: "B0100000003",
      tipo_ncf: "B01",
      cliente_id: "4",
      cliente_nombre: clientes[3]!.nombre,
      cliente_rnc: clientes[3]!.rnc,
      fecha: menos(20),
      vencimiento: menos(-40),
      subtotal: 7000,
      descuento: 0,
      itbis: 1260,
      total: 8260,
      estado: "anulada",
      notas: "Anulada por error en cliente",
      lineas: [
        {
          item_id: "1",
          codigo: "SERV-001",
          descripcion: "Servicio de consultoría contable (hora)",
          cantidad: 2,
          precio: 3500,
          descuento_pct: 0,
          tasa_itbis: 18,
          subtotal: 7000,
          itbis: 1260,
          total: 8260,
        },
      ],
    },
  ];

  return {
    empresa: {
      nombre: "Contadores Asociados RD SRL",
      rnc: "130456789",
      direccion: "Av. Winston Churchill 1099, Piantini, Santo Domingo",
      telefono: "809-555-0100",
      email: "facturacion@contadoresrd.do",
    },
    clientes,
    items,
    secuencias,
    facturas,
    siguienteId: { cliente: 5, item: 6, factura: 6 },
  };
}

export function demo(): EstadoDemo {
  if (!estado) estado = crearEstado();
  return estado;
}
