import type { CollectionEntry } from 'astro:content';
import { ruta } from './ruta';

export type Placa = CollectionEntry<'placas'>['data'];
export type Estructura = Placa['estructuras'][number];
export type ImagenPlaca = Placa['imagenes'][number];
export type Presentador = CollectionEntry<'presentadores'>['data'];

/** Sufijos de los WebP que produce `npm run optimizar`. */
export const TAMANOS = {
  grande: '--grande.webp',
  media: '--media.webp',
  miniatura: '--miniatura.webp',
} as const;

export type Tamano = keyof typeof TAMANOS;

export function urlImagen(archivo: string, tamano: Tamano = 'media'): string {
  return ruta('placas', `${archivo}${TAMANOS[tamano]}`);
}

/**
 * Imagenes de una placa. Si el JSON todavia no declara ninguna, se asume un
 * archivo con el mismo nombre que el id de la placa: asi el sitio funciona
 * con los placeholders antes de que existan las fotos definitivas.
 */
export function imagenesDe(placa: Placa): ImagenPlaca[] {
  if (placa.imagenes.length > 0) return placa.imagenes;
  return [{ archivo: placa.id, aumento: placa.aumentos[0] ?? '', credito: placa.credito }];
}

/** Todos los puntos de una estructura, en coordenadas normalizadas. */
export function puntosDe(e: Estructura): { x: number; y: number; imagen?: number }[] {
  const lista: { x: number; y: number; imagen?: number }[] = [];
  if (typeof e.x === 'number' && typeof e.y === 'number') lista.push({ x: e.x, y: e.y });
  for (const p of e.puntos) lista.push(p);
  return lista;
}

/** Quita acentos y mayusculas para comparar en el buscador. */
export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

/** Cadena de busqueda de una placa: titulo, organo/tejido, sistema y estructuras. */
export function textoBusqueda(placa: Placa, nombreDelSistema: string): string {
  return normalizar(
    [
      placa.titulo,
      placa.organo,
      nombreDelSistema,
      placa.tincion,
      ...placa.estructuras.map((e) => e.nombre),
    ].join(' '),
  );
}

/** Ordena las placas por sistema (segun SISTEMAS) y luego por titulo. */
export function ordenarPlacas<T extends { data: Placa }>(
  placas: T[],
  ordenSistemas: readonly string[],
): T[] {
  return [...placas].sort((a, b) => {
    const d = ordenSistemas.indexOf(a.data.sistema) - ordenSistemas.indexOf(b.data.sistema);
    return d !== 0 ? d : a.data.titulo.localeCompare(b.data.titulo, 'es');
  });
}

export function iniciales(nombre: string): string {
  const limpio = nombre.replace(/PLACEHOLDER/gi, '').trim();
  const partes = limpio.split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '??';
  if (partes.length === 1) return partes[0]!.slice(0, 2).toUpperCase();
  return (partes[0]![0]! + partes[partes.length - 1]![0]!).toUpperCase();
}
