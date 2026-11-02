/**
 * Mueve la boca de la caricatura segun suene o no la voz.
 *
 * Son dos posiciones y nada mas: la cara en reposo -el primer fotograma de la
 * carpeta, con la boca cerrada- y la siguiente, con la boca abierta. Mientras
 * se oye voz se van turnando; en cuanto el audio baja del umbral -una coma, un
 * punto, el hueco entre dos frases- se queda la de reposo y se para.
 *
 * Dos poses alternas leen mejor que repartir muchas caras por volumen: es como
 * se ha animado siempre el habla en dibujos, y no depende de acertar que cara
 * corresponde a que nivel.
 *
 * El umbral no puede ser un numero fijo. Las grabaciones estan a volumenes muy
 * distintos (la mediana va de 0,013 a 0,039 segun quien la hiciera) y con un
 * valor fijo unas se quedan con la boca siempre abierta y otras siempre
 * cerrada. Se toma una fraccion del pico reciente de esa misma voz.
 *
 * Si no se puede escuchar el audio (el navegador no deja abrir el contexto, o
 * la explicacion viene de YouTube y el sonido vive dentro de un iframe de otro
 * dominio), la boca se turna igual, a ritmo fijo. Lo que nunca se hace es
 * enganchar el audio antes de saber que el contexto arranca: si algo falla, la
 * explicacion tiene que seguir oyendose.
 */

/** Cuanto dura cada una de las dos posiciones. */
const MIN_MS = 110;
const MAX_MS = 150;
/** Que fraccion del pico reciente hay que pasar para contar como voz. */
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
    // sigue sin oido, turnando la boca a ciegas.
    return null;
  }
}

/* ------------------------------- La boca --------------------------------- */

class Boca {
  /** La cara con la boca abierta; la cerrada es la de debajo, sin tapar. */
  private readonly abierta: HTMLElement | null;
  /** false = cara en reposo (boca cerrada); true = boca abierta. */
  private abierto = false;
  private cuadro: number | null = null;
  private siguienteSalto = 0;
  private calladoDesde = 0;
  private nivel: (() => number) | null = null;
  /** Envolvente de la voz y pico reciente, para el umbral adaptativo. */
  private envolvente = 0;
  private pico = 0;

  constructor(avatar: HTMLElement) {
    this.abierta = avatar.querySelector<HTMLElement>('[data-boca]');
  }

  get sirve() {
    return this.abierta !== null;
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
    this.cerrar();
  }

  private cerrar() {
    this.abierto = false;
    this.abierta?.removeAttribute('data-activo');
  }

  private paso(ahora: number) {
    this.cuadro = requestAnimationFrame((t) => this.paso(t));

    // Sin oido no hay nada que seguir: se turna la boca sin mas.
    let hayVoz = true;
    if (this.nivel) {
      this.envolvente = Math.max(this.nivel(), this.envolvente * CAIDA);
      this.pico = Math.max(this.envolvente, this.pico * CAIDA_PICO);
      hayVoz = this.envolvente >= Math.max(UMBRAL_MINIMO, this.pico * FRACCION_UMBRAL);
    }

    if (!hayVoz) {
      if (this.calladoDesde === 0) this.calladoDesde = ahora;
      // Un silencio corto no cierra la boca: entre silaba y silaba tambien
      // baja el volumen, y la cara no deberia pararse por eso.
      if (ahora - this.calladoDesde >= SILENCIO_MS && this.abierto) this.cerrar();
      return;
    }

    this.calladoDesde = 0;
    if (ahora < this.siguienteSalto) return;

    this.abierto = !this.abierto;
    if (this.abierto) this.abierta?.setAttribute('data-activo', '');
    else this.abierta?.removeAttribute('data-activo');
    this.siguienteSalto = ahora + alAzar(MIN_MS, MAX_MS);
  }
}

const bocas = new WeakMap<HTMLElement, Boca>();

/**
 * Enciende o apaga el movimiento de la boca de un avatar. Si la persona solo
 * tiene un fotograma, o si se ha pedido menos movimiento, no hace nada.
 * `medio` es el <audio> de la explicacion, para poder seguir la voz; sin el,
 * la boca se turna a ciegas.
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
