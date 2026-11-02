/**
 * Pasa los fotogramas de la caricatura mientras suena la explicacion, como
 * un folioscopio, en el orden en que estan dibujados y sin saltarse ninguno:
 * la boca se abre y se cierra como la dibujo quien la hizo. El primer
 * fotograma es a la vez la cara en reposo y una posicion mas de la rueda, que
 * es lo que hace que la cara de cuando habla case con la de cuando calla.
 *
 * No va sincronizado con la voz a proposito. Analizar el audio obligaria a
 * meterlo por un AudioContext, y si ese contexto no arranca la explicacion
 * se queda muda: no vale la pena arriesgar lo unico que importa de la pagina
 * por una boca de 56 pixeles. En su lugar el ritmo es irregular, con pausas
 * de vez en cuando, que a este tamano se lee igual de bien.
 */

/** Tiempo que dura cada posicion de la boca. */
const MIN_MS = 110;
const MAX_MS = 150;
/** Cada cierta vuelta, la cara descansa un momento con la boca cerrada. */
const PAUSA_CADA = 3;
const PAUSA_MS = 320;

const alAzar = (min: number, max: number) => min + Math.random() * (max - min);

class Boca {
  /** Las posiciones abiertas; la cerrada es la de debajo, sin tapar. */
  private caras: HTMLElement[];
  private temporizador: number | null = null;
  /** 0 = la cara de reposo; 1..n = cada una de las de encima. */
  private i = 0;
  private vueltas = 0;

  constructor(avatar: HTMLElement) {
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

  /**
   * Pasa los fotogramas en el orden en que estan dibujados, de uno en uno y
   * sin saltarse ninguno: la boca se abre y se cierra como la dibujaron. La
   * cara de reposo entra en la rueda como una posicion mas, que es lo que la
   * hace casar con la de cuando no habla: es la misma imagen.
   */
  private siguiente() {
    this.reposo();
    if (this.i > 0) this.caras[this.i - 1]?.setAttribute('data-activo', '');

    const cerrada = this.i === 0;
    this.i = (this.i + 1) % (this.caras.length + 1);
    if (this.i === 0) this.vueltas++;

    // Al cerrar la boca, de vez en cuando se queda asi un momento: respira.
    const espera = cerrada && this.vueltas % PAUSA_CADA === 0 ? PAUSA_MS : alAzar(MIN_MS, MAX_MS);
    this.temporizador = window.setTimeout(() => this.siguiente(), espera);
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
