import type { VideoCliente } from './tipos';
import { ruta } from '../utils/ruta';

/** Interfaz común a los dos orígenes de video (YouTube nocookie y mp4 local). */
export interface Reproductor {
  reproducir(): void;
  pausar(): void;
  alternar(): void;
  buscar(segundos: number): void;
  readonly reproduciendo: boolean;
  onTiempo(cb: (segundos: number) => void): void;
  onEstado(cb: (reproduciendo: boolean) => void): void;
}

class Emisor {
  protected oyentesTiempo: ((s: number) => void)[] = [];
  protected oyentesEstado: ((r: boolean) => void)[] = [];
  onTiempo(cb: (s: number) => void) {
    this.oyentesTiempo.push(cb);
  }
  onEstado(cb: (r: boolean) => void) {
    this.oyentesEstado.push(cb);
  }
  protected emitirTiempo(s: number) {
    for (const cb of this.oyentesTiempo) cb(s);
  }
  protected emitirEstado(r: boolean) {
    for (const cb of this.oyentesEstado) cb(r);
  }
}

/* ------------------------- mp4 y audio (HTMLMedia) ------------------------ */

class ReproductorMedia extends Emisor implements Reproductor {
  constructor(private el: HTMLMediaElement) {
    super();
    el.addEventListener('timeupdate', () => this.emitirTiempo(el.currentTime));
    el.addEventListener('play', () => this.emitirEstado(true));
    el.addEventListener('pause', () => this.emitirEstado(false));
    el.addEventListener('ended', () => this.emitirEstado(false));
  }
  get reproduciendo() {
    return !this.el.paused && !this.el.ended;
  }
  reproducir() {
    void this.el.play();
  }
  pausar() {
    this.el.pause();
  }
  alternar() {
    if (this.reproduciendo) this.pausar();
    else this.reproducir();
  }
  buscar(s: number) {
    this.el.currentTime = s;
  }
}

/* -------------------------------- YouTube -------------------------------- */

interface JugadorYT {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(s: number, exacto: boolean): void;
  getCurrentTime(): number;
  getPlayerState(): number;
}

declare global {
  interface Window {
    YT?: {
      Player: new (el: HTMLElement | string, opciones: Record<string, unknown>) => JugadorYT;
      PlayerState: { PLAYING: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPedida = false;
function cargarApiYouTube(): Promise<void> {
  return new Promise((resolver) => {
    if (window.YT?.Player) return resolver();
    const anterior = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      anterior?.();
      resolver();
    };
    if (apiPedida) return;
    apiPedida = true;
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(s);
  });
}

class ReproductorYouTube extends Emisor implements Reproductor {
  private jugador: JugadorYT | null = null;
  private activo = false;
  private reloj: number | null = null;

  constructor(
    private contenedor: HTMLElement,
    private idVideo: string,
    private titulo: string,
  ) {
    super();
    void this.iniciar();
  }

  private async iniciar() {
    await cargarApiYouTube();
    if (!window.YT) return;
    this.jugador = new window.YT.Player(this.contenedor, {
      // youtube-nocookie: no deja cookies de seguimiento hasta que se reproduce.
      host: 'https://www.youtube-nocookie.com',
      videoId: this.idVideo,
      playerVars: {
        modestbranding: 1,
        rel: 0,
        cc_lang_pref: 'es',
        cc_load_policy: 1,
        hl: 'es',
        playsinline: 1,
      },
      events: {
        onReady: () => {
          const marco = this.contenedor.querySelector('iframe');
          marco?.setAttribute('title', `Video explicativo: ${this.titulo}`);
        },
        onStateChange: (ev: { data: number }) => {
          const reproduciendo = ev.data === (window.YT?.PlayerState.PLAYING ?? 1);
          this.activo = reproduciendo;
          this.emitirEstado(reproduciendo);
          if (reproduciendo) this.arrancarReloj();
          else this.pararReloj();
        },
      },
    });
  }

  /** YouTube no emite eventos de tiempo: se consulta cuatro veces por segundo. */
  private arrancarReloj() {
    this.pararReloj();
    this.reloj = window.setInterval(() => {
      if (this.jugador) this.emitirTiempo(this.jugador.getCurrentTime());
    }, 250);
  }

  private pararReloj() {
    if (this.reloj !== null) window.clearInterval(this.reloj);
    this.reloj = null;
  }

  get reproduciendo() {
    return this.activo;
  }
  reproducir() {
    this.jugador?.playVideo();
  }
  pausar() {
    this.jugador?.pauseVideo();
  }
  alternar() {
    if (this.activo) this.pausar();
    else this.reproducir();
  }
  buscar(s: number) {
    this.jugador?.seekTo(s, true);
    this.reproducir();
  }
}

/* ------------------------- transporte del audio -------------------------- */

function reloj(segundos: number): string {
  if (!Number.isFinite(segundos)) return '–:––';
  const m = Math.floor(segundos / 60);
  const s = Math.floor(segundos % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

const ICONO_PLAY = '<path d="M8 5.2v13.6L19 12z" />';
const ICONO_PAUSA = '<path d="M8.4 5.4h3.1v13.2H8.4zM12.5 5.4h3.1v13.2h-3.1z" />';

/**
 * Controles propios para el audio: un botón, una línea de avance y el tiempo.
 * El <audio> va oculto; esto es lo único que se ve.
 */
function montarTransporte(
  contenedor: HTMLElement,
  el: HTMLAudioElement,
  reproductor: Reproductor,
  titulo: string,
) {
  const caja = document.createElement('div');
  caja.className = 'transporte';

  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'transporte__play';
  boton.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONO_PLAY}</svg>`;
  boton.setAttribute('aria-label', `Reproducir la explicación: ${titulo}`);

  const barra = document.createElement('input');
  barra.type = 'range';
  barra.className = 'transporte__barra';
  barra.min = '0';
  barra.max = '100';
  barra.step = '0.1';
  barra.value = '0';
  barra.setAttribute('aria-label', 'Avance de la explicación');

  const tiempo = document.createElement('p');
  tiempo.className = 'transporte__tiempo tabular-nums';
  tiempo.textContent = '0:00';

  caja.append(boton, barra, tiempo);
  contenedor.appendChild(caja);

  let arrastrando = false;

  function pintar() {
    const total = el.duration;
    const t = el.currentTime;
    const pct = Number.isFinite(total) && total > 0 ? (t / total) * 100 : 0;
    if (!arrastrando) barra.value = String(pct);
    barra.style.setProperty('--avance', pct + '%');
    tiempo.textContent = Number.isFinite(total) ? `${reloj(t)} / ${reloj(total)}` : reloj(t);
  }

  boton.addEventListener('click', () => reproductor.alternar());
  barra.addEventListener('pointerdown', () => (arrastrando = true));
  barra.addEventListener('pointerup', () => (arrastrando = false));
  barra.addEventListener('input', () => {
    const total = el.duration;
    if (!Number.isFinite(total)) return;
    barra.style.setProperty('--avance', barra.value + '%');
    el.currentTime = (Number(barra.value) / 100) * total;
  });

  el.addEventListener('loadedmetadata', pintar);
  el.addEventListener('timeupdate', pintar);
  reproductor.onEstado((sonando) => {
    boton.querySelector('svg')!.innerHTML = sonando ? ICONO_PAUSA : ICONO_PLAY;
    boton.setAttribute(
      'aria-label',
      sonando ? 'Pausar la explicación' : `Reproducir la explicación: ${titulo}`,
    );
  });
  pintar();
}

/** Crea el reproductor adecuado dentro de `contenedor`. */
export function crearReproductor(
  contenedor: HTMLElement,
  video: VideoCliente,
  titulo: string,
): Reproductor {
  if (video.tipo === 'youtube') {
    const hueco = document.createElement('div');
    contenedor.appendChild(hueco);
    return new ReproductorYouTube(hueco, video.src, titulo);
  }

  if (video.tipo === 'audio') {
    // Solo voz: la caricatura del presentador hace de imagen y se anima
    // mientras suena. Los controles nativos del navegador desentonan con el
    // resto del atlas, asi que el <audio> va oculto y se gobierna desde un
    // transporte propio.
    const el = document.createElement('audio');
    el.src = ruta('audios', video.src);
    el.preload = 'metadata';
    el.hidden = true;
    el.setAttribute('aria-label', `Explicación en audio: ${titulo}`);
    contenedor.appendChild(el);
    const reproductor = new ReproductorMedia(el);
    montarTransporte(contenedor, el, reproductor, titulo);
    return reproductor;
  }

  const el = document.createElement('video');
  el.src = ruta('videos', video.src);
  el.controls = true;
  el.preload = 'metadata';
  el.playsInline = true;
  el.className = 'h-full w-full bg-black';
  el.setAttribute('aria-label', `Video explicativo: ${titulo}`);
  if (video.subtitulos) {
    const pista = document.createElement('track');
    pista.kind = 'captions';
    pista.srclang = 'es';
    pista.label = 'Español';
    pista.default = true;
    pista.src = ruta('videos', video.subtitulos);
    el.appendChild(pista);
  }
  contenedor.appendChild(el);
  return new ReproductorMedia(el);
}
