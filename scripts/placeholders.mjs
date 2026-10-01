/**
 * Genera imagenes de relleno con aspecto de preparacion H&E para las placas
 * cuya lamina todavia no existe, de modo que el visor se pueda probar antes
 * de exportar nada desde Canva.
 *
 * Deja constancia de lo generado en public/placas/.placeholders.json: asi el
 * optimizador sabe que ese WebP es de mentira y debe sustituirlo en cuanto
 * aparezca la imagen de verdad, sin fiarse de las fechas de los archivos.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const ANCHO = 2000;
const ALTO = 1500;
const MANIFIESTO = join('public', 'placas', '.placeholders.json');

/* ------------------------------ Manifiesto ------------------------------- */

export function leerManifiesto() {
  if (!existsSync(MANIFIESTO)) return [];
  try {
    const datos = JSON.parse(readFileSync(MANIFIESTO, 'utf8'));
    return Array.isArray(datos) ? datos : [];
  } catch {
    return [];
  }
}

export function escribirManifiesto(bases) {
  writeFileSync(MANIFIESTO, JSON.stringify([...new Set(bases)].sort(), null, 2) + '\n', 'utf8');
}

/** ¿Este WebP lo generamos nosotros como relleno? */
export function esPlaceholder(base) {
  return leerManifiesto().includes(base);
}

/** Deja de considerarse relleno: ya hay una imagen real. */
export function quitarDelManifiesto(base) {
  escribirManifiesto(leerManifiesto().filter((b) => b !== base));
}

/* ------------------------------- Dibujo ---------------------------------- */

/** Generador pseudoaleatorio determinista: el mismo id da siempre la misma imagen. */
function semilla(texto) {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 100000) / 100000;
  };
}

function svgPlaceholder(id, titulo) {
  const r = semilla(id);
  const nucleos = [];
  for (let i = 0; i < 900; i++) {
    const cx = (r() * ANCHO).toFixed(0);
    const cy = (r() * ALTO).toFixed(0);
    const rx = (4 + r() * 9).toFixed(1);
    const ry = (3 + r() * 8).toFixed(1);
    const rot = (r() * 180).toFixed(0);
    const op = (0.35 + r() * 0.5).toFixed(2);
    nucleos.push(
      `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" transform="rotate(${rot} ${cx} ${cy})" fill="#2E2566" opacity="${op}"/>`
    );
  }
  const fibras = [];
  for (let i = 0; i < 70; i++) {
    const y = (r() * ALTO).toFixed(0);
    const amp = (20 + r() * 60).toFixed(0);
    const w = (2 + r() * 5).toFixed(1);
    fibras.push(
      `<path d="M -50 ${y} Q ${ANCHO / 3} ${Number(y) - amp} ${ANCHO / 2} ${y} T ${ANCHO + 50} ${y}" stroke="#D9497A" stroke-width="${w}" fill="none" opacity="0.3"/>`
    );
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ANCHO}" height="${ALTO}">
  <rect width="100%" height="100%" fill="#F6E6EC"/>
  <g>${fibras.join('')}</g>
  <g>${nucleos.join('')}</g>
  <rect width="100%" height="100%" fill="url(#vineta)"/>
  <defs>
    <radialGradient id="vineta" cx="50%" cy="50%" r="72%">
      <stop offset="55%" stop-color="#1A1233" stop-opacity="0"/>
      <stop offset="100%" stop-color="#1A1233" stop-opacity="0.35"/>
    </radialGradient>
  </defs>
  <g opacity="0.55">
    <rect x="40" y="40" width="760" height="86" rx="8" fill="#1A1233"/>
    <text x="64" y="97" font-family="sans-serif" font-size="42" fill="#F4F1F8">FALTA LA IMAGEN · ${titulo}</text>
  </g>
</svg>`;
}

/* ------------------------------ Generacion ------------------------------- */

/** Todas las imagenes que declaran las placas: [{ base, titulo }] */
export function imagenesDeclaradas() {
  const dir = join('src', 'content', 'placas');
  const salida = [];
  for (const archivo of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const placa = JSON.parse(readFileSync(join(dir, archivo), 'utf8'));
    const bases =
      Array.isArray(placa.imagenes) && placa.imagenes.length > 0
        ? placa.imagenes.map((i) => i.archivo)
        : [placa.id];
    for (const base of bases) salida.push({ base, titulo: placa.titulo ?? base });
  }
  return salida;
}

/**
 * Crea un placeholder por cada imagen declarada que no tenga WebP todavia.
 * Devuelve cuantos ha creado.
 */
export async function generarPlaceholdersFaltantes(destino, escribirVariantes) {
  const manifiesto = leerManifiesto();
  let creados = 0;

  for (const { base, titulo } of imagenesDeclaradas()) {
    const referencia = join(destino, `${base}--grande.webp`);
    if (existsSync(referencia)) continue;

    const svg = Buffer.from(svgPlaceholder(base, titulo));
    await escribirVariantes(sharp(svg, { density: 96 }), base, destino);
    manifiesto.push(base);
    creados++;
  }

  if (creados > 0) escribirManifiesto(manifiesto);
  return creados;
}
