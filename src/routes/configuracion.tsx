import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { guardarEmpresa, obtenerEmpresa, obtenerEstadoConexion } from "@/lib/erp.functions";
import { PUENTE_PHP } from "@/lib/puente-php";
import { rncValido, type Empresa } from "@/lib/erp-types";

export const Route = createFileRoute("/configuracion")({
  head: () => ({
    meta: [
      { title: "Configuración de la empresa — ERP Contable RD" },
      {
        name: "description",
        content: "Datos fiscales de la empresa que aparecen en cada factura emitida.",
      },
      { property: "og:title", content: "Configuración de la empresa — ERP Contable RD" },
      { property: "og:description", content: "Datos fiscales impresos en las facturas." },
    ],
  }),
  component: Configuracion,
});

const vacio: Empresa = { nombre: "", rnc: "", direccion: "", telefono: "", email: "" };

function Configuracion() {
  const qc = useQueryClient();
  const [form, setForm] = useState<Empresa>(vacio);

  const { data } = useQuery({ queryKey: ["empresa"], queryFn: () => obtenerEmpresa() });
  const { data: conexion } = useQuery({
    queryKey: ["estado-conexion"],
    queryFn: () => obtenerEstadoConexion(),
  });

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const mutar = useMutation({
    mutationFn: (e: Empresa) => guardarEmpresa({ data: e }),
    onSuccess: () => {
      toast.success("Datos guardados");
      void qc.invalidateQueries({ queryKey: ["empresa"] });
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo guardar"),
  });

  const enviar = () => {
    if (form.nombre.trim().length < 2) { toast.error("Escribe la razón social"); return; }
    if (!rncValido(form.rnc)) { toast.error("RNC inválido (9 dígitos)"); return; }
    mutar.mutate({ ...form, rnc: form.rnc.replace(/\D/g, "") });
  };

  return (
    <div>
      <PageHeader
        titulo="Configuración"
        descripcion="Datos fiscales que se imprimen en las facturas"
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Empresa</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="nombre">Razón social</Label>
              <Input
                id="nombre"
                value={form.nombre}
                maxLength={160}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="rnc">RNC</Label>
              <Input
                id="rnc"
                value={form.rnc}
                maxLength={15}
                onChange={(e) => setForm({ ...form, rnc: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="tel">Teléfono</Label>
              <Input
                id="tel"
                value={form.telefono}
                maxLength={30}
                onChange={(e) => setForm({ ...form, telefono: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="dir">Dirección</Label>
              <Input
                id="dir"
                value={form.direccion}
                maxLength={240}
                onChange={(e) => setForm({ ...form, direccion: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="email">Correo</Label>
              <Input
                id="email"
                value={form.email}
                maxLength={160}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Button onClick={enviar} disabled={mutar.isPending}>
                {mutar.isPending ? "Guardando…" : "Guardar cambios"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Almacenamiento de datos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">
                {conexion?.modo === "mysql" ? "Servidor conectado" : "Modo demostración"}
              </span>
            </p>
            {conexion?.modo === "mysql" ? (
              <>
                <p>
                  La aplicación usa las tablas ya existentes de tu sistema: clientes, ítems,
                  facturas y secuencias NCF se leen y guardan directamente en ellas. No se crean
                  tablas nuevas en tu base de datos.
                </p>
                {(conexion.tablasFaltantes?.length ?? 0) > 0 ? (
                  <p className="rounded-md bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
                    No se encontraron estas tablas de tu sistema:{" "}
                    <span className="font-mono">{conexion.tablasFaltantes!.join(", ")}</span>.
                    Verifica que estás apuntando a la base de datos correcta.
                  </p>
                ) : (
                  <p className="text-xs">Tablas de tu sistema verificadas: todo en orden.</p>
                )}
              </>
            ) : (
              <>
                <p>
                  Estás viendo datos de ejemplo. Para guardar de forma permanente, agrega las
                  credenciales de tu servidor como valores protegidos del proyecto:
                </p>
                <ul className="list-inside list-disc font-mono text-xs">
                  <li>MYSQL_HOST</li>
                  <li>MYSQL_PORT</li>
                  <li>MYSQL_DATABASE</li>
                  <li>MYSQL_USER</li>
                  <li>MYSQL_PASSWORD</li>
                  <li>MYSQL_SSL</li>
                </ul>
                <p>
                  Al conectar, la aplicación trabajará sobre las tablas que ya existen en tu
                  sistema (clientes, ítems, facturas, secuencias NCF); no crea tablas nuevas.
                </p>
              </>
            )}
            <p>
              En el sitio publicado la conexión directa al servidor no está permitida. Sube el
              archivo puente a tu servidor y guarda{" "}
              <span className="font-mono text-xs">MYSQL_BRIDGE_URL</span> y{" "}
              <span className="font-mono text-xs">MYSQL_BRIDGE_TOKEN</span>.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const blob = new Blob([PUENTE_PHP], { type: "application/octet-stream" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "puente-mysql.php";
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  URL.revokeObjectURL(url);
                }}
              >
                Descargar archivo puente
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={async () => {
                  await navigator.clipboard.writeText(PUENTE_PHP);
                  toast.success("Contenido copiado");
                }}
              >
                Copiar contenido
              </Button>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-foreground">
                Vista previa de puente-mysql.php
              </p>
              <pre className="max-h-72 overflow-auto rounded-md border bg-muted/50 p-3 font-mono text-[11px] leading-relaxed text-foreground">
                {PUENTE_PHP}
              </pre>
            </div>
            {conexion?.error ? (
              <p className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
                Último detalle: {conexion.error}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
