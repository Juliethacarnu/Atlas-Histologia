/**
 * Los mismos iconos de Phosphor que usa `Icono.astro`, pero para el codigo
 * que construye elementos en el navegador (el transporte del audio, el quiz).
 *
 * Se importa el SVG original con `?raw` en vez de copiar el trazado a mano:
 * asi no hay dos dibujos del mismo icono que puedan separarse con el tiempo.
 */
import play from '@phosphor-icons/core/assets/fill/play-fill.svg?raw';
import pause from '@phosphor-icons/core/assets/fill/pause-fill.svg?raw';
import checkCircle from '@phosphor-icons/core/assets/fill/check-circle-fill.svg?raw';
import xCircle from '@phosphor-icons/core/assets/fill/x-circle-fill.svg?raw';

/** Deja el SVG listo para incrustar: sin tamanos propios y con la clase comun. */
function preparar(bruto: string): string {
  return bruto.replace('<svg', '<svg class="icono" aria-hidden="true"');
}

export const ICONO_PLAY = preparar(play);
export const ICONO_PAUSA = preparar(pause);
export const ICONO_BIEN = preparar(checkCircle);
export const ICONO_MAL = preparar(xCircle);
