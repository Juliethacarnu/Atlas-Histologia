import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Los fotogramas de un presentador salen de su carpeta en public/avatares/:
 * una imagen por posicion de la boca, numeradas en orden (Andrea1, Andrea2...).
 * La primera es la cara en reposo, con la boca cerrada; las demas se van
 * pasando mientras suena la explicacion.
 *
 * Se leen del disco al compilar, asi que para anadir o quitar una posicion
 * basta con dejar el archivo en la carpeta: no hay que tocar ningun JSON.
 * Esta funcion solo corre en el servidor; no la importes desde el cliente.
 */

const RAIZ = 'public/avatares';
const EXTENSIONES = /\.(webp|avif|png|jpe?g|svg)$/i;
const MANIFIESTO = 'boca.json';

/** Un fotograma: su ruta y cuanto abre la boca, de 0 (cerrada) a 1. */
export interface Fotograma {
  ruta: string;
  apertura: number;
}

/** Una carpeta se lee una sola vez por compilacion. */
const memoria = new Map<string, Fotograma[]>();

/** Andrea10 va despues de Andrea9, no entre Andrea1 y Andrea2. */
const porNumero = (a: string, b: string) =>
  a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' });

/**
 * Fotogramas de una carpeta, en orden de numeracion. Devuelve [] si la
 * carpeta no existe o esta vacia: entonces el avatar cae en las iniciales.
 *
 * La apertura de cada uno sale de `boca.json`, que escribe
 * `npm run optimizar` midiendo las propias imagenes. Si ese archivo no esta,
 * la apertura queda a 0 y el sitio se limita a pasar los fotogramas en orden.
 */
export function fotogramasDe(carpeta: string | null | undefined): Fotograma[] {
  if (!carpeta) return [];
  const guardado = memoria.get(carpeta);
  if (guardado) return guardado;

  let lista: Fotograma[] = [];
  try {
    const dentro = join(RAIZ, carpeta);
    if (statSync(dentro).isDirectory()) {
      let aperturas: Record<string, number> = {};
      try {
        aperturas = JSON.parse(readFileSync(join(dentro, MANIFIESTO), 'utf8')) as Record<
          string,
          number
        >;
      } catch {
        /* Sin manifiesto se sigue: solo se pierde el seguir el volumen. */
      }
      lista = readdirSync(dentro)
        .filter((f) => EXTENSIONES.test(f))
        .sort(porNumero)
        .map((f) => ({ ruta: `${carpeta}/${f}`, apertura: aperturas[f] ?? 0 }));
    }
  } catch {
    /* La carpeta puede no estar todavia: no es un error, es un avatar menos. */
  }
  memoria.set(carpeta, lista);
  return lista;
}
