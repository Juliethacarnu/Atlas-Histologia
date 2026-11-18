/**
 * El presentador diciendo de verdad el audio de la lamina.
 *
 * `scripts/hablar_wav2lip.py` deja en public/hablando/ un video mudo por
 * lamina, de la misma duracion que su audio, donde el presentador mueve los
 * labios segun esa voz. Aqui se pone encima de la foto del reproductor y se
 * lleva pegado al audio: arranca, se pausa y salta con el.
 *
 * Antes de darle a reproducir (y si el video no carga) se ve la foto de
 * siempre: el video solo aparece cuando ya tiene un cuadro que mostrar.
 */

/** Desfase tolerado antes de recolocar el video (un cuadro son 40 ms). */
const DESFASE_MAX_S = 0.12;

export class VideoHablando {
  private readonly video: HTMLVideoElement;
  private cuadro: number | null = null;

  constructor(
    private readonly avatar: HTMLElement,
    private readonly medio: HTMLMediaElement,
    url: string,
  ) {
    const video = document.createElement('video');
    video.className = 'avatar__hablando';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.setAttribute('aria-hidden', 'true');
    video.tabIndex = -1;
    video.src = url;
    this.video = video;
    avatar.append(video);

    medio.addEventListener('play', () => this.arrancar());
    medio.addEventListener('playing', () => this.arrancar());
    medio.addEventListener('pause', () => this.parar());
    medio.addEventListener('waiting', () => video.pause());
    medio.addEventListener('seeked', () => this.colocar(true));
    medio.addEventListener('ratechange', () => (video.playbackRate = medio.playbackRate));
    medio.addEventListener('ended', () => {
      this.parar();
      avatar.removeAttribute('data-hablando');
    });
    // Sin cuadro que mostrar no se destapa: se queda la foto.
    video.addEventListener('error', () => avatar.removeAttribute('data-hablando'));
    if (!medio.paused && !medio.ended) this.arrancar();
  }

  private colocar(forzar = false) {
    const t = Math.min(this.medio.currentTime, (this.video.duration || Infinity) - 0.05);
    if (forzar || Math.abs(this.video.currentTime - t) > DESFASE_MAX_S) {
      this.video.currentTime = Math.max(0, t);
    }
  }

  private arrancar() {
    if (this.cuadro !== null) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    this.video.playbackRate = this.medio.playbackRate;
    this.colocar(true);
    const paso = () => {
      if (this.medio.paused || this.medio.ended) {
        this.cuadro = null;
        return;
      }
      if (this.video.paused) {
        void this.video.play().catch(() => {
          /* bloqueado por el navegador: se queda la foto */
        });
      }
      this.colocar();
      // Se destapa cuando ya hay imagen del instante actual.
      if (this.video.readyState >= 2 && !this.video.seeking) {
        this.avatar.setAttribute('data-hablando', '');
      }
      this.cuadro = requestAnimationFrame(paso);
    };
    this.cuadro = requestAnimationFrame(paso);
  }

  /** En pausa el video se queda congelado donde iba, como la voz. */
  private parar() {
    if (this.cuadro !== null) cancelAnimationFrame(this.cuadro);
    this.cuadro = null;
    this.video.pause();
  }
}
