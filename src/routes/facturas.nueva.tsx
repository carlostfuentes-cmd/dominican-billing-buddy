import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useEffect, useMemo, useState } from "react";
import { FileText, Plus, Printer, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/AppShell";
import {
  CamposPersonalizados,
  type ValoresCampos,
} from "@/components/CamposPersonalizados";
import { guardarValoresCampos } from "@/lib/campos.functions";
import { SelectorBuscable } from "@/components/SelectorBuscable";
import { DescuentoGlobal } from "@/components/documentos/DescuentoGlobal";
import { AsientoContable } from "@/components/AsientoContable";
import { obtenerPropuestaPedido } from "@/lib/cuentas.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  actualizarPedido,
  guardarPedido,
  obtenerClientes,
  obtenerFactura,
  obtenerItems,
  obtenerListasFactura,
  obtenerSecuencias,
} from "@/lib/erp.functions";
import { obtenerDocumento, obtenerDocumentos } from "@/lib/documentos.functions";

import {
  calcularTotales,
  dop,
  enDOP,
  formatearNCF,
  hoyISO,
  money,
  round2,
  sumarDias,
  TIPOS_NCF,
  type Documento,
  type LineaAsiento,
  type LineaEntrada,
  type TipoNCF,
} from "@/lib/erp-types";

export const Route = createFileRoute("/facturas/nueva")({
  validateSearch: (s: Record<string, unknown>) => {
    const n = Number(s["pedido"]);
    return Number.isFinite(n) && n > 0 ? { pedido: n } : {};
  },
  head: () => ({
    meta: [
      { title: "Nuevo pedido — ERP Contable RD" },
      {
        name: "description",
        content:
          "Registra el pedido y conviértelo en factura con NCF automático, ITBIS y multimoneda.",
      },
      { property: "og:title", content: "Nuevo pedido — ERP Contable RD" },
      {
        property: "og:description",
        content: "Pedido con conversión a factura, NCF, ITBIS y multimoneda.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NuevaFactura,
});

const SIN = "-";

const lineaVacia: LineaEntrada = {
  item_id: null,
  codigo: "",
  descripcion: "",
  cantidad: 1,
  oferta: 0,
  precio: 0,
  descuento_pct: 0,
  tasa_itbis: 18,
  observacion: "",
};

function NuevaFactura() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [clienteId, setClienteId] = useState("");
  const [tipo, setTipo] = useState<TipoNCF>("B02");
  const [fecha, setFecha] = useState(hoyISO());
  const [dias, setDias] = useState(0);
  const [notas, setNotas] = useState("");
  const [moneda, setMoneda] = useState("DOP");
  const [tasa, setTasa] = useState(1);
  const [incluyeItbis, setIncluyeItbis] = useState(false);
  const [vendedor, setVendedor] = useState(SIN);
  const [tecnico, setTecnico] = useState(SIN);
  const [almacen, setAlmacen] = useState(SIN);
  const [sucursal, setSucursal] = useState(SIN);
  const [departamento, setDepartamento] = useState(SIN);
  const [proyecto, setProyecto] = useState(SIN);
  const [cotizacion, setCotizacion] = useState("");
  const [ordenCliente, setOrdenCliente] = useState("");
  const [ordenVendedor, setOrdenVendedor] = useState("");
  const [efectivo, setEfectivo] = useState(0);
  const [tarjeta, setTarjeta] = useState(0);
  const [cheque, setCheque] = useState(0);
  const [transferencia, setTransferencia] = useState(0);
  const [lineas, setLineas] = useState<LineaEntrada[]>([{ ...lineaVacia }]);
  const [enviarCliente, setEnviarCliente] = useState(false);
  const [correoCliente, setCorreoCliente] = useState("");

  // Edición de un pedido existente: /facturas/nueva?pedido=123
  const { pedido: pedidoId } = Route.useSearch();
  const editando = typeof pedidoId === "number";
  const {
    data: pedidoOriginal,
    isLoading: cargandoPedido,
    error: errorPedido,
    refetch: reintentarPedido,
  } = useQuery({
    queryKey: ["factura", pedidoId],
    queryFn: () => obtenerFactura({ data: { id: pedidoId as number } }),
    enabled: editando,
  });
  const [cargado, setCargado] = useState(false);
  useEffect(() => {
    if (!pedidoOriginal || cargado) return;
    const p = pedidoOriginal;
    setCargado(true);
    setClienteId(p.cliente_id);
    setTipo(p.tipo_ncf);
    setFecha(p.fecha);
    setDias(p.dias_credito ?? 0);
    setNotas(p.notas ?? "");
    setMoneda((p.moneda || "DOP").toUpperCase());
    setTasa(p.tasa_cambio && p.tasa_cambio > 0 ? p.tasa_cambio : 1);
    if (p.vendedor_id) setVendedor(String(p.vendedor_id));
    if (p.tecnico_id) setTecnico(String(p.tecnico_id));
    if (p.almacen_id) setAlmacen(String(p.almacen_id));
    if (p.sucursal_id) setSucursal(String(p.sucursal_id));
    if (p.departamento_id) setDepartamento(String(p.departamento_id));
    if (p.proyecto_id) setProyecto(String(p.proyecto_id));
    if (p.cotizacion_id) setCotizacion(String(p.cotizacion_id));
    setOrdenCliente(p.orden_cliente ?? "");
    setOrdenVendedor(p.orden_vendedor ?? "");
    setEfectivo(p.pagos?.efectivo ?? 0);
    setTarjeta(p.pagos?.tarjeta ?? 0);
    setCheque(p.pagos?.cheque ?? 0);
    setTransferencia(p.pagos?.transferencia ?? 0);
    if (p.lineas.length) {
      setLineas(
        p.lineas.map((l) => ({
          item_id: l.item_id,
          codigo: l.codigo,
          descripcion: l.descripcion,
          cantidad: l.cantidad,
          oferta: l.oferta ?? 0,
          precio: l.precio,
          descuento_pct: l.descuento_pct,
          tasa_itbis: l.tasa_itbis,
          observacion: l.observacion ?? "",
        })),
      );
    }
  }, [pedidoOriginal, cargado]);


  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes", ""],
    queryFn: () => obtenerClientes({ data: { busqueda: "" } }),
  });
  const { data: items = [] } = useQuery({
    queryKey: ["items", ""],
    queryFn: () => obtenerItems({ data: { busqueda: "" } }),
  });
  const { data: secuencias = [] } = useQuery({
    queryKey: ["secuencias"],
    queryFn: () => obtenerSecuencias(),
  });
  const { data: listas } = useQuery({
    queryKey: ["listas-factura"],
    queryFn: () => obtenerListasFactura(),
  });
  // Cotizaciones vigentes para halar sus datos al pedido.
  const { data: cotizaciones = [] } = useQuery({
    queryKey: ["documentos", "cotizacion", "para-pedido"],
    queryFn: () => obtenerDocumentos({ data: { tipo: "cotizacion" as const } }),
  });

  const opcionesCotizaciones = useMemo(
    () =>
      cotizaciones
        .filter((c) => !c.anulado)
        .map((c) => ({
          valor: String(c.id),
          etiqueta: `#${c.id} — ${c.cliente_nombre || c.cliente_id}`,
          detalle: `${c.fecha} · ${money(c.total, c.moneda)}`,
        })),
    [cotizaciones],
  );

  const traerCotizacion = useMutation({
    mutationFn: (id: number): Promise<Documento | null> =>
      obtenerDocumento({ data: { tipo: "cotizacion" as const, id } }),
    onSuccess: (doc: Documento | null) => {

      if (!doc) {
        toast.error("No se encontró la cotización");
        return;
      }
      setClienteId(doc.cliente_id);
      setMoneda(doc.moneda);
      setTasa(doc.tasa_cambio);
      setDias(doc.dias_credito);
      if (doc.notas) setNotas(doc.notas);
      if (doc.vendedor_id) setVendedor(doc.vendedor_id);
      if (doc.tecnico_id) setTecnico(doc.tecnico_id);
      if (doc.almacen_id) setAlmacen(doc.almacen_id);
      if (doc.sucursal_id) setSucursal(String(doc.sucursal_id));
      if (doc.departamento_id) setDepartamento(doc.departamento_id);
      if (doc.proyecto_id) setProyecto(doc.proyecto_id);
      if (doc.orden_cliente) setOrdenCliente(doc.orden_cliente);
      if (doc.lineas.length) {
        setLineas(
          doc.lineas.map((l) => ({
            item_id: l.item_id,
            codigo: l.codigo,
            descripcion: l.descripcion,
            cantidad: l.cantidad,
            oferta: l.oferta ?? 0,
            precio: l.precio,
            descuento_pct: l.descuento_pct,
            tasa_itbis: l.tasa_itbis,
            observacion: l.observacion ?? "",
          })),
        );
      }
      toast.success(`Datos de la cotización ${doc.id} copiados al pedido`);
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo traer la cotización"),
  });



  const opcionesClientes = useMemo(
    () =>
      clientes
        .filter((c) => c.activo)
        .map((c) => ({
          valor: String(c.id),
          etiqueta: `${c.id} — ${c.nombre}`,
          detalle: c.rnc ?? "",
        })),
    [clientes],
  );
  const opcionesItems = useMemo(
    () =>
      items
        .filter((it) => it.activo)
        .map((it) => ({
          valor: String(it.id),
          etiqueta: `${it.codigo} — ${it.descripcion}`,
          detalle: it.referencia ?? "",
        })),
    [items],
  );

  const cliente = clientes.find((c) => String(c.id) === clienteId);
  // Precarga el correo del cliente apenas se conoce (selección o edición).
  useEffect(() => {
    if (cliente?.email && !correoCliente) setCorreoCliente(cliente.email);
  }, [cliente, correoCliente]);
  const secuencia = secuencias.find((s) => s.tipo_ncf === tipo);
  const esDOP = moneda.toUpperCase() === "DOP";
  const lineasCalculo = useMemo(
    () => lineas.map((l) => ({ ...l, precio_incluye_itbis: incluyeItbis })),
    [lineas, incluyeItbis],
  );
  const { totales } = useMemo(() => calcularTotales(lineasCalculo), [lineasCalculo]);
  const cobrado = efectivo + tarjeta + cheque + transferencia;

  // Cuentas propuestas por la clasificación de inventario del producto.
  const [asiento, setAsiento] = useState<LineaAsiento[]>([]);
  const lineasVenta = useMemo(
    () =>
      calcularTotales(lineasCalculo).lineas.map((l) => ({
        producto_id: l.codigo,
        cantidad: l.cantidad,
        precio: l.precio,
        descuento: round2(l.cantidad * l.precio - l.subtotal),
        itbis: l.itbis,
      })),
    [lineasCalculo],
  );
  const { data: propuesta, isFetching: calculandoAsiento } = useQuery({
    queryKey: ["propuesta-pedido", clienteId, moneda, tasa, JSON.stringify(lineasVenta)],
    queryFn: () =>
      obtenerPropuestaPedido({
        data: {
          cliente_id: clienteId,
          moneda,
          tasa_cambio: tasa,
          lineas: lineasVenta.filter((l) => l.producto_id && l.cantidad > 0),
        },
      }),
    enabled: clienteId.length > 0 && lineasVenta.some((l) => l.producto_id && l.cantidad > 0),
  });
  useEffect(() => {
    setAsiento(propuesta?.lineas ?? []);
  }, [propuesta]);
  const [camposValores, setCamposValores] = useState<ValoresCampos>({});

  const guardar = useMutation({
    mutationFn: (opciones: { facturar: boolean; imprimir?: boolean }) => {
      const datos = {
          cliente_id: clienteId,
          tipo_ncf: tipo,
          fecha,
          dias_credito: dias,
          notas,
          moneda,
          tasa_cambio: tasa,
          ...(vendedor !== SIN ? { vendedor_id: vendedor } : {}),
          ...(tecnico !== SIN ? { tecnico_id: tecnico } : {}),
          ...(almacen !== SIN ? { almacen_id: almacen } : {}),
          ...(sucursal !== SIN ? { sucursal_id: sucursal } : {}),
          ...(departamento !== SIN ? { departamento_id: departamento } : {}),
          ...(proyecto !== SIN ? { proyecto_id: proyecto } : {}),
          ...(cotizacion ? { cotizacion_id: cotizacion } : {}),
          orden_cliente: ordenCliente,
          orden_vendedor: ordenVendedor,
          pagos: { efectivo, tarjeta, cheque, transferencia, cardnet: 0 },
          lineas: lineasCalculo.map((l) => ({ ...l, item_id: l.item_id ?? null })),
          facturar: opciones.facturar,
          ...(opciones.facturar && asiento.length ? { asiento } : {}),
      };
      return editando
        ? actualizarPedido({ data: { ...datos, id: pedidoId as number } })
        : guardarPedido({ data: datos });
    },
    onSuccess: async (doc, opciones) => {
      const valores = Object.entries(camposValores)
        .map(([campo_id, valor]) => ({ campo_id: Number(campo_id), valor }))
        .filter((v) => v.valor.trim() !== "");
      if (valores.length) {
        try {
          await guardarValoresCampos({
            data: { proceso: "PEDIDOS", referencia: String(doc.id), valores },
          });
        } catch {
          toast.error("El documento se guardó, pero no se pudieron guardar los campos personalizados");
        }
      }
      toast.success(
        opciones.facturar
          ? `Factura ${doc.ncf} guardada`
          : editando
            ? `Pedido ${doc.id} actualizado`
            : `Pedido ${doc.id} guardado`,
      );
      void qc.invalidateQueries({ queryKey: ["factura", doc.id] });
      void qc.invalidateQueries({ queryKey: ["facturas"] });
      void qc.invalidateQueries({ queryKey: ["secuencias"] });
      void qc.invalidateQueries({ queryKey: ["resumen"] });
      void qc.invalidateQueries({ queryKey: ["valores-campos"] });
      const buscar: { imprimir?: boolean; enviar?: string } = {};
      if (opciones.imprimir) buscar.imprimir = true;
      if (enviarCliente && correoCliente.trim()) buscar.enviar = correoCliente.trim();
      void navigate({
        to: "/facturas/$id",
        params: { id: String(doc.id) },
        search: buscar,
      });
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo guardar el documento"),
  });

  const actualizar = (i: number, cambios: Partial<LineaEntrada>) =>
    setLineas((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...cambios } : l)));

  const seleccionarItem = (i: number, valor: string) => {
    const item = items.find((x) => String(x.id) === valor);
    if (!item) return;
    actualizar(i, {
      item_id: item.id,
      codigo: item.codigo,
      descripcion: item.descripcion,
      precio: item.precio,
      tasa_itbis: item.tasa_itbis,
    });
  };

  const enviar = (facturar: boolean, imprimir = false) => {
    if (!clienteId) { toast.error("Selecciona un cliente"); return; }
    if (enviarCliente && !correoCliente.trim().includes("@")) {
      toast.error("Escribe el correo del cliente o desmarca el envío");
      return;
    }
    if (!esDOP && (!tasa || tasa <= 0)) {
      toast.error("Indica la tasa de cambio a aplicar");
      return;
    }
    if (!lineas.length) { toast.error("Agrega al menos una línea"); return; }
    for (const l of lineas) {
      if (!l.descripcion.trim()) { toast.error("Cada línea necesita una descripción"); return; }
      if (l.cantidad <= 0) { toast.error("La cantidad debe ser mayor que cero"); return; }
    }
    if (cobrado > totales.total + 0.01) {
      toast.error("Los cobros superan el total del pedido");
      return;
    }
    // El NCF sólo se necesita al convertir el pedido en factura.
    if (facturar && (!secuencia || !secuencia.activa || secuencia.proximo > secuencia.hasta))
      { toast.error(`No hay NCF ${tipo} disponible. Revisa las secuencias.`); return; }
    guardar.mutate({ facturar, imprimir });
  };

  const lista = (opciones: { id: string; nombre: string }[] | undefined) => opciones ?? [];

  return (
    <div>
      <PageHeader
        titulo={editando ? `Editar pedido ${pedidoId}` : "Nuevo pedido"}
        descripcion={
          editando
            ? "Modifica los datos y las líneas del pedido; el NCF se asigna al facturar."
            : "Guarda el pedido y conviértelo en factura cuando quieras; el NCF se asigna al facturar."
        }
        acciones={
          <CamposPersonalizados
            proceso="PEDIDOS"
            valores={camposValores}
            onCambiar={setCamposValores}
          />
        }
      />

      {editando && cargandoPedido && (
        <div className="mb-4 border border-border bg-muted/35 px-4 py-3 text-sm text-muted-foreground">
          Cargando los datos del pedido {pedidoId}…
        </div>
      )}
      {editando && errorPedido && (
        <div className="mb-4 flex items-center justify-between gap-3 border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>No se pudieron cargar los datos del pedido {pedidoId}.</span>
          <Button type="button" size="sm" variant="outline" onClick={() => void reintentarPedido()}>
            Reintentar
          </Button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Datos del cliente</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div>
              <Label>Cliente</Label>
              <SelectorBuscable
                opciones={opcionesClientes}
                valor={clienteId}
                placeholder="Selecciona un cliente"
                placeholderBusqueda="Escribe código, nombre o RNC…"
                vacio="Sin clientes que coincidan"
                onSeleccionar={(v) => {
                  setClienteId(v);
                  setCorreoCliente("");
                  const c = clientes.find((x) => String(x.id) === v);
                  if (c) {
                    setTipo(c.tipo_ncf);
                    setDias(c.dias_credito);
                    if (c.vendedor_id) setVendedor(String(c.vendedor_id));
                  }
                }}
              />
            </div>
            <div className="grid gap-1 text-sm">
              <p>
                <span className="text-muted-foreground">RNC/Cédula: </span>
                {cliente?.rnc || "—"}
              </p>
              <p>
                <span className="text-muted-foreground">Dirección: </span>
                {cliente?.direccion || "—"}
              </p>
              <p>
                <span className="text-muted-foreground">Teléfono: </span>
                {cliente?.telefono || "—"}
              </p>
              <p>
                <span className="text-muted-foreground">Crédito disponible: </span>
                {cliente?.monto_credito ? dop(cliente.monto_credito) : "—"}
              </p>
            </div>
            <div className="rounded-md border border-border p-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="enviar-correo"
                  checked={enviarCliente}
                  onCheckedChange={(v) => setEnviarCliente(v === true)}
                />
                <Label htmlFor="enviar-correo" className="text-sm font-normal">
                  Enviar el documento al cliente al guardar
                </Label>
              </div>
              {enviarCliente ? (
                <div className="mt-2">
                  <Label htmlFor="correo-cliente">Correo del cliente</Label>
                  <Input
                    id="correo-cliente"
                    type="email"
                    value={correoCliente}
                    placeholder="cliente@correo.com"
                    onChange={(e) => setCorreoCliente(e.target.value)}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Precargado con el correo del cliente; puedes editarlo antes de guardar.
                  </p>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Datos del pedido</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="fecha">Emisión</Label>
              <Input
                id="fecha"
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="dias">Condiciones (días)</Label>
              <Input
                id="dias"
                type="number"
                min={0}
                max={365}
                value={dias}
                onChange={(e) => setDias(Math.max(0, Number(e.target.value) || 0))}
              />
              <p className="mt-1 text-xs text-muted-foreground">Vence el {sumarDias(fecha, dias)}</p>
            </div>
            <div>
              <Label>Moneda</Label>
              <Select
                value={moneda}
                onValueChange={(v) => {
                  setMoneda(v);
                  if (v.toUpperCase() === "DOP") setTasa(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {lista(listas?.monedas).map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.id} — {m.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="tasa">Tasa de cambio a aplicar</Label>
              <Input
                id="tasa"
                type="number"
                min={0}
                step="0.0001"
                value={tasa}
                disabled={esDOP}
                onChange={(e) => setTasa(Number(e.target.value) || 0)}
              />
            </div>
            <div>
              <Label>Vendedor</Label>
              <Select value={vendedor} onValueChange={setVendedor}>
                <SelectTrigger>
                  <SelectValue placeholder="Sin vendedor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN}>Sin especificar</SelectItem>
                  {lista(listas?.vendedores).map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Técnico</Label>
              <Select value={tecnico} onValueChange={setTecnico}>
                <SelectTrigger>
                  <SelectValue placeholder="Sin técnico" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN}>Sin especificar</SelectItem>
                  {lista(listas?.tecnicos).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo de comprobante</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as TipoNCF)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_NCF.map((t) => (
                    <SelectItem key={t.codigo} value={t.codigo}>
                      {t.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                {secuencia
                  ? `Próximo: ${formatearNCF(tipo, secuencia.proximo)} · ${Math.max(
                      0,
                      secuencia.hasta - secuencia.proximo + 1,
                    )} disponibles`
                  : "Sin secuencia configurada"}
              </p>
            </div>
            <div className="flex items-end gap-2 pb-2">
              <Checkbox
                id="incluye"
                checked={incluyeItbis}
                onCheckedChange={(v) => setIncluyeItbis(v === true)}
              />
              <Label htmlFor="incluye" className="text-sm font-normal">
                El precio incluye ITBIS
              </Label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Referencias</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div>
              <Label>Cotización</Label>
              <SelectorBuscable
                opciones={opcionesCotizaciones}
                valor={cotizacion}
                placeholder="Buscar cotización por número o cliente"
                placeholderBusqueda="Escribe número de cotización o cliente…"
                vacio="Sin cotizaciones que coincidan"
                onSeleccionar={(v) => {
                  setCotizacion(v);
                  traerCotizacion.mutate(Number(v));
                }}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {traerCotizacion.isPending
                  ? "Trayendo datos de la cotización…"
                  : cotizacion
                    ? `Cotización ${cotizacion} vinculada al pedido`
                    : "Al elegir una cotización se copian su cliente, moneda y líneas."}
              </p>
              {cotizacion ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-1 px-0"
                  onClick={() => setCotizacion("")}
                >
                  Quitar cotización
                </Button>
              ) : null}
            </div>

            <div>
              <Label htmlFor="oc">Orden cliente</Label>
              <Input
                id="oc"
                value={ordenCliente}
                maxLength={10}
                onChange={(e) => setOrdenCliente(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="ov">Orden servicio / vendedor</Label>
              <Input
                id="ov"
                value={ordenVendedor}
                maxLength={10}
                onChange={(e) => setOrdenVendedor(e.target.value)}
              />
            </div>
            <div>
              <Label>Almacén</Label>
              <Select value={almacen} onValueChange={setAlmacen}>
                <SelectTrigger>
                  <SelectValue placeholder="Predeterminado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN}>Predeterminado</SelectItem>
                  {lista(listas?.almacenes).map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Sucursal</Label>
              <Select value={sucursal} onValueChange={setSucursal}>
                <SelectTrigger>
                  <SelectValue placeholder="Predeterminada" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN}>Predeterminada</SelectItem>
                  {lista(listas?.sucursales).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Departamento</Label>
              <Select value={departamento} onValueChange={setDepartamento}>
                <SelectTrigger>
                  <SelectValue placeholder="Sin departamento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN}>Sin especificar</SelectItem>
                  {lista(listas?.departamentos).map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {lista(listas?.proyectos).length > 0 && (
              <div>
                <Label>Proyecto</Label>
                <Select value={proyecto} onValueChange={setProyecto}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sin proyecto" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SIN}>Sin especificar</SelectItem>
                    {lista(listas?.proyectos).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Detalle del producto o servicio</CardTitle>
          <div className="flex items-center gap-2">
            <DescuentoGlobal
              cantidadLineas={lineas.length}
              onAplicar={(pct) =>
                setLineas((p) => p.map((l) => ({ ...l, descuento_pct: pct })))
              }
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLineas((p) => [...p, { ...lineaVacia }])}
            >
              <Plus className="size-4" /> Agregar línea
            </Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table className="min-w-[1080px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-52 min-w-52">Código / ítem</TableHead>
                <TableHead className="w-52 min-w-52">Producto</TableHead>
                <TableHead className="w-24 min-w-24">Cant.</TableHead>
                <TableHead className="w-24 min-w-24">Oferta</TableHead>
                <TableHead className="w-32 min-w-32">Precio</TableHead>
                <TableHead className="w-24 min-w-24">Desc. %</TableHead>
                <TableHead className="w-28 min-w-28">ITBIS</TableHead>
                <TableHead className="text-right">Sub-total</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lineas.map((l, i) => {
                const precioNeto = incluyeItbis
                  ? l.precio / (1 + (l.tasa_itbis || 0) / 100)
                  : l.precio;
                const importe = l.cantidad * precioNeto * (1 - l.descuento_pct / 100);
                return (
                  <Fragment key={i}>
                  <TableRow className="border-b-0">
                    <TableCell>
                      <SelectorBuscable
                        opciones={opcionesItems}
                        valor={l.item_id ? String(l.item_id) : ""}
                        placeholder="Buscar producto"
                        placeholderBusqueda="Escribe código o nombre…"
                        vacio="Sin productos que coincidan"
                        onSeleccionar={(v) => seleccionarItem(i, v)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={l.descripcion}
                        maxLength={200}
                        onChange={(e) => actualizar(i, { descripcion: e.target.value })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        step="1"
                        className="px-2 text-right tabular"
                        value={l.cantidad}
                        onChange={(e) =>
                          actualizar(i, { cantidad: Math.round(Number(e.target.value) || 0) })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        className="px-2 text-right tabular"
                        value={l.oferta ?? 0}
                        onChange={(e) => actualizar(i, { oferta: Number(e.target.value) || 0 })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        className="px-2 text-right tabular"
                        value={l.precio}
                        onChange={(e) => actualizar(i, { precio: Number(e.target.value) || 0 })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        className="px-2 text-right tabular"
                        value={l.descuento_pct}
                        onChange={(e) =>
                          actualizar(i, {
                            descuento_pct: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={String(l.tasa_itbis)}
                        onValueChange={(v) => actualizar(i, { tasa_itbis: Number(v) })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="18">18%</SelectItem>
                          <SelectItem value="16">16%</SelectItem>
                          <SelectItem value="0">0%</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="tabular text-right">{money(importe, moneda)}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setLineas((p) => p.filter((_, idx) => idx !== i))}
                        disabled={lineas.length === 1}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={9} className="pt-0">
                      <Input
                        value={l.observacion ?? ""}
                        maxLength={250}
                        placeholder="Observación o comentario de este artículo (opcional)"
                        className="h-8 text-xs"
                        onChange={(e) => actualizar(i, { observacion: e.target.value })}
                      />
                    </TableCell>
                  </TableRow>
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="mt-4">
        <AsientoContable
          lineas={asiento}
          onCambiar={setAsiento}
          advertencias={propuesta?.advertencias ?? []}
          cargando={calculandoAsiento}
          titulo="Cuentas contables de la venta"
          nota="Se toman de la clasificación del producto y del cliente. El asiento se registra al guardar la factura; puedes cambiar las cuentas antes."
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Forma de pago y observaciones</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="efec">Efectivo</Label>
              <Input
                id="efec"
                type="number"
                min={0}
                step="0.01"
                value={efectivo}
                onChange={(e) => setEfectivo(Number(e.target.value) || 0)}
              />
            </div>
            <div>
              <Label htmlFor="tarj">Tarjeta / Transferencia</Label>
              <Input
                id="tarj"
                type="number"
                min={0}
                step="0.01"
                value={tarjeta}
                onChange={(e) => setTarjeta(Number(e.target.value) || 0)}
              />
            </div>
            <div>
              <Label htmlFor="cheq">Cheque</Label>
              <Input
                id="cheq"
                type="number"
                min={0}
                step="0.01"
                value={cheque}
                onChange={(e) => setCheque(Number(e.target.value) || 0)}
              />
            </div>
            <div>
              <Label htmlFor="tran">Transferencia bancaria</Label>
              <Input
                id="tran"
                type="number"
                min={0}
                step="0.01"
                value={transferencia}
                onChange={(e) => setTransferencia(Number(e.target.value) || 0)}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="notas">Observaciones generales</Label>
              <Textarea
                id="notas"
                value={notas}
                maxLength={300}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Referencias, condiciones, instrucciones de entrega…"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Totales</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Sub-total</span>
              <span className="tabular">{money(totales.bruto, moneda)}</span>
            </div>
            {totales.descuento > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Descuentos</span>
                <span className="tabular">-{money(totales.descuento, moneda)}</span>
              </div>
            )}
            {totales.itbisPorTasa.map((t) => (
              <div key={t.tasa} className="flex justify-between">
                <span className="text-muted-foreground">
                  ITBIS {t.tasa}% sobre {money(t.base, moneda)}
                </span>
                <span className="tabular">{money(t.itbis, moneda)}</span>
              </div>
            ))}
            <div className="flex justify-between border-t pt-2 text-base font-semibold">
              <span>Total</span>
              <span className="tabular">{money(totales.total, moneda)}</span>
            </div>
            {!esDOP && (
              <p className="text-xs text-muted-foreground">
                Equivale a {dop(enDOP(totales.total, tasa))} a la tasa {tasa || 0}
              </p>
            )}
            <div className="flex justify-between pt-2">
              <span className="text-muted-foreground">Cobrado</span>
              <span className="tabular">{money(cobrado, moneda)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Pendiente</span>
              <span className="tabular">
                {money(Math.max(0, totales.total - cobrado), moneda)}
              </span>
            </div>
            <div className="mt-4 space-y-2">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => enviar(false)}
                disabled={guardar.isPending}
              >
                <Save className="mr-2 h-4 w-4" />
                {editando ? "Guardar cambios" : "Guardar pedido"}
              </Button>
              <Button
                className="w-full"
                onClick={() => enviar(true)}
                disabled={guardar.isPending}
              >
                <FileText className="mr-2 h-4 w-4" />
                Guardar factura
              </Button>
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => enviar(true, true)}
                disabled={guardar.isPending}
              >
                <Printer className="mr-2 h-4 w-4" />
                Imprimir y guardar factura
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
