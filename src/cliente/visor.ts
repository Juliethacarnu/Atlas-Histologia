import OpenSeadragon from 'openseadragon';
import type { DatosPlaca, EstructuraCliente } from './tipos';
import { movimientoReducido } from './tipos';
import * as estado from './estado';

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

    this.osd.addHandler('open', () => this.pintarMarcadores());
    this.mostrarImagen(0);
  }

  get viewer() {
    return this.osd;
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
      const boton = document.createElement('button');
      boton.type = 'button';
      boton.className = 'marcador';
      boton.dataset.estructura = estructura.id;
      boton.setAttribute('aria-pressed', 'false');
      boton.innerHTML = `<span aria-hidden="true">${estructura.numero}</span>`;
      this.etiquetarMarcador(boton, estructura);
      if (indice > 0) boton.tabIndex = -1; // solo el primer punto entra en el orden de tabulación

      // OpenSeadragon captura el puntero en su lienzo: si dejamos que estos
      // eventos suban, el clic nunca llega a generarse sobre el marcador.
      for (const evento of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart']) {
        boton.addEventListener(evento, (ev) => ev.stopPropagation());
      }

      boton.addEventListener('click', (ev) => {
        ev.stopPropagation();
        estado.activar(estructura.id);
        if (estado.obtener().repaso) estado.revelar(estructura.id);
      });

      const viewportPunto = item.imageToViewportCoordinates(punto.x * tamano.x, punto.y * tamano.y);
      this.osd.addOverlay({
        element: boton,
        location: viewportPunto,
        placement: OpenSeadragon.Placement.CENTER,
        checkResize: false,
      });

      const lista = this.marcadores.get(estructura.id) ?? [];
      lista.push(boton);
      this.marcadores.set(estructura.id, lista);
    }

    this.sincronizarMarcadores();
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
    const { activa } = estado.obtener();
    for (const [id, botones] of this.marcadores) {
      const es = this.datos.estructuras.find((e) => e.id === id);
      for (const b of botones) {
        b.classList.toggle('marcador--activo', id === activa);
        b.setAttribute('aria-pressed', String(id === activa));
        if (es) this.etiquetarMarcador(b, es);
      }
    }
  }

  /** Acercamiento animado hacia una estructura: el único movimiento importante del sitio. */
  irA(id: string, enfocar = true) {
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
      centro.x - ancho / 2 + this.desplazamientoPanel(ancho),
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

  /** Mitad del ancho del panel superpuesto, en unidades del viewport. */
  private desplazamientoPanel(anchoEncuadre: number): number {
    const panel = document.querySelector<HTMLElement>('.panel-estructuras');
    if (!panel || getComputedStyle(panel).position !== 'absolute') return 0;
    const anchoContenedor = this.osd.viewport.getContainerSize().x;
    if (anchoContenedor === 0) return 0;
    const tapadoPx = panel.getBoundingClientRect().width + 24; // panel + su margen
    return (tapadoPx / 2 / anchoContenedor) * anchoEncuadre;
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
