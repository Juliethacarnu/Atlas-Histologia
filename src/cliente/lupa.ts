/**
 * La lupa del visor: un circulo que sigue al puntero y enseña la lamina
 * ampliada, la misma que ya sale al pasar el raton por la bandeja de la
 * portada.
 *
 * Dentro de una placa hay dos diferencias. La primera es que aqui la foto no
 * esta quieta: el visor la mueve, la acerca y la cambia por otra, asi que no
 * vale medir la miniatura una vez; hay que preguntarle a OpenSeadragon en
 * cada movimiento por donde anda dibujada. La segunda es que aqui se enciende
 * y se apaga a mano. Sobre una lamina que ya se puede acercar con la rueda,
 * un circulo persiguiendo al cursor estorba mas de lo que ayuda mientras se
 * lee, de modo que empieza apagada y solo aparece si se pide.
 *
 * Lo que si se recuerda es la eleccion: quien enciende la lupa la quiere para
 * la sesion entera, no para una sola foto. De fabrica, apagada.
 *
 * No se dibuja la lamina a mano sobre un lienzo: basta con poner el mismo
 * archivo que ya esta viendo el visor como fondo del circulo, ampliado y
 * corrido para que el punto que hay bajo el cursor caiga justo en el centro.
 * Como es el mismo archivo, ya esta en la cache del navegador y no cuesta una
 * peticion mas.
 */
import type { Viewer } from 'openseadragon';

const CLAVE = 'atlas-lupa';

/** Cuanto amplia sobre lo que ya se ve. El mismo numero que en la portada. */
const AUMENTO = 2.6;

/**
 * ...pero sin pasarse de la resolucion real del archivo. Ampliar por encima
 * de eso no enseña mas tejido, solo lo emborrona, que es justo lo contrario
 * de lo que se le pide a una lupa. Cuando el visor ya esta muy cerca, el
 * aumento del circulo baja solo hasta el suelo de aqui abajo.
 */
const NITIDEZ = 1.6;
const AUMENTO_MINIMO = 1.4;

export interface Lupa {
  /** Si ahora mismo esta encendida. */
  encendida: boolean;
  /** La enciende, la apaga, o la pone como se le diga. */
  alternar(valor?: boolean): void;
}

function recordada(): boolean {
  try {
    return localStorage.getItem(CLAVE) === 'si';
  } catch {
    // Navegacion privada o almacenamiento bloqueado: apagada y a seguir.
    return false;
  }
}

function recordar(encendida: boolean) {
  try {
    localStorage.setItem(CLAVE, encendida ? 'si' : 'no');
  } catch {
    /* Que no se pueda recordar no es motivo para que deje de funcionar. */
  }
}

/**
 * Monta la lupa sobre el visor. Devuelve `null` si no hay raton: en una
 * pantalla tactil no hay puntero al que seguir y el propio visor ya hace
 * zoom con los dedos, de modo que ni se crea el circulo ni se deja el boton.
 *
 * @param marco   El contenedor con `position: relative` donde vive el visor.
 * @param lienzo  El elemento que OpenSeadragon usa de lienzo.
 * @param osd     El visor, para preguntarle donde esta dibujada la lamina.
 * @param urlDe   De donde sacar la foto que toca; cambia con la tira.
 */
export function montarLupa(
  marco: HTMLElement,
  lienzo: HTMLElement,
  osd: Viewer,
  urlDe: () => string | undefined,
): Lupa | null {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return null;

  const circulo = document.createElement('span');
  circulo.className = 'lupa-visor';
  circulo.setAttribute('aria-hidden', 'true');
  marco.appendChild(circulo);

  let encendida = recordada();
  let urlPuesta = '';
  /** Ultima posicion conocida del puntero, en pixeles del lienzo. */
  let donde: { x: number; y: number } | null = null;

  function esconder() {
    circulo.removeAttribute('data-ver');
  }

  function pintar() {
    if (!encendida || !donde) return esconder();

    const item = osd.world.getItemAt(0);
    if (!item) return esconder();

    // Donde cae la lamina entera dentro del lienzo, ahora mismo.
    const caja = osd.viewport.viewportToViewerElementRectangle(item.getBounds());
    const dx = donde.x - caja.x;
    const dy = donde.y - caja.y;

    // Fuera de la lamina no hay nada que ampliar: en el visor sobra campo
    // oscuro por los lados y un circulo vacio solo despista.
    if (dx < 0 || dy < 0 || dx > caja.width || dy > caja.height) return esconder();

    const url = urlDe();
    if (!url) return esconder();
    if (url !== urlPuesta) {
      circulo.style.backgroundImage = `url("${url}")`;
      urlPuesta = url;
    }

    const nativo = item.getContentSize().x;
    const tope = caja.width > 0 && nativo > 0 ? (nativo * NITIDEZ) / caja.width : AUMENTO;
    const aumento = Math.max(AUMENTO_MINIMO, Math.min(AUMENTO, tope));

    const r = circulo.offsetWidth / 2;
    circulo.style.left = `${donde.x}px`;
    circulo.style.top = `${donde.y}px`;
    circulo.style.backgroundSize = `${caja.width * aumento}px ${caja.height * aumento}px`;
    circulo.style.backgroundPosition = `${r - dx * aumento}px ${r - dy * aumento}px`;
    circulo.setAttribute('data-ver', 'si');
  }

  // En captura: las marcas de las estructuras cortan la propagacion de los
  // eventos de puntero para que OpenSeadragon no se quede el clic, y si se
  // escuchara en burbuja la lupa se congelaria al pasar sobre un rotulo.
  marco.addEventListener(
    'pointermove',
    (ev) => {
      if (ev.pointerType !== 'mouse') return;
      const caja = lienzo.getBoundingClientRect();
      donde = { x: ev.clientX - caja.left, y: ev.clientY - caja.top };
      pintar();
    },
    true,
  );

  marco.addEventListener('pointerleave', () => {
    donde = null;
    esconder();
  });

  // La lamina se mueve sola mientras el circulo esta quieto: al arrastrar,
  // al acercarse a una estructura o al cambiar de foto en la tira.
  osd.addHandler('animation', pintar);
  osd.addHandler('open', () => {
    urlPuesta = '';
    pintar();
  });

  return {
    get encendida() {
      return encendida;
    },
    alternar(valor?: boolean) {
      encendida = valor ?? !encendida;
      recordar(encendida);
      if (encendida) pintar();
      else esconder();
    },
  };
}
