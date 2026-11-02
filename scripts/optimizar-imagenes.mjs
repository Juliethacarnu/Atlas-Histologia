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
 * 3. Prepara las caricaturas de public/avatares/<Nombre>/: recorta cada
 *    fotograma a un cuadrado sobre la cara, lo deja a 512 px en WebP y aparta
 *    el original a originales/avatares/<Nombre>/. Todos los fotogramas de una
 *    persona se recortan igual, para que la cara no salte entre uno y otro.
 */
import { existsSync, mkdirSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
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
const MANIFIESTO_BOCA = 'boca.json';
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

/* --------------------- Cuanto abre la boca cada cara --------------------- */

/** Lado al que se reducen los fotogramas para compararlos. */
const COMPARA_LADO = 128;
/** Zona de la boca dentro del cuadrado: franja de abajo, centrada. */
const ZONA_BOCA = {
  left: Math.round(COMPARA_LADO * 0.3),
  top: Math.round(COMPARA_LADO * 0.52),
  width: Math.round(COMPARA_LADO * 0.4),
  height: Math.round(COMPARA_LADO * 0.33),
};

/**
 * Mide cuanto se aleja cada fotograma del primero en la zona de la boca y lo
 * deja en un `boca.json` junto a las imagenes, de 0 (igual que la cara en
 * reposo) a 1 (la que mas se abre). El sitio lo usa para elegir que cara
 * poner segun lo fuerte que suene la voz en ese momento.
 *
 * Asi da igual el orden en que esten numerados los fotogramas: la posicion
 * de cada uno se deduce de la propia imagen.
 */
async function medirAperturas(dentro, fotogramas) {
  const parche = async (archivo) =>
    sharp(join(dentro, archivo))
      .resize(COMPARA_LADO, COMPARA_LADO, { fit: 'cover' })
      .extract(ZONA_BOCA)
      .greyscale()
      .raw()
      .toBuffer();

  const base = await parche(fotogramas[0]);
  const crudas = [];
  for (const f of fotogramas) {
    const otro = await parche(f);
    let suma = 0;
    for (let i = 0; i < base.length; i++) suma += Math.abs(base[i] - otro[i]);
    crudas.push(suma / base.length);
  }
  const mayor = Math.max(...crudas, 1e-6);
  const tabla = {};
  fotogramas.forEach((f, i) => {
    tabla[f] = Number((crudas[i] / mayor).toFixed(3));
  });
  writeFileSync(join(dentro, MANIFIESTO_BOCA), JSON.stringify(tabla, null, 2) + '\n');
  return tabla;
}

async function optimizarAvatares() {
  if (!existsSync(AVATARES)) return;
  const carpetas = readdirSync(AVATARES).filter((f) => statSync(join(AVATARES, f)).isDirectory());

  const sueltas = readdirSync(AVATARES).filter((f) => EXTENSIONES.has(extname(f).toLowerCase()));
  if (sueltas.length > 0) {
    console.log('');
    console.log('Caricaturas sueltas en public/avatares/ (van dentro de la carpeta de su dueno):');
    for (const f of sueltas) console.log(`  ! ${f}`);
  }
  if (carpetas.length === 0) return;

  console.log('');
  console.log('Caricaturas de public/avatares/:');

  for (const carpeta of carpetas) {
    const dentro = join(AVATARES, carpeta);
    const fuentes = readdirSync(dentro)
      .filter((f) => EXTENSIONES.has(extname(f).toLowerCase()) && extname(f).toLowerCase() !== '.webp')
      .sort((a, b) => a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' }));

    if (fuentes.length === 0) {
      const ya = readdirSync(dentro).filter((f) => extname(f).toLowerCase() === '.webp').length;
      console.log(`  · ${carpeta}: ${ya} fotograma(s), nada nuevo que convertir`);
      await anotarAperturas(carpeta, dentro);
      continue;
    }

    const guardarEn = join('originales', 'avatares', carpeta);
    mkdirSync(guardarEn, { recursive: true });

    // Todos los fotogramas de una persona se recortan igual, con la medida
    // del primero: si cada uno se recortara por su cuenta, la cara saltaria
    // de un fotograma al siguiente.
    let recorte = null;

    for (const archivo of fuentes) {
      const ruta = join(dentro, archivo);
      const antes = statSync(ruta).size;
      const meta = await sharp(ruta).metadata();
      const ancho = meta.width ?? 0;
      const alto = meta.height ?? 0;
      if (!ancho || !alto) {
        console.log(`  ! ${carpeta}/${archivo}: no se pudo leer el tamano`);
        continue;
      }
      if (recorte === null) {
        const lado = Math.min(ancho, alto);
        // Cuadrado pegado al borde de arriba: ahi esta la cara.
        recorte = { left: Math.round((ancho - lado) / 2), top: 0, width: lado, height: lado };
      }

      const destino = join(dentro, basename(archivo, extname(archivo)) + '.webp');
      const salida = await sharp(ruta, { limitInputPixels: false })
        .rotate()
        .extract({
          left: Math.min(recorte.left, Math.max(0, ancho - 1)),
          top: Math.min(recorte.top, Math.max(0, alto - 1)),
          width: Math.min(recorte.width, ancho),
          height: Math.min(recorte.height, alto),
        })
        .resize({ width: AVATAR_LADO, height: AVATAR_LADO, fit: 'cover' })
        .webp({ quality: 90 })
        .toBuffer();

      writeFileSync(destino, salida);
      renameSync(ruta, join(guardarEn, archivo));
      console.log(
        `  ✓ ${carpeta}/${archivo} ${ancho}x${alto} ${(antes / 1024).toFixed(0)} KB` +
          ` -> ${basename(destino)} ${AVATAR_LADO}px ${(salida.length / 1024).toFixed(0)} KB`
      );
      if (salida.length > AVATAR_PESO_MAX) {
        console.log(`  ! ${basename(destino)} sigue pesando mas de ${AVATAR_PESO_MAX / 1024} KB`);
      }
    }
    await anotarAperturas(carpeta, dentro);
  }
}

/** Deja el boca.json de una carpeta al dia y lo cuenta por pantalla. */
async function anotarAperturas(carpeta, dentro) {
  const fotogramas = readdirSync(dentro)
    .filter((f) => extname(f).toLowerCase() === '.webp')
    .sort((a, b) => a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' }));
  if (fotogramas.length < 2) return;
  const tabla = await medirAperturas(dentro, fotogramas);
  const resumen = fotogramas.map((f) => `${basename(f, '.webp')} ${tabla[f]}`).join(', ');
  console.log(`    apertura de boca: ${resumen}`);
}

await optimizarAvatares();
