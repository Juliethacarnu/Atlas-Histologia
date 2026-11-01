/**
 * Proporción real de cada lámina, leída del WebP en tiempo de compilación.
 *
 * La bandeja no recorta las fotos: una tráquea panorámica y un corte redondo
 * de duodeno ocupan formas distintas, como en una caja de preparaciones. Para
 * eso hay que saber cuánto mide cada imagen antes de pintarla, y de paso se
 * reserva su sitio para que nada salte al cargar.
 *
 * Esto sólo corre en Node, durante el build. No llega al navegador.
 */
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(import.meta.url);

const CARPETA = join(process.cwd(), 'public', 'placas');
/** Proporción de reserva cuando la foto todavía no existe. */
export const PROPORCION_POR_DEFECTO = 4 / 3;

/**
 * Límites de la forma de una tarjeta. Casi todas las láminas rondan 1,55 (tres
 * cuartos apaisado) y entran sin tocarlas; sólo el ganglio linfático (0,44) se
 * sale tanto que, sin tope, abriría un hueco de media pantalla en el mosaico.
 */
const MAS_ALTA = 0.62;
const MAS_ANCHA = 2.3;

const cache = new Map<string, number>();

/**
 * Proporción ancho/alto de una lámina. Se mide sobre la miniatura, que es la
 * que pinta la bandeja y tiene la misma forma que el original.
 */
export async function proporcionDe(archivo: string): Promise<number> {
  const guardada = cache.get(archivo);
  if (guardada !== undefined) return guardada;

  let proporcion = PROPORCION_POR_DEFECTO;
  const ruta = join(CARPETA, `${archivo}--miniatura.webp`);
  if (existsSync(ruta)) {
    try {
      // sharp es una dependencia de desarrollo: se carga sólo aquí y sólo en
      // el build, nunca desde una ruta que acabe en el cliente.
      const sharp = require('sharp');
      const { width, height } = await sharp(ruta).metadata();
      if (width && height) {
        proporcion = Math.min(MAS_ANCHA, Math.max(MAS_ALTA, width / height));
      }
    } catch {
      /* si sharp no está disponible se usa la proporción de reserva */
    }
  }

  cache.set(archivo, proporcion);
  return proporcion;
}
