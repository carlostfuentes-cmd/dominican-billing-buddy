// Dibuja una plantilla del diseñador con datos reales o de muestra.
// Se usa tanto en la vista previa del diseñador como en la impresión.

import {
  BANDAS,
  CAMPOS_SISTEMA,
  medidasPapel,
  valorElemento,
  type BandaPlantilla,
  type DatosDocumento,
  type ElementoPlantilla,
  type Plantilla,
} from "@/lib/plantillas-tipos";

/** Datos de muestra tomados de los ejemplos del catálogo de campos. */
export function datosMuestra(lineas = 3): DatosDocumento {
  const campos: Record<string, string> = {};
  const linea: Record<string, string> = {};
  for (const c of CAMPOS_SISTEMA) {
    if (c.linea) linea[c.id] = c.muestra;
    else campos[c.id] = c.muestra;
  }
  return {
    campos,
    lineas: Array.from({ length: lineas }, (_, i) => ({
      ...linea,
      "linea.numero": String(i + 1),
    })),
  };
}

export function estiloElemento(el: ElementoPlantilla): React.CSSProperties {
  const base: React.CSSProperties = {
    position: "absolute",
    left: `${el.x}mm`,
    top: `${el.y}mm`,
    width: `${el.ancho}mm`,
  };
  if (el.tipo === "linea") {
    return { ...base, borderTop: `${el.grosor ?? 0.3}mm solid ${el.color}` };
  }
  if (el.tipo === "caja") {
    return {
      ...base,
      height: `${el.alto}mm`,
      border: `${el.grosor ?? 0.3}mm solid ${el.color}`,
      background: el.fondo || "transparent",
    };
  }
  return {
    ...base,
    minHeight: `${el.alto}mm`,
    fontSize: `${el.tamano}pt`,
    lineHeight: 1.15,
    fontWeight: el.negrita ? 700 : 400,
    fontStyle: el.italica ? "italic" : "normal",
    textAlign: el.alineacion,
    color: el.color,
    overflow: "hidden",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  };
}

function Elemento({
  el,
  datos,
  linea,
}: {
  el: ElementoPlantilla;
  datos: DatosDocumento;
  linea?: Record<string, string> | undefined;
}) {
  const estilo = estiloElemento(el);
  if (el.tipo === "linea" || el.tipo === "caja") return <div style={estilo} />;
  if (el.tipo === "imagen")
    return el.url ? (
      <img
        src={el.url}
        alt=""
        style={{ ...estilo, height: `${el.alto}mm`, objectFit: "contain" }}
      />
    ) : (
      <div style={{ ...estilo, height: `${el.alto}mm`, border: "0.2mm dashed #94a3b8" }} />
    );
  return <div style={estilo}>{valorElemento(el, datos, linea)}</div>;
}

function Banda({
  banda,
  datos,
  linea,
}: {
  banda: BandaPlantilla;
  datos: DatosDocumento;
  linea?: Record<string, string> | undefined;
}) {
  return (
    <div style={{ position: "relative", height: `${banda.alto}mm` }}>
      {banda.elementos.map((el) => (
        <Elemento key={el.id} el={el} datos={datos} linea={linea} />
      ))}
    </div>
  );
}

export function RenderPlantilla({
  plantilla,
  datos,
  zoom = 1,
}: {
  plantilla: Plantilla;
  datos: DatosDocumento;
  zoom?: number;
}) {
  const papel = medidasPapel(plantilla.papel);
  const orden = BANDAS.map((b) => b.id);
  const bandas = [...plantilla.bandas]
    .filter((b) => b.visible)
    .sort((a, b) => orden.indexOf(a.tipo) - orden.indexOf(b.tipo));

  return (
    <div
      className="plantilla-papel bg-white text-black shadow-sm"
      style={{
        width: `${papel.ancho}mm`,
        minHeight: `${papel.alto}mm`,
        paddingTop: `${plantilla.margen_superior}mm`,
        paddingBottom: `${plantilla.margen_inferior}mm`,
        paddingLeft: `${plantilla.margen_izquierdo}mm`,
        paddingRight: `${plantilla.margen_derecho}mm`,
        fontFamily: "Helvetica, Arial, sans-serif",
        transform: zoom === 1 ? undefined : `scale(${zoom})`,
        transformOrigin: "top left",
      }}
    >
      {bandas.map((banda) =>
        banda.tipo === "detalle" ? (
          <div key={banda.tipo}>
            {datos.lineas.map((l, i) => (
              <Banda key={i} banda={banda} datos={datos} linea={l} />
            ))}
          </div>
        ) : (
          <Banda key={banda.tipo} banda={banda} datos={datos} />
        ),
      )}
    </div>
  );
}
