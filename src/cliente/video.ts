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
    // mientras suena. Se usan los controles nativos para poder desplazarse.
    const el = document.createElement('audio');
    el.src = ruta('videos', video.src);
    el.controls = true;
    el.preload = 'metadata';
    el.className = 'w-full';
    el.setAttribute('aria-label', `Explicación en audio: ${titulo}`);
    contenedor.appendChild(el);
    return new ReproductorMedia(el);
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
