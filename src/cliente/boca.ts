/**
 * Pasa los fotogramas de la caricatura mientras suena la explicacion, como
 * un folioscopio: cerrada, entreabierta, abierta, y vuelta.
 *
 * No va sincronizado con la voz a proposito. Analizar el audio obligaria a
 * meterlo por un AudioContext, y si ese contexto no arranca la explicacion
 * se queda muda: no vale la pena arriesgar lo unico que importa de la pagina
 * por una boca de 56 pixeles. En su lugar el ritmo es irregular, con pausas
 * de vez en cuando, que a este tamano se lee igual de bien.
 */

/** Tiempo que dura cada posicion de la boca. */
const MIN_MS = 90;
const MAX_MS = 170;
/** Cada cierto numero de posiciones, la cara descansa un momento: una coma. */
const PAUSA_CADA = 7;
const PAUSA_MS = 260;

const alAzar = (min: number, max: number) => min + Math.random() * (max - min);

class Boca {
  private caras: HTMLElement[];
  private temporizador: number | null = null;
  private i = 0;
  private desde = 0;

  constructor(private avatar: HTMLElement) {
    this.caras = Array.from(avatar.querySelectorAll<HTMLElement>('[data-boca]'));
  }

  get sirve() {
    return this.caras.length > 0;
  }

  arrancar() {
    if (this.temporizador !== null) return;
    this.siguiente();
  }

  parar() {
    if (this.temporizador !== null) {
      clearTimeout(this.temporizador);
      this.temporizador = null;
    }
    this.reposo();
  }

  /** Tapa todas: debajo queda la cara en reposo, la primera de la carpeta. */
  private reposo() {
    for (const c of this.caras) c.removeAttribute('data-activo');
  }

  private siguiente() {
    this.desde++;
    // Una pausa corta de vez en cuando, con la boca cerrada: respira.
    if (this.desde % PAUSA_CADA === 0) {
      this.reposo();
      this.temporizador = window.setTimeout(() => this.siguiente(), PAUSA_MS);
      return;
    }

    this.reposo();
    this.caras[this.i]?.setAttribute('data-activo', '');
    this.i = (this.i + 1) % this.caras.length;
    this.temporizador = window.setTimeout(() => this.siguiente(), alAzar(MIN_MS, MAX_MS));
  }
}

const bocas = new WeakMap<HTMLElement, Boca>();

/**
 * Enciende o apaga el movimiento de la boca de un avatar. Si la persona solo
 * tiene un fotograma, o si se ha pedido menos movimiento, no hace nada.
 */
export function moverBoca(avatar: HTMLElement, hablando: boolean) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  let boca = bocas.get(avatar);
  if (!boca) {
    boca = new Boca(avatar);
    bocas.set(avatar, boca);
  }
  if (!boca.sirve) return;

  if (hablando) boca.arrancar();
  else boca.parar();
}
