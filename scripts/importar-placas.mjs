#!/usr/bin/env node
/**
 * npm run importar -- ruta/al/archivo.json
 *
 * Divide un JSON con varias placas en un archivo por placa dentro de
 * src/content/placas/. Acepta un arreglo de placas o un objeto { "placas": [...] }.
 *
 * Reglas de mezcla, para no perder trabajo ya hecho:
 *   - Si la placa entrante no trae `imagenes` o `video`, se conservan los del
 *     archivo que ya existía.
 *   - Cualquier otro campo entrante sobrescribe el anterior.
 *   - Se rellenan los valores por defecto del esquema (tincion "H&E", etc.).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DESTINO = join('src', 'content', 'placas');

const SISTEMAS_VALIDOS = new Set([
  'sangre-linfoide',
  'piel-anexos',
  'respiratorio',
  'digestivo',
  'urinario',
  'endocrino',
]);

const entrada = process.argv[2];
if (!entrada) {
  console.error('Uso: npm run importar -- ruta/al/archivo.json');
  process.exit(1);
}
if (!existsSync(entrada)) {
  console.error(`No existe el archivo ${entrada}`);
  process.exit(1);
}

const bruto = JSON.parse(readFileSync(entrada, 'utf8'));
const lista = Array.isArray(bruto) ? bruto : bruto.placas;
if (!Array.isArray(lista)) {
  console.error('El JSON debe ser un arreglo de placas o un objeto con la clave "placas".');
  process.exit(1);
}

mkdirSync(DESTINO, { recursive: true });

/** Convierte un texto en kebab-case sin acentos. */
function aId(texto) {
  return String(texto)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const problemas = [];
const vistos = new Set();
let escritas = 0;

lista.forEach((placa, indice) => {
  const id = aId(placa.id ?? placa.titulo ?? `placa-${indice + 1}`);
  if (!id) {
    problemas.push(`Placa ${indice + 1}: no se pudo deducir un id.`);
    return;
  }
  if (vistos.has(id)) {
    problemas.push(`Placa ${indice + 1}: el id "${id}" está repetido.`);
    return;
  }
  vistos.add(id);

  if (!SISTEMAS_VALIDOS.has(placa.sistema)) {
    problemas.push(
      `Placa "${id}": sistema "${placa.sistema}" no reconocido. Usa uno de: ${[...SISTEMAS_VALIDOS].join(', ')}.`,
    );
  }

  const ruta = join(DESTINO, `${id}.json`);
  const anterior = existsSync(ruta) ? JSON.parse(readFileSync(ruta, 'utf8')) : {};

  const estructuras = (placa.estructuras ?? []).map((e, i) => ({
    id: aId(e.id ?? e.nombre ?? `estructura-${i + 1}`),
    numero: Number(e.numero ?? i + 1),
    nombre: e.nombre ?? '',
    descripcion: e.descripcion ?? '',
    ...(typeof e.x === 'number' ? { x: e.x } : {}),
    ...(typeof e.y === 'number' ? { y: e.y } : {}),
    puntos: e.puntos ?? [],
  }));

  const sinCoordenadas = estructuras.filter(
    (e) => typeof e.x !== 'number' && (e.puntos ?? []).length === 0,
  );
  if (sinCoordenadas.length > 0) {
    problemas.push(
      `Placa "${id}": ${sinCoordenadas.length} estructura(s) sin coordenadas. Anótalas en /admin/anotar antes de compilar.`,
    );
  }

  const salida = {
    id,
    titulo: placa.titulo ?? anterior.titulo ?? id,
    sistema: placa.sistema ?? anterior.sistema ?? 'digestivo',
    organo: placa.organo ?? anterior.organo ?? '',
    tincion: placa.tincion ?? anterior.tincion ?? 'H&E',
    aumentos: placa.aumentos ?? anterior.aumentos ?? [],
    descripcionGeneral: placa.descripcionGeneral ?? anterior.descripcionGeneral ?? '',
    fuente: placa.fuente ?? anterior.fuente ?? '',
    credito: placa.credito ?? anterior.credito ?? '',
    presentador: placa.presentador ?? anterior.presentador ?? null,
    // Imágenes y video se conservan si el JSON entrante no los trae.
    imagenes: placa.imagenes ?? anterior.imagenes ?? [],
    video: placa.video ?? anterior.video ?? null,
    estructuras,
    borrador: placa.borrador ?? false,
  };

  writeFileSync(ruta, JSON.stringify(salida, null, 2) + '\n', 'utf8');
  escritas++;
});

console.log(`${escritas} placa(s) escritas en ${DESTINO}/`);

if (problemas.length > 0) {
  console.log('\nRevisa lo siguiente:');
  for (const p of problemas) console.log(`  · ${p}`);
}

console.log('\nSiguiente paso: npm run dev y comprueba que todas las placas cargan.');
