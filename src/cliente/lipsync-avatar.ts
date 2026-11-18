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

/**
 * Formas que se pintan de verdad. No hay una por imagen: la boca muy abierta
 * (D) sola parece un grito y la redonda (E) un beso, asi que casi todo se
 * resuelve con aperturas intermedias, mezclando dos imagenes vecinas. Cada
 * forma dice que capas se ven y con cuanta opacidad.
 */
const FORMAS: Record<string, Record<string, number>> = {
  X: {},
  B: { B: 1 },
  BC: { B: 1, C: 0.5 },
  C: { C: 1 },
  CD: { C: 1, D: 0.4 },
  U: { E: 1 },
  F: { F: 1 },
};
/** Cuanto abre cada forma (0 a 1): mueve un poco la cabeza al hablar. */
const APERTURA: Record<string, number> = {
  X: 0,
  B: 0.25,
  BC: 0.45,
  C: 0.65,
  CD: 1,
  U: 0.3,
  F: 0.2,
};

/**
 * Que forma toca para un sonido. `codigo` es el de Rhubarb, `dura` lo que
 * dura en segundos y `fuerza` lo fuerte que suena la voz en ese instante
 * (0 a 1, relativo a su propio pico). Una misma vocal abre mas si se dice
 * fuerte y larga que si pasa de corrido: asi la boca no repite siempre los
 * mismos tres gestos.
 */
function elegirForma(codigo: string, dura: number, fuerza: number): string {
  switch (codigo) {
    case 'B': // consonantes
      return 'B';
    case 'H': // l
      return 'BC';
    case 'C': // e, i
      return fuerza > 0.5 && dura >= 0.07 ? 'C' : 'BC';
    case 'D': // a
      if (fuerza > 0.62 && dura >= 0.09) return 'CD';
      return fuerza > 0.3 ? 'C' : 'BC';
    case 'E': // o: la imagen redonda es demasiado "beso" para una o
      return fuerza > 0.45 ? 'C' : 'BC';
    case 'F': // u
      return dura >= 0.08 ? 'U' : 'B';
    case 'G': // f
      return 'F';
    default: // X silencio, A labios cerrados (m, b, p)
      return 'X';
  }
}

export interface Pista {
  tiempos: Float64Array;
  /** Codigo de Rhubarb de cada tramo, tal cual viene en el JSON. */
  codigos: string[];
  /** El mismo tramo traducido a imagen (MAPA_RHUBARB); 'X' = boca cerrada. */
  bocas: string[];
}

/** Cada JSON se pide una vez por pagina. */
const pistas = new Map<string, Promise<Pista | null>>();

export function cargarPista(url: string): Promise<Pista | null> {
  let p = pistas.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((json: { cues?: [number, string][] } | null) => {
        if (!json?.cues?.length) return null;
        return {
          tiempos: Float64Array.from(json.cues, (c) => c[0]),
          codigos: json.cues.map((c) => c[1]),
          bocas: json.cues.map((c) => MAPA_RHUBARB[c[1]] ?? 'X'),
        };
      })
      .catch(() => null);
    pistas.set(url, p);
  }
  return p;
}

/** Indice del ultimo tramo cuyo inicio ya paso (busqueda binaria); -1 si ninguno. */
function tramoEn(pista: Pista, t: number): number {
  const { tiempos } = pista;
  let lo = 0;
  let hi = tiempos.length - 1;
  if (hi < 0 || t < tiempos[0]!) return -1;
  while (lo < hi) {
    const mitad = (lo + hi + 1) >> 1;
    if (tiempos[mitad]! <= t) lo = mitad;
    else hi = mitad - 1;
  }
  return lo;
}

const menosMovimiento = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export class LipSyncAvatar {
  /** Por avatar, sus bocas por nombre (B, C, D...). */
  private readonly capas: Map<string, HTMLElement>[];
  /** La cara entera de cada avatar (foto + bocas): se mece un poco al hablar. */
  private readonly caras: HTMLElement[];
  /** Los ojos cerrados de cada avatar, si los tiene. */
  private readonly parpados: HTMLElement[];
  /** Cuando toca el siguiente parpadeo y hasta cuando dura el actual (ms). */
  private proximoParpadeo = 0;
  private finParpadeo = 0;
  private ojosCerrados = false;
  private medio: HTMLMediaElement | null = null;
  private pista: Pista | null = null;
  /** Volumen del audio en este instante, si el navegador deja escucharlo. */
  private nivel: (() => number) | null = null;
  private envolvente = 0;
  private pico = 0;
  private cuadro: number | null = null;
  private actual = 'X';
  /** Apertura suavizada, para el cabeceo. */
  private apertura = 0;
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
    this.caras = lista.flatMap((a) => Array.from(a.querySelectorAll<HTMLElement>('[data-cara]')));
    this.parpados = lista.flatMap((a) =>
      Array.from(a.querySelectorAll<HTMLElement>('[data-parpado]')),
    );
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
        if (turno === this.turno) this.pista = pista;
      });
    }
    // El volumen se escucha siempre: con JSON decide cuanto abre cada vocal,
    // y sin JSON es lo unico que mueve la boca. Web Audio solo arranca tras
    // un gesto, asi que se engancha al primer play.
    const enganchar = () => {
      void escuchar(medio).then((nivel) => {
        if (turno === this.turno) this.nivel = nivel;
      });
    };
    if (!medio.paused) enganchar();
    else medio.addEventListener('play', enganchar, { once: true, signal: this.soltar.signal });

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

  private arrancar() {
    if (this.cuadro !== null || menosMovimiento()) return;
    for (const c of this.caras) c.style.transition = 'none';
    const paso = () => {
      const medio = this.medio;
      if (!medio || medio.paused || medio.ended) {
        this.cuadro = null;
        this.reposo();
        return;
      }
      const ahora = performance.now();
      this.mostrar(this.formaAhora(medio));
      this.parpadear(ahora);
      this.mecer(ahora);
      this.cuadro = requestAnimationFrame(paso);
    };
    this.proximoParpadeo = performance.now() + 1200 + Math.random() * 2000;
    this.cuadro = requestAnimationFrame(paso);
  }

  private parar() {
    if (this.cuadro !== null) cancelAnimationFrame(this.cuadro);
    this.cuadro = null;
    this.reposo();
  }

  /** Boca cerrada, ojos abiertos y la cabeza de vuelta a su sitio. */
  private reposo() {
    this.envolvente = 0;
    this.apertura = 0;
    this.mostrar('X');
    this.finParpadeo = 0;
    this.ojosCerrados = false;
    for (const p of this.parpados) p.removeAttribute('data-activo');
    for (const c of this.caras) {
      c.style.transition = '';
      c.style.transform = '';
    }
  }

  /**
   * Parpadeo mientras explica: cada 2,5 a 6 s, ojos cerrados unos 130 ms; a
   * veces dos seguidos, como hace la gente al hablar.
   */
  private parpadear(ahora: number) {
    if (this.parpados.length === 0) return;
    if (!this.ojosCerrados && ahora >= this.proximoParpadeo) {
      this.finParpadeo = ahora + 110 + Math.random() * 50;
      const doble = Math.random() < 0.15;
      this.proximoParpadeo = doble
        ? this.finParpadeo + 160
        : this.finParpadeo + 2500 + Math.random() * 3500;
    }
    const cerrar = ahora < this.finParpadeo;
    if (cerrar !== this.ojosCerrados) {
      this.ojosCerrados = cerrar;
      for (const p of this.parpados) p.toggleAttribute('data-activo', cerrar);
    }
  }

  /**
   * Una cara que solo mueve la boca parece un recorte. Mientras habla, la
   * cabeza se mece muy poco (un vaiven lento) y baja un pelo cuando la boca
   * abre: nadie habla con la cabeza clavada.
   */
  private mecer(ahora: number) {
    if (this.caras.length === 0) return;
    this.apertura += ((APERTURA[this.actual] ?? 0) - this.apertura) * 0.12;
    const s = ahora / 1000;
    const x = Math.sin(s * 0.9) * 0.35 + Math.sin(s * 2.3 + 1) * 0.12;
    const y = Math.sin(s * 1.3 + 2) * 0.25 + this.apertura * 0.9;
    const giro = Math.sin(s * 0.7 + 0.5) * 0.45 + Math.sin(s * 1.9) * 0.15;
    const t = `translate(${x.toFixed(3)}%, ${y.toFixed(3)}%) rotate(${giro.toFixed(3)}deg)`;
    for (const c of this.caras) c.style.transform = t;
  }

  private pintarAhora() {
    const medio = this.medio;
    if (!medio || medio.paused || medio.ended || menosMovimiento()) this.mostrar('X');
    else this.mostrar(this.formaAhora(medio));
  }

  /** Lo fuerte que suena la voz ahora, de 0 a 1 respecto de su propio pico. */
  private fuerza(): number | null {
    if (!this.nivel) return null;
    this.envolvente = Math.max(this.nivel(), this.envolvente * 0.85);
    this.pico = Math.max(this.envolvente, this.pico * 0.9995);
    // Con el volumen casi a cero (o silenciado) no se oye nada que medir:
    // mejor suponer una voz normal que dejar la boca a medio abrir.
    if (this.pico < 0.004) return null;
    if (this.envolvente < 0.002) return 0;
    return Math.min(1, this.envolvente / this.pico);
  }

  private formaAhora(medio: HTMLMediaElement): string {
    const fuerza = this.fuerza();
    if (this.pista) {
      const t = medio.currentTime + ADELANTO_S;
      const i = tramoEn(this.pista, t);
      if (i < 0) return 'X';
      const fin = this.pista.tiempos[i + 1] ?? this.pista.tiempos[i]! + 0.2;
      // Sin poder oir el audio se supone una voz normal.
      return elegirForma(this.pista.codigos[i]!, fin - this.pista.tiempos[i]!, fuerza ?? 0.55);
    }
    // Sin JSON: apertura solo por volumen.
    if (fuerza === null || fuerza < 0.06) return 'X';
    if (fuerza < 0.25) return 'B';
    if (fuerza < 0.5) return 'BC';
    return fuerza < 0.8 ? 'C' : 'CD';
  }

  private mostrar(forma: string) {
    if (forma === this.actual) return;
    this.actual = forma;
    const mezcla = FORMAS[forma] ?? {};
    for (const capas of this.capas) {
      for (const [nombre, capa] of capas) {
        const opacidad = mezcla[nombre] ?? 0;
        // La que sale espera un instante, ya tapada por la que entra: asi no
        // asoma la boca cerrada de debajo a medio camino entre dos formas.
        capa.style.transitionDelay = opacidad === 0 ? '45ms' : '0ms';
        capa.style.opacity = String(opacidad);
      }
    }
  }
}
