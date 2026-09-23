import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Printer } from "lucide-react";

import { PageHeader } from "@/components/AppShell";
import { usePermisoPantalla, useSesion } from "@/components/Sesion";
import { Button } from "@/components/ui/button";
import { obtenerComprobanteCaja } from "@/lib/cajachica.functions";
import { fechaCorta, money, type LineaAsiento } from "@/lib/erp-types";
import { obtenerEmpresa } from "@/lib/erp.functions";
import { montoEnLetras } from "@/lib/plantillas-datos";

export const Route = createFileRoute("/caja-chica/$id")({
  validateSearch: (s: Record<string, unknown>) => ({
    imprimir: s["imprimir"] === true || s["imprimir"] === "true",
  }),
  head: () => ({
    meta: [
      { title: "Comprobante imprimible de caja chica — ERP Contable RD" },
      {
        name: "description",
        content: "Vista imprimible del comprobante de caja chica y su detalle contable.",
      },
      { property: "og:title", content: "Comprobante de caja chica — ERP Contable RD" },
      { property: "og:description", content: "Comprobante imprimible con monto, concepto y asiento contable." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ComprobanteCajaImprimible,
});

function ComprobanteCajaImprimible() {
  const { id } = useParams({ from: "/caja-chica/$id" });
  const { imprimir } = Route.useSearch();
  const { sesion } = useSesion();
  const { puedeImprimir } = usePermisoPantalla();
  const idNumero = Number(id);
  const yaImprimio = useRef(false);
  const [momentoImpresion, setMomentoImpresion] = useState("");

  const {
    data: comprobante,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["comprobante-caja", idNumero],
    queryFn: () => obtenerComprobanteCaja({ data: { id: idNumero } }),
    enabled: Number.isFinite(idNumero) && idNumero > 0,
    retry: 1,
  });
  const { data: empresa } = useQuery({
    queryKey: ["empresa"],
    queryFn: () => obtenerEmpresa(),
    retry: 1,
  });

  useEffect(() => {
    setMomentoImpresion(
      new Intl.DateTimeFormat("es-DO", {
        dateStyle: "medium",
        timeStyle: "medium",
      }).format(new Date()),
    );
  }, []);

  useEffect(() => {
    if (!imprimir || !comprobante || !empresa || yaImprimio.current) return;
    yaImprimio.current = true;
    const temporizador = window.setTimeout(() => window.print(), 450);
    return () => window.clearTimeout(temporizador);
  }, [imprimir, comprobante, empresa]);

  if (isLoading)
    return <p className="text-sm text-muted-foreground">Cargando comprobante…</p>;

  if (isError)
    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <h1 className="text-lg font-semibold">No pudimos cargar el comprobante</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {error instanceof Error ? error.message : "El servidor de datos no respondió."}
        </p>
        <Button className="mt-4" onClick={() => void refetch()}>
          Reintentar
        </Button>
      </div>
    );

  if (!comprobante)
    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <h1 className="text-lg font-semibold">Comprobante no encontrado</h1>
        <Button className="mt-4" variant="outline" asChild>
          <Link to="/caja-chica">Volver a caja chica</Link>
        </Button>
      </div>
    );

  const receptor = comprobante.beneficiario || empresa?.nombre || "RECIBIDO CONFORME";
  const identificacion = comprobante.rnc || comprobante.cedula;
  const lineas: LineaAsiento[] = comprobante.asiento.length
    ? comprobante.asiento
    : [
        {
          cuenta: comprobante.cuenta_gasto,
          descripcion: comprobante.descripcion,
          debito: comprobante.total,
          credito: 0,
        },
      ];

  return (
    <>
      <style>{"@page { size: letter landscape; margin: 10mm; }"}</style>
      <PageHeader
        titulo={`Comprobante de caja chica ${comprobante.id}`}
        descripcion="Vista lista para imprimir o guardar como PDF."
        acciones={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link to="/caja-chica">
                <ArrowLeft className="size-4" /> Volver
              </Link>
            </Button>
            {puedeImprimir ? (
              <Button onClick={() => window.print()}>
                <Printer className="size-4" /> Imprimir / PDF
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="overflow-x-auto pb-3">
        <article className="petty-voucher print-area mx-auto flex min-h-[178mm] w-[257mm] flex-col border-2 p-[4mm] font-sans">
          <header className="flex items-end justify-between border-b-2 px-1 pb-2">
            <h1 className="text-xl font-bold uppercase">{empresa?.nombre || "Empresa"}</h1>
            <h2 className="text-lg font-bold uppercase">
              Comprobante de caja chica # {comprobante.id}
            </h2>
          </header>

          <section className="flex items-center justify-between px-3 py-5 text-lg">
            <p>
              <span className="mr-2 uppercase">Fecha</span>
              {fechaCorta(comprobante.fecha)}
            </p>
            <p className="flex items-center gap-3">
              <span className="uppercase">Por</span>
              <strong className="voucher-amount px-5 py-2 text-xl">{money(comprobante.total)}</strong>
            </p>
          </section>

          <section className="px-3 py-3 text-[17px] leading-relaxed uppercase">
            Yo (nosotros) <strong>{receptor},</strong> he(hemos) recibido de{" "}
            <strong>{empresa?.nombre || "la empresa"}</strong> la suma de{" "}
            <strong>{montoEnLetras(comprobante.total)} pesos dominicanos</strong> por concepto de{" "}
            {comprobante.descripcion}
            {comprobante.referencia ? ` (Ref. # ${comprobante.referencia})` : ""}.
          </section>

          {comprobante.ncf ? (
            <p className="px-3 pb-3 text-sm">
              <strong>NCF:</strong> {comprobante.ncf}
              {comprobante.ncf_tipo ? ` · ${comprobante.ncf_tipo}` : ""}
            </p>
          ) : null}

          <section className="grid grid-cols-[1.45fr_1fr] gap-14 px-3 pt-2">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b-2 text-left uppercase">
                  <th className="pb-1 font-medium">Detalle contable</th>
                  <th className="pb-1 text-right font-medium">Débitos</th>
                  <th className="pb-1 text-right font-medium">Créditos</th>
                </tr>
              </thead>
              <tbody>
                {lineas.map((linea, indice) => (
                  <tr key={`${linea.cuenta}-${indice}`} className="border-b">
                    <td className="py-1.5 pr-3">
                      {linea.cuenta_nombre || linea.descripcion || linea.cuenta}
                      {linea.cuenta ? <span className="ml-2 text-xs">({linea.cuenta})</span> : null}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{money(linea.debito)}</td>
                    <td className="py-1.5 text-right tabular-nums">{money(linea.credito)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="pt-1 text-center text-sm uppercase">
              <div className="mb-2 border-t-2" />
              <p>Recibido conforme</p>
              <p className="font-medium">{receptor}</p>
              {identificacion ? <p>RNC/Cédula: {identificacion}</p> : null}
            </div>
          </section>

          <footer className="mt-auto grid grid-cols-3 border-t-2 px-2 pt-2 text-xs italic">
            <p>
              Elaborado por: <strong className="uppercase">{sesion.nombre}</strong>
            </p>
            <p className="text-center">{comprobante.caja}</p>
            <p className="text-right">Fecha: {momentoImpresion}</p>
          </footer>
        </article>
      </div>
    </>
  );
}