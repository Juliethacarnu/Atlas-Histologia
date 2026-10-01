#!/usr/bin/env node
/**
 * npm run optimizar
 *
 * 1. Convierte ./originales/*.{png,jpg,jpeg,webp,tif} a tres WebP en public/placas/:
 *      <nombre>--grande.webp     hasta 4000 px de ancho, para el visor con zoom
 *      <nombre>--media.webp      hasta 1600 px, para vistas intermedias
 *      <nombre>--miniatura.webp  hasta 480 px, para la bandeja de placas
 *
 *    El nombre del archivo debe coincidir con el campo `archivo` de `imagenes`
 *    en el JSON de la placa (convencion: <id>-1, <id>-2, ...).
 *
 * 2. Crea placeholders con aspecto H&E para las imagenes que las placas
 *    declaran pero que todavia no existen, para poder probar el sitio.
 *
 * 3. Comprime las caricaturas de public/avatares/: no se muestran a mas de
 *    128 px, asi que un PNG de 1200 px es peso tirado.
 */
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, basename } from 'node:path';
import sharp from 'sharp';
import {
  generarPlaceholdersFaltantes,
  esPlaceholder,
  quitarDelManifiesto,
} from './placeholders.mjs';

const ORIGEN = 'originales';
const DESTINO = join('public', 'placas');
const AVATARES = join('public', 'avatares');
const AVATAR_LADO = 512;
const AVATAR_PESO_MAX = 200 * 1024;
const EXTENSIONES = new Set(['.png', '.jpg', '.jpeg', '.webp', '.tif', '.tiff']);

const VARIANTES = [
  { sufijo: '--grande.webp', ancho: 4000, calidad: 82 },
  { sufijo: '--media.webp', ancho: 1600, calidad: 80 },
  { sufijo: '--miniatura.webp', ancho: 480, calidad: 72 },
];

mkdirSync(DESTINO, { recursive: true });

async function escribirVariantes(instancia, base, destino) {
  const metadatos = await instancia.metadata();
  for (const v of VARIANTES) {
    const salida = join(destino, `${base}${v.sufijo}`);
    await instancia
      .clone()
      .resize({
        width: Math.min(v.ancho, metadatos.width ?? v.ancho),
        withoutEnlargement: true,
      })
      .webp({ quality: v.calidad, effort: 5 })
      .toFile(salida);
  }
}

/* ------------------------- 1. Laminas de verdad -------------------------- */

function fuentes() {
  if (!existsSync(ORIGEN)) return [];
  return readdirSync(ORIGEN)
    .filter((f) => EXTENSIONES.has(extname(f).toLowerCase()))
    .map((f) => join(ORIGEN, f));
}

const lista = fuentes();

if (lista.length > 0) {
  let convertidas = 0;
  let omitidas = 0;
  console.log(`Laminas de ./${ORIGEN}/:`);

  for (const ruta of lista) {
    const base = basename(ruta, extname(ruta));
    const referencia = join(DESTINO, `${base}--grande.webp`);
    const eraPlaceholder = esPlaceholder(base);

    // Solo se salta si el WebP existente viene de esta misma imagen. Un
    // placeholder se sustituye siempre, por reciente que sea su fecha:
    // comparar fechas no distingue un relleno de una conversion real.
    const yaConvertida =
      existsSync(referencia) &&
      !eraPlaceholder &&
      statSync(referencia).mtimeMs >= statSync(ruta).mtimeMs;

    if (yaConvertida) {
      omitidas++;
      continue;
    }

    await escribirVariantes(sharp(ruta, { limitInputPixels: false }).rotate(), base, DESTINO);
    if (eraPlaceholder) quitarDelManifiesto(base);
    convertidas++;
    console.log(`  ✓ ${base}${eraPlaceholder ? ' (sustituye al placeholder)' : ''}`);
  }

  console.log(`  ${convertidas} convertida(s), ${omitidas} sin cambios.`);
} else {
  console.log(`No hay imagenes en ./${ORIGEN}/.`);
}

/* --------------------------- 2. Placeholders ----------------------------- */

const creados = await generarPlaceholdersFaltantes(DESTINO, escribirVariantes);
console.log('');
if (creados > 0) {
  console.log(`Placeholders creados para ${creados} imagen(es) que aun no existen.`);
  console.log(`Exportalas de Canva a ./${ORIGEN}/ con el nombre que dice el JSON y repite.`);
} else {
  console.log('No falta ningun placeholder.');
}

/* ------------------------------ 3. Avatares ------------------------------ */

async function optimizarAvatares() {
  if (!existsSync(AVATARES)) return;
  const archivos = readdirSync(AVATARES).filter((f) => extname(f).toLowerCase() === '.png');
  if (archivos.length === 0) return;

  console.log('');
  console.log('Caricaturas de public/avatares/:');
  for (const archivo of archivos) {
    const ruta = join(AVATARES, archivo);
    const antes = statSync(ruta).size;
    const meta = await sharp(ruta).metadata();

    // Ya esta dentro de lo razonable: no se toca.
    if ((meta.width ?? 0) <= AVATAR_LADO && antes <= AVATAR_PESO_MAX) {
      console.log(`  · ${archivo} sin cambios (${meta.width}px, ${(antes / 1024).toFixed(0)} KB)`);
      continue;
    }

    if (!meta.hasAlpha) {
      console.log(`  ! ${archivo} no tiene canal alfa: el fondo se vera como un rectangulo.`);
    }

    const optimizado = await sharp(ruta)
      .resize({ width: AVATAR_LADO, height: AVATAR_LADO, fit: 'inside', withoutEnlargement: true })
      .png({ compressionLevel: 9, palette: true, quality: 90 })
      .toBuffer();

    // Se sobreescribe solo si de verdad adelgaza.
    if (optimizado.length < antes) {
      writeFileSync(ruta, optimizado);
      console.log(
        `  ✓ ${archivo} ${meta.width}px ${(antes / 1024).toFixed(0)} KB -> ${AVATAR_LADO}px ${(optimizado.length / 1024).toFixed(0)} KB`
      );
    } else {
      console.log(`  · ${archivo} ya estaba optimizado`);
    }
  }
}

await optimizarAvatares();
