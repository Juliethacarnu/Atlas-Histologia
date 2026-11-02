/**
 * Mueve la boca de la caricatura al compas de la voz.
 *
 * Se mide la energia del audio que esta sonando y la cara se abre tanto como
 * suene: `npm run optimizar` deja en boca.json cuanto abre la boca cada
 * fotograma, de 0 a 1, asi que basta con poner el que se parezca al volumen
 * de ese instante. En los silencios -una coma, un punto, el hueco entre dos
 * frases- se cierra y se queda quieta. La cara se mueve cuando la persona
 * habla y para cuando calla, en vez de dar vueltas sin parar.
 *
 * Como la apertura sale de medir las propias imagenes, da igual en que orden
 * esten numeradas: no hace falta dibujarlas de menos a mas abierta.
 *
 * El primer fotograma de la carpeta es a la vez la cara en reposo y una
 * posicion mas de la rueda: por eso la cara de cuando habla casa con la de
 * cuando calla, porque es la misma imagen.
 *
 * Si no se puede escuchar el audio (el navegador no deja abrir el contexto, o
 * la explicacion viene de YouTube y el sonido vive dentro de un iframe de
 * otro dominio), la boca se mueve igual, a ritmo fijo. Lo que nunca se hace
 * es enganchar el audio antes de saber que el contexto arranca: si algo
 * falla, la explicacion tiene que seguir oyendose.
 */

/** Cuanto dura cada posicion de la boca cuando no se puede oir la voz. */
const MIN_MS = 110;
const MAX_MS = 150;
/** Siguiendo la voz, lo minimo que se aguanta una cara antes de cambiar. */
const AGUANTE_MS = 55;
/**
 * El umbral de silencio no puede ser fijo: las grabaciones estan a volumenes
 * muy distintos (la mediana va de 0,013 a 0,039 segun quien la hiciera), y un
 * numero fijo deja a unas con la boca siempre abierta y a otras siempre
 * cerrada. Se toma una fraccion del pico reciente de esa misma voz.
 */
const FRACCION_UMBRAL = 0.05;
/** Suelo absoluto, para que el ruido de fondo de un silencio no cuente. */
const UMBRAL_MINIMO = 0.002;
/** Lo que tarda en bajar la envolvente: sin esto la boca tiritaria. */
const CAIDA = 0.8;
/** Y el pico baja mucho mas despacio, para seguir el volumen de la pieza. */
const CAIDA_PICO = 0.999;
/** Un silencio tiene que durar algo para contar como silencio. */
const SILENCIO_MS = 90;

const alAzar = (min: number, max: number) => min + Math.random() * (max - min);
const menosMovimiento = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* -------------------------------- El oido -------------------------------- */

/**
 * Un solo contexto para toda la pagina. Se crea al primer intento y solo se
 * engancha el audio si el contexto esta de verdad en marcha: enganchar un
 * elemento a un contexto parado lo dejaria mudo, y eso no tiene vuelta atras.
 */
let contexto: AudioContext | null = null;
/**
 * Se guarda la promesa, no el resultado: a un elemento solo se le puede
 * enganchar una fuente en toda su vida, y si se da a play y a pausa rapido
 * dos llamadas seguidas intentarian engancharlo a la vez. Con la promesa
 * cacheada, la segunda espera a la primera en vez de romperla.
 */
const oidos = new WeakMap<HTMLMediaElement, Promise<(() => number) | null>>();

function escuchar(el: HTMLMediaElement): Promise<(() => number) | null> {
  const yaEsta = oidos.get(el);
  if (yaEsta) return yaEsta;
  const intento = enganchar(el);
  oidos.set(el, intento);
  return intento;
}

async function enganchar(el: HTMLMediaElement): Promise<(() => number) | null> {
  try {
    const Clase =
      window.AudioContext ??
      (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Clase) return null;
    contexto ??= new Clase();
    if (contexto.state === 'suspended') await contexto.resume();
    // Si no arranco, no se toca el elemento: mejor sin boca que sin voz.
    if (contexto.state !== 'running') return null;

    const fuente = contexto.createMediaElementSource(el);
    const analizador = contexto.createAnalyser();
    analizador.fftSize = 1024;
    analizador.smoothingTimeConstant = 0.6;
    fuente.connect(analizador);
    // Imprescindible: sin esto el audio se queda dentro del grafo y no suena.
    analizador.connect(contexto.destination);

    // Si el navegador para el contexto (pestana de fondo), el audio se iria
    // con el: se vuelve a levantar en cuanto la pagina esta delante otra vez.
    const despertar = () => {
      if (contexto?.state === 'suspended') void contexto.resume();
    };
    el.addEventListener('play', despertar);
    document.addEventListener('visibilitychange', despertar);

    const muestras = new Float32Array(analizador.fftSize);
    return () => {
      analizador.getFloatTimeDomainData(muestras);
      let suma = 0;
      for (let i = 0; i < muestras.length; i++) suma += muestras[i]! * muestras[i]!;
      return Math.sqrt(suma / muestras.length);
    };
  } catch {
    // Navegador sin Web Audio, o el elemento ya enganchado a otro grafo: se
    // sigue sin oido, moviendo la boca a ciegas.
    return null;
  }
}

/* ------------------------------- La boca --------------------------------- */

class Boca {
  /** Las posiciones abiertas; la cerrada es la de debajo, sin tapar. */
  private caras: HTMLElement[];
  /** 0 = la cara de reposo; 1..n = cada una de las de encima. */
  private i = 0;
  private cuadro: number | null = null;
  private siguienteSalto = 0;
  private calladoDesde = 0;
  private nivel: (() => number) | null = null;
  /** Envolvente de la voz y pico reciente, para el umbral adaptativo. */
  private envolvente = 0;
  private pico = 0;

  /** Cuanto abre la boca cada cara, incluida la de reposo (la 0). */
  private aperturas: number[];
  /** Con las medidas de boca.json se puede seguir el volumen de la voz. */
  private readonly hayMedidas: boolean;

  constructor(avatar: HTMLElement) {
    this.caras = Array.from(avatar.querySelectorAll<HTMLElement>('[data-boca]'));
    this.aperturas = [0, ...this.caras.map((c) => Number(c.dataset.apertura ?? 0) || 0)];
    this.hayMedidas = this.aperturas.some((a) => a > 0);
  }

  /** La cara cuya boca se parece mas a lo que esta sonando ahora mismo. */
  private masCercana(objetivo: number) {
    let mejor = 0;
    let dist = Infinity;
    for (let k = 0; k < this.aperturas.length; k++) {
      const d = Math.abs(this.aperturas[k]! - objetivo);
      if (d < dist) {
        dist = d;
        mejor = k;
      }
    }
    return mejor;
  }

  get sirve() {
    return this.caras.length > 0;
  }

  oir(nivel: (() => number) | null) {
    this.nivel = nivel;
  }

  arrancar() {
    if (this.cuadro !== null) return;
    this.siguienteSalto = 0;
    this.calladoDesde = 0;
    this.envolvente = 0;
    this.pico = 0;
    this.cuadro = requestAnimationFrame((t) => this.paso(t));
  }

  parar() {
    if (this.cuadro !== null) {
      cancelAnimationFrame(this.cuadro);
      this.cuadro = null;
    }
    this.i = 0;
    this.pintar();
  }

  /** Tapa todas menos la que toca; con i = 0 queda la cara de reposo. */
  private pintar() {
    for (const c of this.caras) c.removeAttribute('data-activo');
    if (this.i > 0) this.caras[this.i - 1]?.setAttribute('data-activo', '');
  }

  private paso(ahora: number) {
    this.cuadro = requestAnimationFrame((t) => this.paso(t));

    // Sin oido no hay nada que seguir: se pasan los fotogramas sin mas.
    let hayVoz = true;
    if (this.nivel) {
      const ahoraNivel = this.nivel();
      this.envolvente = Math.max(ahoraNivel, this.envolvente * CAIDA);
      this.pico = Math.max(this.envolvente, this.pico * CAIDA_PICO);
      hayVoz = this.envolvente >= Math.max(UMBRAL_MINIMO, this.pico * FRACCION_UMBRAL);
    }

    if (!hayVoz) {
      if (this.calladoDesde === 0) this.calladoDesde = ahora;
      // Un silencio corto no cierra la boca: entre silaba y silaba tambien
      // baja el volumen, y la cara no deberia pararse por eso.
      if (ahora - this.calladoDesde >= SILENCIO_MS && this.i !== 0) {
        this.i = 0;
        this.pintar();
      }
      return;
    }

    this.calladoDesde = 0;
    if (ahora < this.siguienteSalto) return;

    if (this.nivel && this.hayMedidas && this.pico > 0) {
      // Se abre tanto como suene: el volumen de ahora, medido contra el pico
      // reciente de esta misma voz, elige la cara cuya boca se le parece.
      const suelo = Math.max(UMBRAL_MINIMO, this.pico * FRACCION_UMBRAL) / this.pico;
      const relativo = Math.min(1, this.envolvente / this.pico);
      const cuanto = Math.max(0, (relativo - suelo) / Math.max(1e-6, 1 - suelo));
      // La raiz abre la boca antes: hablando normal casi nunca se llega al
      // pico, y si no la cara se quedaria medio cerrada todo el rato.
      this.i = this.masCercana(cuanto);
      this.pintar();
      this.siguienteSalto = ahora + AGUANTE_MS;
      return;
    }

    // Sin medidas o sin oido: se pasan los fotogramas en orden, sin mas.
    this.i = (this.i + 1) % (this.caras.length + 1);
    this.pintar();
    this.siguienteSalto = ahora + alAzar(MIN_MS, MAX_MS);
  }
}

const bocas = new WeakMap<HTMLElement, Boca>();

/**
 * Enciende o apaga el movimiento de la boca de un avatar. Si la persona solo
 * tiene un fotograma, o si se ha pedido menos movimiento, no hace nada.
 * `medio` es el <audio> de la explicacion, para poder seguir la voz; sin el,
 * la boca se mueve a ciegas.
 */
export function moverBoca(
  avatar: HTMLElement,
  hablando: boolean,
  medio: HTMLMediaElement | null = null,
) {
  if (menosMovimiento()) return;

  let boca = bocas.get(avatar);
  if (!boca) {
    boca = new Boca(avatar);
    bocas.set(avatar, boca);
  }
  const suya = boca;
  if (!suya.sirve) return;

  if (!hablando) {
    suya.parar();
    return;
  }

  suya.arrancar();
  if (medio) {
    void escuchar(medio).then((nivel) => {
      if (nivel) suya.oir(nivel);
    });
  }
}
