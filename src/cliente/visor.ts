import OpenSeadragon from 'openseadragon';
import type { DatosPlaca, EstructuraCliente } from './tipos';
import { movimientoReducido } from './tipos';
import * as estado from './estado';
import { crearMarca } from './marcas';

/** Fracción del ancho de la imagen que ocupa el encuadre al acercarse a una estructura. */
const ENCUADRE = 0.2;

/**
 * Cuánto se permite ampliar por encima de la resolución real de la imagen.
 * Pasado de aquí la lámina se ve borrosa y el marcador pierde utilidad.
 */
const AMPLIACION_MAXIMA = 1.5;

export class Visor {
  private osd: OpenSeadragon.Viewer;
  private datos: DatosPlaca;
  private marcadores = new Map<string, HTMLButtonElement[]>();
  private indiceImagen = -1;

  constructor(contenedor: HTMLElement, datos: DatosPlaca) {
    this.datos = datos;
    this.osd = OpenSeadragon({
      element: contenedor,
      prefixUrl: '', // no usamos los botones de imagen de OpenSeadragon
      showNavigationControl: false,
      showNavigator: true,
      navigatorId: 'minimapa',
      navigatorDisplayRegionColor: '#D9497A',
      tileSources: [],
      crossOriginPolicy: 'Anonymous',
      maxZoomPixelRatio: 2.4,
      minZoomImageRatio: 0.85,
      visibilityRatio: 0.85,
      constrainDuringPan: true,
      animationTime: movimientoReducido() ? 0 : 0.85,
      springStiffness: 6.5,
      gestureSettingsMouse: { clickToZoom: false, dblClickToZoom: true },
      gestureSettingsTouch: { clickToZoom: false, dblClickToZoom: true },
      zoomPerScroll: 1.25,
      imageSmoothingEnabled: true,
      preserveImageSizeOnResize: true,
    });

    // OpenSeadragon captura las flechas cuando el lienzo tiene el foco; aquí
    // las necesitamos para navegar entre placas, así que se desactiva su manejo.
    this.osd.addHandler('canvas-key', (ev) => {
      (ev as unknown as { preventDefaultAction: boolean }).preventDefaultAction = true;
    });

    this.osd.addHandler('open', () => {
      // La vista inicial se calcula sobre el hueco libre, no bajo el panel.
      this.osd.viewport.setMargins({ right: this.anchoTapadoPorPanel() });
      this.osd.viewport.goHome(true);
      this.pintarMarcadores();
    });
    // El panel flota sobre la lamina. Se le dice al visor cuanto tapa, para
    // que el arrastre y el zoom dejen llegar al borde derecho de la imagen
    // en vez de detenerlo debajo del panel.
    window.addEventListener('atlas:panel', () => this.ajustarMargenPanel(true));
    // Al acercar o alejar cambian las distancias en pantalla entre marcas.
    this.osd.addHandler('animation-finish', () => this.acomodarRotulos());
    this.osd.addHandler('resize', () => requestAnimationFrame(() => this.acomodarRotulos()));
    window.addEventListener('resize', () => this.ajustarMargenPanel(false));
    this.mostrarImagen(0);
  }

  /** Ancho en px que el panel superpuesto tapa por la derecha (0 si no tapa). */
  private anchoTapadoPorPanel(): number {
    const panel = document.querySelector<HTMLElement>('.panel-estructuras');
    if (!panel || getComputedStyle(panel).position !== 'absolute') return 0;
    if (document.documentElement.dataset.panel === 'plegado') return 0;
    return panel.getBoundingClientRect().width + 24; // panel + su margen
  }

  private ajustarMargenPanel(animar: boolean) {
    const derecha = this.anchoTapadoPorPanel();
    const vista = this.osd.viewport;
    // Se conserva el centro de lo que se estaba viendo dentro del hueco libre.
    const antes = vista.getCenter(true);
    vista.setMargins({ right: derecha });
    if (this.osd.world.getItemCount() === 0) return;
    vista.panTo(antes, !animar || movimientoReducido());
    vista.applyConstraints(!animar || movimientoReducido());
  }

  get viewer() {
    return this.osd;
  }

  /** Vuelve a pedir la imagen que ya estaba puesta, tras un fallo de red. */
  recargar() {
    const indice = this.indiceImagen;
    this.indiceImagen = -1;
    this.mostrarImagen(indice);
  }

  /** Cambia la imagen/aumento visible y vuelve a colocar los marcadores. */
  mostrarImagen(indice: number) {
    const imagen = this.datos.imagenes[indice];
    if (!imagen || indice === this.indiceImagen) return;
    this.indiceImagen = indice;
    // Imagen simple (sin pirámide de teselas): suficiente para las láminas
    // exportadas de Canva. Los tipos de OpenSeadragon no cubren este atajo.
    this.osd.open({ type: 'image', url: imagen.url } as unknown as Parameters<
      OpenSeadragon.Viewer['open']
    >[0]);
  }

  private estructurasVisibles(): {
    estructura: EstructuraCliente;
    punto: { x: number; y: number };
    indice: number;
  }[] {
    const salida: {
      estructura: EstructuraCliente;
      punto: { x: number; y: number };
      indice: number;
    }[] = [];
    for (const e of this.datos.estructuras) {
      let n = 0;
      for (const p of e.puntos) {
        if (p.imagen !== undefined && p.imagen !== this.indiceImagen) continue;
        salida.push({ estructura: e, punto: { x: p.x, y: p.y }, indice: n++ });
      }
    }
    return salida;
  }

  private pintarMarcadores() {
    this.osd.clearOverlays();
    this.marcadores.clear();

    const item = this.osd.world.getItemAt(0);
    if (!item) return;
    const tamano = item.getContentSize();

    for (const { estructura, punto, indice } of this.estructurasVisibles()) {
      // La marca ya no es un disco encima del punto: el punto queda limpio y
      // el nombre se aparta hacia el lado donde hay sitio.
      const { raiz, boton } = crearMarca(estructura, punto);
      if (indice > 0) boton.tabIndex = -1; // solo el primer punto entra en el orden de tabulación
      this.etiquetarMarcador(boton, estructura);

      // OpenSeadragon captura el puntero en su lienzo: si dejamos que estos
      // eventos suban, el clic nunca llega a generarse sobre la marca.
      for (const evento of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart']) {
        raiz.addEventListener(evento, (ev) => ev.stopPropagation());
      }

      boton.addEventListener('click', (ev) => {
        ev.stopPropagation();
        estado.activar(estructura.id);
        if (estado.obtener().repaso) estado.revelar(estructura.id);
      });

      const viewportPunto = item.imageToViewportCoordinates(punto.x * tamano.x, punto.y * tamano.y);
      this.osd.addOverlay({
        element: raiz,
        location: viewportPunto,
        placement: OpenSeadragon.Placement.CENTER,
        checkResize: false,
      });

      const lista = this.marcadores.get(estructura.id) ?? [];
      lista.push(boton);
      this.marcadores.set(estructura.id, lista);
    }

    this.sincronizarMarcadores();
    // Los overlays se colocan en el siguiente cuadro: se mide despues.
    requestAnimationFrame(() => this.acomodarRotulos());
  }

  /**
   * Evita que los nombres de dos marcas cercanas se pisen. Para cada marca,
   * en orden, se prueba su lado preferido, luego el otro, y despues se sube o
   * baja el rotulo; la guia se inclina para seguir unida al punto. Se queda
   * la primera posicion que no choca con un rotulo ya colocado ni con otro
   * punto; si ninguna queda libre, la que menos se superpone.
   */
  private acomodarRotulos() {
    const raices = [...this.osd.element.querySelectorAll<HTMLElement>('.indicador')];
    if (raices.length < 2) return;
    const guiaLargo = (r: HTMLElement) =>
      r.querySelector<HTMLElement>('.indicador__guia')?.offsetWidth ?? 30;

    const poner = (r: HTMLElement, lado: string, desfase: number) => {
      r.dataset.lado = lado;
      const largo = guiaLargo(r);
      const giro = Math.atan2(desfase, largo) * (lado === 'izquierda' ? -1 : 1);
      r.style.setProperty('--desfase', `${desfase}px`);
      r.style.setProperty('--giro', `${giro}rad`);
      r.style.setProperty('--estira', String(Math.hypot(largo, desfase) / largo));
    };

    // Todos vuelven a su posicion preferida antes de medir.
    for (const r of raices) poner(r, r.dataset.ladoBase ?? 'derecha', 0);

    type Caja = { l: number; t: number; r: number; b: number };
    const caja = (el: Element, margen = 0): Caja => {
      const c = el.getBoundingClientRect();
      return { l: c.left - margen, t: c.top - margen, r: c.right + margen, b: c.bottom + margen };
    };
    const choque = (a: Caja, b: Caja) =>
      Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) *
      Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));

    const puntos = raices.map((r) => {
      const p = r.querySelector('.indicador__punto');
      return p ? caja(p, 3) : null;
    });
    const colocados: Caja[] = [];

    raices.forEach((r, i) => {
      const rotulo = r.querySelector('.indicador__rotulo');
      if (!rotulo) return;
      const base = r.dataset.ladoBase ?? 'derecha';
      const otro = base === 'izquierda' ? 'derecha' : 'izquierda';
      const alto = rotulo.getBoundingClientRect().height + 4;
      const opciones: [string, number][] = [];
      for (const k of [0, -1, 1, -2, 2]) {
        opciones.push([base, k * alto], [otro, k * alto]);
      }

      let mejor: { lado: string; desfase: number; caja: Caja; costo: number } | null = null;
      for (const [lado, desfase] of opciones) {
        poner(r, lado, desfase);
        const c = caja(rotulo, 2);
        let costo = 0;
        for (const o of colocados) costo += choque(c, o);
        puntos.forEach((p, j) => {
          if (p && j !== i) costo += choque(c, p) * 4;
        });
        if (!mejor || costo < mejor.costo) mejor = { lado, desfase, caja: c, costo };
        if (costo === 0) break;
      }
      if (mejor) {
        poner(r, mejor.lado, mejor.desfase);
        colocados.push(mejor.caja);
      }
    });
  }

  /** El texto accesible del marcador se oculta durante el modo repaso. */
  private etiquetarMarcador(boton: HTMLButtonElement, estructura: EstructuraCliente) {
    const { repaso, reveladas } = estado.obtener();
    const oculto = repaso && !reveladas.has(estructura.id);
    boton.setAttribute(
      'aria-label',
      oculto
        ? `Estructura ${estructura.numero}: nombre oculto, pulsa para revelar`
        : `Estructura ${estructura.numero}: ${estructura.nombre}`,
    );
    boton.title = oculto ? `Estructura ${estructura.numero}` : estructura.nombre;
  }

  /** Refleja el estado (activa / repaso) en los marcadores ya pintados. */
  sincronizarMarcadores() {
    const { activa, repaso, reveladas } = estado.obtener();
    for (const [id, botones] of this.marcadores) {
      const es = this.datos.estructuras.find((e) => e.id === id);
      for (const b of botones) {
        const raiz = b.closest('.indicador') ?? b;
        raiz.classList.toggle('indicador--activa', id === activa);
        raiz.classList.toggle('indicador--oculta', repaso && !reveladas.has(id));
        b.classList.toggle('marcador--activo', id === activa);
        // En repaso el numero se tapa con una interrogacion hasta revelarla.
        b.classList.toggle('marcador--oculto', repaso && !reveladas.has(id));
        b.setAttribute('aria-pressed', String(id === activa));
        if (es) this.etiquetarMarcador(b, es);
      }
    }
  }

  /**
   * Imagen en la que está señalada una estructura, o `null` si vale para la
   * que ya se está viendo. Una placa puede traer dos o tres fotos del mismo
   * corte y cada estructura vivir sólo en una de ellas.
   */
  imagenDe(id: string): number | null {
    const estructura = this.datos.estructuras.find((e) => e.id === id);
    if (!estructura) return null;
    const aqui = estructura.puntos.some(
      (p) => p.imagen === undefined || p.imagen === this.indiceImagen,
    );
    if (aqui) return null;
    const otra = estructura.puntos.find((p) => p.imagen !== undefined);
    return otra?.imagen ?? null;
  }

  /** Acercamiento animado hacia una estructura: el único movimiento importante del sitio. */
  irA(id: string, enfocar = true) {
    // Si la estructura está señalada en otra de las fotos de la placa, se
    // cambia de foto y se vuelve aquí cuando la nueva esté abierta. Antes el
    // clic no hacía nada visible: el visor se quedaba donde estaba.
    const otraImagen = this.imagenDe(id);
    if (otraImagen !== null) {
      this.osd.addOnceHandler('open', () => this.irA(id, enfocar));
      // Pasa por el estado para que la tira de imágenes y el crédito se
      // enteren del cambio igual que si lo hubiera pulsado el usuario.
      estado.cambiarImagen(otraImagen);
      return;
    }

    const item = this.osd.world.getItemAt(0);
    if (!item) return;
    const estructura = this.datos.estructuras.find((e) => e.id === id);
    if (!estructura) return;

    const punto = estructura.puntos.find(
      (p) => p.imagen === undefined || p.imagen === this.indiceImagen,
    );
    if (!punto) return;

    const tamano = item.getContentSize();
    const centro = item.imageToViewportCoordinates(punto.x * tamano.x, punto.y * tamano.y);

    // El encuadre se adapta a la lámina: en una imagen pequeña acercarse al
    // 20% del ancho la ampliaría casi cuatro veces y saldría borrosa.
    const anchoContenedor = this.osd.viewport.getContainerSize().x;
    const encuadreMinimo = anchoContenedor / (AMPLIACION_MAXIMA * tamano.x);
    const ancho = Math.min(1, Math.max(ENCUADRE, encuadreMinimo));
    const alto = ancho * (tamano.y / tamano.x);

    // En pantallas grandes el panel de estructuras flota sobre el lado derecho
    // del visor: se corre el encuadre para que la estructura quede centrada en
    // la parte que de verdad se ve, no en el ancho completo del lienzo.
    const caja = new OpenSeadragon.Rect(
      centro.x - ancho / 2,
      centro.y - alto / 2,
      ancho,
      alto,
    );

    this.osd.viewport.fitBounds(caja, movimientoReducido());
    // Evita que el encuadre se salga de la lámina cuando la estructura está
    // pegada a un borde.
    this.osd.viewport.applyConstraints();
    if (enfocar) this.marcadores.get(id)?.[0]?.focus({ preventScroll: true });
  }

  acercar() {
    this.osd.viewport.zoomBy(1.4);
    this.osd.viewport.applyConstraints();
  }

  alejar() {
    this.osd.viewport.zoomBy(1 / 1.4);
    this.osd.viewport.applyConstraints();
  }

  ajustar() {
    this.osd.viewport.goHome(movimientoReducido());
    estado.activar(null);
  }

  destruir() {
    this.osd.destroy();
  }
}
