/**
 * LipSyncAvatar: mueve la boca de una caricatura al compas de un audio.
 *
 * Cada audio tiene en public/lipsync/<audio>.json la lista de formas de boca
 * que calculo Rhubarb Lip Sync (npm run lipsync): [segundo, codigo], y cada
 * forma dura hasta la siguiente. Mientras el audio suena, en cada cuadro se
 * mira `audio.currentTime`, se busca la forma que toca y se destapa la boca
 * correspondiente. Como se lee el tiempo del propio audio, adelantar, retroceder
 * o pausar no descuadra nada: la boca siempre es la de ese instante.
 *
 * No depende de ninguna placa: recibe los avatares (uno o varios, todos con
 * las capas de LipSyncAvatar.astro), el <audio> y la URL de su JSON.
 *
 * Si el JSON no existe (un audio nuevo sin procesar), la boca se mueve por
 * volumen: cerrada en los silencios y mas o menos abierta segun lo fuerte que
 * suene la voz. El audio se oye igual en los dos casos.
 */
import { escuchar } from './boca';

/**
 * De codigo de Rhubarb a boca dibujada. Las imagenes no se llaman como los
 * codigos de Rhubarb y no significan lo mismo, por eso hace falta la tabla:
 *
 *   Rhubarb                                   →  imagen
 *   X  silencio                               →  X  reposo (boca cerrada)
 *   A  labios cerrados: m, b, p               →  X  reposo
 *   B  casi cerrada, dientes juntos: s, t, k… →  B  apertura leve
 *   C  abierta: e, i                          →  C  apertura media
 *   D  muy abierta: a                         →  D  apertura amplia
 *   E  algo redondeada: o                     →  E  labios redondos
 *   F  redonda y cerrada: u, w                →  E  labios redondos
 *   G  dientes sobre el labio: f, v           →  F  labiodental
 *   H  lengua arriba: l                       →  C  apertura media
 */
export const MAPA_RHUBARB: Record<string, string> = {
  X: 'X',
  A: 'X',
  B: 'B',
  C: 'C',
  D: 'D',
  E: 'E',
  F: 'E',
  G: 'F',
  H: 'C',
};

/** La boca se adelanta un pelin al sonido, como en la animacion de verdad. */
const ADELANTO_S = 0.03;

interface Pista {
  tiempos: Float64Array;
  bocas: string[];
}

/** Cada JSON se pide una vez por pagina. */
const pistas = new Map<string, Promise<Pista | null>>();

function cargarPista(url: string): Promise<Pista | null> {
  let p = pistas.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((json: { cues?: [number, string][] } | null) => {
        if (!json?.cues?.length) return null;
        return {
          tiempos: Float64Array.from(json.cues, (c) => c[0]),
          bocas: json.cues.map((c) => MAPA_RHUBARB[c[1]] ?? 'X'),
        };
      })
      .catch(() => null);
    pistas.set(url, p);
  }
  return p;
}

/** Ultima forma cuyo inicio ya paso (busqueda binaria). */
function bocaEn(pista: Pista, t: number): string {
  const { tiempos } = pista;
  let lo = 0;
  let hi = tiempos.length - 1;
  if (hi < 0 || t < tiempos[0]!) return 'X';
  while (lo < hi) {
    const mitad = (lo + hi + 1) >> 1;
    if (tiempos[mitad]! <= t) lo = mitad;
    else hi = mitad - 1;
  }
  return pista.bocas[lo]!;
}

const menosMovimiento = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export class LipSyncAvatar {
  /** Por avatar, sus bocas por nombre (B, C, D...). X es no destapar ninguna. */
  private readonly capas: Map<string, HTMLElement>[];
  private medio: HTMLMediaElement | null = null;
  private pista: Pista | null = null;
  /** Volumen del audio, solo si no hay JSON. */
  private nivel: (() => number) | null = null;
  private envolvente = 0;
  private pico = 0;
  private cuadro: number | null = null;
  private actual = 'X';
  /** Se suelta todo lo del audio anterior al conectar otro. */
  private soltar: AbortController | null = null;
  /** Para descartar un JSON que llega tarde, de un audio que ya no esta. */
  private turno = 0;

  constructor(avatares: HTMLElement | HTMLElement[]) {
    const lista = Array.isArray(avatares) ? avatares : [avatares];
    this.capas = lista.map((a) => {
      const m = new Map<string, HTMLElement>();
      for (const c of a.querySelectorAll<HTMLElement>('[data-visema]')) m.set(c.dataset.visema!, c);
      return m;
    });
  }

  /** Engancha un audio y su JSON; suelta el anterior y vuelve a reposo. */
  conectar(medio: HTMLMediaElement, urlPista: string | null) {
    this.desconectar();
    const turno = ++this.turno;
    this.medio = medio;
    this.soltar = new AbortController();
    const op = { signal: this.soltar.signal };

    medio.addEventListener('play', () => this.arrancar(), op);
    medio.addEventListener('playing', () => this.arrancar(), op);
    medio.addEventListener('pause', () => this.parar(), op);
    medio.addEventListener('ended', () => this.parar(), op);
    medio.addEventListener('emptied', () => this.parar(), op);
    // Al mover la barra: con el audio en pausa se queda en reposo; sonando,
    // el siguiente cuadro ya lee el tiempo nuevo.
    medio.addEventListener('seeked', () => this.pintarAhora(), op);

    if (urlPista) {
      void cargarPista(urlPista).then((pista) => {
        if (turno !== this.turno) return;
        this.pista = pista;
        if (!pista) this.prepararVolumen();
      });
    } else {
      this.prepararVolumen();
    }
    if (!medio.paused && !medio.ended) this.arrancar();
  }

  desconectar() {
    this.soltar?.abort();
    this.soltar = null;
    this.medio = null;
    this.pista = null;
    this.nivel = null;
    this.parar();
  }

  private prepararVolumen() {
    const medio = this.medio;
    if (!medio) return;
    const turno = this.turno;
    // Web Audio solo arranca tras un gesto: se engancha al primer play.
    const enganchar = () => {
      void escuchar(medio).then((nivel) => {
        if (turno === this.turno) this.nivel = nivel;
      });
    };
    if (!medio.paused) enganchar();
    else medio.addEventListener('play', enganchar, { once: true, signal: this.soltar?.signal });
  }

  private arrancar() {
    if (this.cuadro !== null || menosMovimiento()) return;
    const paso = () => {
      const medio = this.medio;
      if (!medio || medio.paused || medio.ended) {
        this.cuadro = null;
        this.mostrar('X');
        return;
      }
      this.mostrar(this.bocaAhora(medio));
      this.cuadro = requestAnimationFrame(paso);
    };
    this.cuadro = requestAnimationFrame(paso);
  }

  private parar() {
    if (this.cuadro !== null) cancelAnimationFrame(this.cuadro);
    this.cuadro = null;
    this.envolvente = 0;
    this.mostrar('X');
  }

  private pintarAhora() {
    const medio = this.medio;
    if (!medio || medio.paused || medio.ended || menosMovimiento()) this.mostrar('X');
    else this.mostrar(this.bocaAhora(medio));
  }

  private bocaAhora(medio: HTMLMediaElement): string {
    if (this.pista) return bocaEn(this.pista, medio.currentTime + ADELANTO_S);
    if (!this.nivel) return 'X';
    // Sin JSON: apertura por volumen, con umbral relativo al pico de la voz
    // (las grabaciones estan a volumenes muy distintos).
    this.envolvente = Math.max(this.nivel(), this.envolvente * 0.82);
    this.pico = Math.max(this.envolvente, this.pico * 0.999);
    const r = this.pico > 0 ? this.envolvente / this.pico : 0;
    if (this.envolvente < 0.002 || r < 0.06) return 'X';
    if (r < 0.22) return 'B';
    if (r < 0.5) return 'C';
    return 'D';
  }

  private mostrar(boca: string) {
    if (boca === this.actual) return;
    this.actual = boca;
    for (const capas of this.capas) {
      for (const [nombre, capa] of capas) capa.toggleAttribute('data-activo', nombre === boca);
    }
  }
}
