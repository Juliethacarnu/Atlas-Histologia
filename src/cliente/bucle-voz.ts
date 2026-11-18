/**
 * El video en bucle del presentador solo se mueve cuando hay voz.
 *
 * El bucle no esta sincronizado con el audio: es la persona moviendo la boca
 * "en general". Lo que mas delata el truco es que siga moviendola cuando el
 * audio calla (una pausa entre frases, el final). Aqui se usa el JSON de
 * public/lipsync/ de cada audio, que dice cuando se habla y cuando no:
 *
 *  - mientras hay voz, el video corre;
 *  - en un silencio, el video se para y encima aparece, con un fundido corto,
 *    la foto fija del presentador con la boca cerrada (la capa [data-quieto]
 *    de Avatar.astro, que se ve siempre que el avatar no lleva data-voz).
 *
 * Se lee `audio.currentTime` en cada cuadro, asi que pausar, adelantar o
 * retroceder no lo descuadra. Sin JSON, el video corre todo el rato que suene
 * el audio, como antes.
 */
import { cargarPista, type Pista } from './lipsync-avatar';

/** Un silencio mas corto que esto no para el video: seria un tic. */
const SILENCIO_MIN_S = 0.32;
/** La boca arranca un pelin antes que la voz y aguanta un pelin despues. */
const ANTES_S = 0.08;
const DESPUES_S = 0.06;

/** Tramos [inicio, fin] en silencio, a partir de las formas de boca. */
function silencios(pista: Pista): [number, number][] {
  const tramos: [number, number][] = [];
  const n = pista.tiempos.length;
  let i = 0;
  while (i < n) {
    if (pista.bocas[i] !== 'X') {
      i++;
      continue;
    }
    let j = i;
    while (j < n && pista.bocas[j] === 'X') j++;
    const inicio = pista.tiempos[i]!;
    const fin = j < n ? pista.tiempos[j]! : Infinity;
    if (fin - inicio >= SILENCIO_MIN_S) tramos.push([inicio + DESPUES_S, fin - ANTES_S]);
    i = j;
  }
  return tramos;
}

export class BucleConVoz {
  private readonly videos: { avatar: HTMLElement; video: HTMLVideoElement }[];
  private tramos: [number, number][] | null = null;
  private cuadro: number | null = null;
  private conVoz = false;
  /** Mientras llega el JSON no se mueve: casi todo audio empieza en silencio. */
  private cargando = false;

  constructor(
    avatares: HTMLElement[],
    private readonly medio: HTMLMediaElement,
    urlPista: string | null,
  ) {
    this.videos = avatares.flatMap((avatar) => {
      const video = avatar.querySelector<HTMLVideoElement>('[data-bucle]');
      return video ? [{ avatar, video }] : [];
    });
    if (this.videos.length === 0) return;

    if (urlPista) {
      this.cargando = true;
      void cargarPista(urlPista).then((pista) => {
        if (pista) this.tramos = silencios(pista);
        this.cargando = false;
      });
    }
    medio.addEventListener('play', () => this.arrancar());
    medio.addEventListener('playing', () => this.arrancar());
    medio.addEventListener('pause', () => this.parar());
    medio.addEventListener('ended', () => this.parar());
    if (!medio.paused && !medio.ended) this.arrancar();
  }

  private arrancar() {
    if (this.cuadro !== null) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const paso = () => {
      if (this.medio.paused || this.medio.ended) {
        this.cuadro = null;
        this.poner(false);
        return;
      }
      this.poner(!this.callado(this.medio.currentTime));
      this.cuadro = requestAnimationFrame(paso);
    };
    this.cuadro = requestAnimationFrame(paso);
  }

  private parar() {
    if (this.cuadro !== null) cancelAnimationFrame(this.cuadro);
    this.cuadro = null;
    this.poner(false);
  }

  private callado(t: number): boolean {
    if (this.cargando) return true;
    if (!this.tramos) return false;
    // Pocos tramos por audio (decenas): recorrerlos es de sobra rapido.
    for (const [a, b] of this.tramos) {
      if (t < a) return false;
      if (t <= b) return true;
    }
    return false;
  }

  private poner(conVoz: boolean) {
    if (conVoz === this.conVoz) return;
    this.conVoz = conVoz;
    for (const { avatar, video } of this.videos) {
      avatar.toggleAttribute('data-voz', conVoz);
      if (conVoz) {
        void video.play().catch(() => {
          /* el navegador puede bloquearlo: se queda la foto */
          avatar.removeAttribute('data-voz');
        });
      } else {
        video.pause();
      }
    }
  }
}
