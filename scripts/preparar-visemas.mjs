#!/usr/bin/env node
/**
 * npm run visemas -- <Nombre>
 *
 * Prepara las bocas de una caricatura que habla con lip-sync.
 *
 * Entrada: originales/avatares/<Nombre>/visemas/ con seis retratos del mismo
 * personaje, iguales salvo por la boca:
 *
 *   X.png  boca cerrada, en reposo (es la cara base)
 *   B.png  apertura leve
 *   C.png  apertura media
 *   D.png  apertura amplia (vocales abiertas)
 *   E.png  labios redondos (o, u)
 *   F.png  labiodental (f, v: dientes de arriba sobre el labio de abajo)
 *
 * Salida en public/avatares/<Nombre>/:
 *
 *   <Nombre>1.webp          la cara base (X) a 512 px; es la que se ve siempre
 *   visemas/B.webp ... F.webp  solo la zona de la boca, con transparencia y
 *                           borde difuminado, para ponerla encima de la base
 *   visemas/visemas.json    donde va cada boca sobre la base (en fracciones)
 *
 * Por que solo la boca: los retratos estan hechos con IA y, aunque la cara
 * coincide, el pelo, el contorno y la bata cambian un poco de uno a otro. Si
 * se cambiara la imagen entera, todo el retrato temblaria al hablar. Asi la
 * base no se mueve nunca y lo unico que cambia es la boca.
 *
 * Antes de recortar, cada retrato se alinea con la base: se busca el
 * desplazamiento que mejor encaja ojos y nariz (que no cambian al hablar), para
 * que la boca recortada caiga exactamente en su sitio.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const nombre = process.argv[2];
if (!nombre) {
  console.error('Uso: npm run visemas -- <Nombre>   (p. ej. npm run visemas -- Andrea)');
  process.exit(1);
}

const ORIGEN = join('originales', 'avatares', nombre, 'visemas');
const DESTINO = join('public', 'avatares', nombre);
const LADO = 512;
const BOCAS = ['B', 'C', 'D', 'E', 'F'];

/**
 * Zona donde se busca la boca, en fracciones del retrato: una elipse sobre la
 * parte baja de la cara. Es estrecha a proposito: justo fuera de la cara
 * empieza el pelo, que cambia de un retrato a otro y no es la boca.
 */
const ZONA_BOCA = { cx: 0.505, cy: 0.6, rx: 0.11, ry: 0.135 };
/** Zona con la que se alinea: ojos y nariz, que no se mueven al hablar. */
const ZONA_ALINEAR = { x0: 0.35, x1: 0.65, y0: 0.3, y1: 0.51 };
/** Cuanto puede estar corrido un retrato respecto de la base, en pixeles. */
const BUSQUEDA = 8;

for (const v of ['X', ...BOCAS]) {
  if (!existsSync(join(ORIGEN, `${v}.png`))) {
    console.error(`Falta ${join(ORIGEN, `${v}.png`)}`);
    process.exit(1);
  }
}

/** Retrato en RGB crudo, a su tamano original. */
async function leer(v) {
  const { data, info } = await sharp(join(ORIGEN, `${v}.png`))
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, ancho: info.width, alto: info.height };
}

const gris = (im, x, y) => {
  const i = (y * im.ancho + x) * 3;
  return im.data[i] * 0.299 + im.data[i + 1] * 0.587 + im.data[i + 2] * 0.114;
};

/** Desplazamiento entero (dx, dy) que mejor encaja `im` sobre `base`. */
function alinear(base, im) {
  const x0 = Math.round(base.ancho * ZONA_ALINEAR.x0);
  const x1 = Math.round(base.ancho * ZONA_ALINEAR.x1);
  const y0 = Math.round(base.alto * ZONA_ALINEAR.y0);
  const y1 = Math.round(base.alto * ZONA_ALINEAR.y1);
  let mejor = { dx: 0, dy: 0, error: Infinity };
  for (let dy = -BUSQUEDA; dy <= BUSQUEDA; dy++) {
    for (let dx = -BUSQUEDA; dx <= BUSQUEDA; dx++) {
      let error = 0;
      for (let y = y0; y < y1; y += 2) {
        for (let x = x0; x < x1; x += 2) {
          error += Math.abs(gris(base, x, y) - gris(im, x + dx, y + dy));
        }
      }
      if (error < mejor.error) mejor = { dx, dy, error };
    }
  }
  return mejor;
}

const base = await leer('X');
const { ancho, alto } = base;

// 1. Alinear cada boca con la base y medir hasta donde cambia la cara.
const alineadas = {};
let caja = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
const zx0 = Math.round(ancho * (ZONA_BOCA.cx - ZONA_BOCA.rx));
const zx1 = Math.round(ancho * (ZONA_BOCA.cx + ZONA_BOCA.rx));
const zy0 = Math.round(alto * (ZONA_BOCA.cy - ZONA_BOCA.ry));
const zy1 = Math.round(alto * (ZONA_BOCA.cy + ZONA_BOCA.ry));
const dentroDeZona = (x, y) =>
  ((x / ancho - ZONA_BOCA.cx) / ZONA_BOCA.rx) ** 2 +
    ((y / alto - ZONA_BOCA.cy) / ZONA_BOCA.ry) ** 2 <=
  1;

for (const v of BOCAS) {
  const im = await leer(v);
  if (im.ancho !== ancho || im.alto !== alto) {
    console.error(`${v}.png mide ${im.ancho}x${im.alto}; la base mide ${ancho}x${alto}`);
    process.exit(1);
  }
  const { dx, dy } = alinear(base, im);
  console.log(`  ${v}: corrido ${dx}, ${dy} px respecto de X`);
  // Se vuelve a pintar ya corrida, con el borde repetido.
  const corrida = Buffer.alloc(ancho * alto * 3);
  for (let y = 0; y < alto; y++) {
    const sy = Math.min(alto - 1, Math.max(0, y + dy));
    for (let x = 0; x < ancho; x++) {
      const sx = Math.min(ancho - 1, Math.max(0, x + dx));
      im.data.copy(corrida, (y * ancho + x) * 3, (sy * ancho + sx) * 3, (sy * ancho + sx) * 3 + 3);
    }
  }
  alineadas[v] = corrida;

  // Donde se aparta de la base dentro de la zona de la boca.
  for (let y = zy0; y < zy1; y++) {
    for (let x = zx0; x < zx1; x++) {
      if (!dentroDeZona(x, y)) continue;
      const i = (y * ancho + x) * 3;
      const d =
        (Math.abs(corrida[i] - base.data[i]) +
          Math.abs(corrida[i + 1] - base.data[i + 1]) +
          Math.abs(corrida[i + 2] - base.data[i + 2])) /
        3;
      if (d > 40) {
        caja = {
          x0: Math.min(caja.x0, x),
          y0: Math.min(caja.y0, y),
          x1: Math.max(caja.x1, x),
          y1: Math.max(caja.y1, y),
        };
      }
    }
  }
}

// 2. Mascara: una elipse que tapa todo lo que cambia (incluida la barbilla
//    cuando la boca se abre mucho), con el borde difuminado para que no se
//    note la costura.
const margen = Math.round(ancho * 0.02);
const difuminado = Math.round(ancho * 0.025);
const cx = (caja.x0 + caja.x1) / 2;
const cy = (caja.y0 + caja.y1) / 2;
const rx = (caja.x1 - caja.x0) / 2 + margen;
const ry = (caja.y1 - caja.y0) / 2 + margen;
const rect = {
  left: Math.max(0, Math.floor(cx - rx - difuminado)),
  top: Math.max(0, Math.floor(cy - ry - difuminado)),
};
rect.width = Math.min(ancho, Math.ceil(cx + rx + difuminado)) - rect.left;
rect.height = Math.min(alto, Math.ceil(cy + ry + difuminado)) - rect.top;

const svgMascara = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${rect.width}" height="${rect.height}">` +
    `<filter id="f" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${difuminado / 2}"/></filter>` +
    `<ellipse cx="${cx - rect.left}" cy="${cy - rect.top}" rx="${rx}" ry="${ry}" fill="#fff" filter="url(#f)"/></svg>`,
);
const mascara = await sharp(svgMascara).extractChannel(0).raw().toBuffer();

// 3. Escribir la base y cada boca recortada a la escala final.
const escala = LADO / ancho;
mkdirSync(join(DESTINO, 'visemas'), { recursive: true });

await sharp(base.data, { raw: { width: ancho, height: alto, channels: 3 } })
  .resize(LADO, LADO)
  .webp({ quality: 88 })
  .toFile(join(DESTINO, `${nombre}1.webp`));

const anchoFinal = Math.round(rect.width * escala);
const altoFinal = Math.round(rect.height * escala);
for (const v of BOCAS) {
  // Recorte RGB + la mascara como cuarto canal, armado a mano.
  const rgba = Buffer.alloc(rect.width * rect.height * 4);
  for (let y = 0; y < rect.height; y++) {
    for (let x = 0; x < rect.width; x++) {
      const o = ((rect.top + y) * ancho + rect.left + x) * 3;
      const d = (y * rect.width + x) * 4;
      rgba[d] = alineadas[v][o];
      rgba[d + 1] = alineadas[v][o + 1];
      rgba[d + 2] = alineadas[v][o + 2];
      rgba[d + 3] = mascara[y * rect.width + x];
    }
  }
  await sharp(rgba, { raw: { width: rect.width, height: rect.height, channels: 4 } })
    .resize(anchoFinal, altoFinal)
    .webp({ quality: 88, alphaQuality: 90 })
    .toFile(join(DESTINO, 'visemas', `${v}.webp`));
}

const fraccion = (n, total) => Math.round((n / total) * 1e5) / 1e5;
writeFileSync(
  join(DESTINO, 'visemas', 'visemas.json'),
  JSON.stringify(
    {
      bocas: BOCAS,
      x: fraccion(rect.left, ancho),
      y: fraccion(rect.top, alto),
      ancho: fraccion(rect.width, ancho),
      alto: fraccion(rect.height, alto),
    },
    null,
    2,
  ) + '\n',
);
console.log(
  `  ✓ ${nombre}: base ${LADO}px y ${BOCAS.length} bocas de ${anchoFinal}x${altoFinal}px en ${join(DESTINO, 'visemas')}`,
);
