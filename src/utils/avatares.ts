import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Los fotogramas de un presentador salen de su carpeta en public/avatares/:
 * una imagen por posicion de la boca, numeradas en orden (Andrea1, Andrea2...).
 * La primera es la cara en reposo, con la boca cerrada, y la segunda la de la
 * boca abierta: se turnan mientras suena la explicacion.
 *
 * Se leen del disco al compilar, asi que para anadir o quitar una posicion
 * basta con dejar el archivo en la carpeta: no hay que tocar ningun JSON.
 * Esta funcion solo corre en el servidor; no la importes desde el cliente.
 */

const RAIZ = 'public/avatares';
const EXTENSIONES = /\.(webp|avif|png|jpe?g|svg)$/i;

/** Una carpeta se lee una sola vez por compilacion. */
const memoria = new Map<string, string[]>();

/** Andrea10 va despues de Andrea9, no entre Andrea1 y Andrea2. */
const porNumero = (a: string, b: string) =>
  a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' });

/**
 * Rutas de los fotogramas de una carpeta, relativas a public/avatares/ y en
 * orden de numeracion. Devuelve [] si la carpeta no existe o esta vacia:
 * entonces el avatar cae en las iniciales.
 */
export function fotogramasDe(carpeta: string | null | undefined): string[] {
  if (!carpeta) return [];
  const guardado = memoria.get(carpeta);
  if (guardado) return guardado;

  let lista: string[] = [];
  try {
    const dentro = join(RAIZ, carpeta);
    if (statSync(dentro).isDirectory()) {
      lista = readdirSync(dentro)
        .filter((f) => EXTENSIONES.test(f))
        .sort(porNumero)
        .map((f) => `${carpeta}/${f}`);
    }
  } catch {
    /* La carpeta puede no estar todavia: no es un error, es un avatar menos. */
  }
  memoria.set(carpeta, lista);
  return lista;
}
