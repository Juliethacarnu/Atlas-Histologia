/**
 * Orquestador de la página de placa: conecta el visor, la lista lateral, la
 * ficha, el reproductor del avatar, el modo repaso, el quiz, la URL y el teclado.
 */
import { Visor } from './visor';
import { leerDatosPlaca, movimientoReducido } from './tipos';
import type { DatosPlaca, EstructuraCliente } from './tipos';
import * as estado from './estado';
import { crearReproductor, type Reproductor } from './video';
import { prepararQuiz } from './quiz';
import { montarTranscripcion } from './transcripcion';
import { moverBoca } from './boca';

const datos = leerDatosPlaca();
if (datos) iniciar(datos);

/**
 * El visor ocupa lo que queda de ventana bajo la cabecera y la barra de
 * navegación. Sus alturas dependen de la tipografía ya cargada, así que se
 * miden en vez de darlas por supuestas: con un valor fijo sobraban píxeles y
 * la lámina se salía por abajo.
 */
function medirAlturaSuperior() {
  const cabecera = document.querySelector('body > header');
  const nav = document.getElementById('nav-placas');
  const alto =
    (cabecera?.getBoundingClientRect().height ?? 0) + (nav?.getBoundingClientRect().height ?? 0);
  if (alto > 0) document.documentElement.style.setProperty('--alto-superior', alto + 'px');
}
medirAlturaSuperior();
window.addEventListener('resize', medirAlturaSuperior);
document.fonts?.ready.then(medirAlturaSuperior);

function iniciar(datos: DatosPlaca) {
  const marco = document.getElementById('marco-visor');
  const contenedor = document.getElementById('visor');
  if (!marco || !contenedor) return;

  const porId = new Map(datos.estructuras.map((e) => [e.id, e]));
  const ordenadas = [...datos.estructuras].sort((a, b) => a.numero - b.numero);
  const visor = new Visor(contenedor, datos);

  /* ---------------------- Estado de carga del visor ---------------------- */
  const aviso = document.getElementById('estado-visor');
  const fallo = document.getElementById('fallo-visor');
  const reintentar = document.getElementById('fallo-reintentar');

  visor.viewer.addHandler('open', () => {
    aviso?.setAttribute('hidden', '');
    fallo?.setAttribute('hidden', '');
  });
  visor.viewer.addHandler('open-failed', () => {
    aviso?.setAttribute('hidden', '');
    fallo?.removeAttribute('hidden');
  });
  // La lámina sigue siendo útil sin la foto, pero merece un segundo intento:
  // casi siempre es la red del móvil, no un archivo que falte.
  reintentar?.addEventListener('click', () => {
    fallo?.setAttribute('hidden', '');
    aviso?.removeAttribute('hidden');
    visor.recargar();
  });

  /* --------------------------- Crédito e imagen -------------------------- */
  const credito = document.getElementById('credito-imagen');
  function pintarCredito() {
    const im = datos.imagenes[estado.obtener().imagen];
    if (credito) credito.textContent = im?.credito ?? '';
  }
  pintarCredito();

  for (const boton of document.querySelectorAll<HTMLButtonElement>('[data-imagen]')) {
    boton.addEventListener('click', () => {
      estado.cambiarImagen(Number(boton.dataset.imagen));
      cerrarLaminas();
    });
  }

  /* --------------- La tira de imagenes, como hoja en movil ---------------- */
  const tira = document.getElementById('tira-imagenes');
  const abrirLaminas = document.getElementById('abrir-laminas');
  const cerrarLaminasBoton = document.getElementById('cerrar-laminas');

  function cerrarLaminas() {
    if (!tira) return;
    tira.dataset.abierta = 'no';
    abrirLaminas?.setAttribute('aria-expanded', 'false');
  }
  abrirLaminas?.addEventListener('click', () => {
    if (!tira) return;
    const abierta = tira.dataset.abierta === 'si';
    tira.dataset.abierta = abierta ? 'no' : 'si';
    abrirLaminas.setAttribute('aria-expanded', String(!abierta));
    if (!abierta) tira.querySelector<HTMLButtonElement>('[data-imagen]')?.focus();
  });
  cerrarLaminasBoton?.addEventListener('click', () => {
    cerrarLaminas();
    abrirLaminas?.focus();
  });
  // Tocar fuera de la hoja la cierra, como cualquier hoja del sistema.
  document.addEventListener('pointerdown', (ev) => {
    if (!tira || tira.dataset.abierta !== 'si') return;
    const destino = ev.target as HTMLElement | null;
    if (destino?.closest('#tira-imagenes, #abrir-laminas')) return;
    cerrarLaminas();
  });

  /* ------------------- El aumento, mientras cambia ----------------------- */
  const chip = document.getElementById('chip-zoom');
  let ocultarChip = 0;
  let zoomAnterior: number | null = null;
  // El primer aviso de zoom de cada imagen es el encuadre inicial, no un
  // cambio pedido por nadie: ese no se anuncia.
  visor.viewer.addHandler('open', () => {
    zoomAnterior = null;
  });
  visor.viewer.addHandler('zoom', () => {
    if (!chip) return;
    const vista = visor.viewer.viewport;
    const encaje = vista.getHomeZoom();
    if (!encaje) return;
    // Cuantas veces la lamina entera, que es lo que el lector entiende por
    // aumento. El ratio contra los pixeles originales daria «x0,6» al abrir
    // y nadie lee eso como «la foto completa». Se pide el zoom de destino,
    // no el de este fotograma: el aviso llega con el gesto, no despues.
    const ahora = vista.getZoom() / encaje;
    if (zoomAnterior === null) {
      zoomAnterior = ahora;
      return;
    }
    if (Math.abs(ahora - zoomAnterior) < 0.01) return;
    zoomAnterior = ahora;
    chip.textContent = '×' + ahora.toFixed(1).replace('.', ',');
    chip.dataset.visible = 'si';
    window.clearTimeout(ocultarChip);
    ocultarChip = window.setTimeout(() => {
      chip.dataset.visible = 'no';
    }, 1100);
  });

  /* ------------------------ Controles del visor -------------------------- */
  const acciones: Record<string, () => void> = {
    acercar: () => visor.acercar(),
    alejar: () => visor.alejar(),
    ajustar: () => visor.ajustar(),
    'pantalla-completa': () => {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void marco.requestFullscreen?.();
    },
  };
  for (const boton of document.querySelectorAll<HTMLButtonElement>('[data-accion]')) {
    const accion = acciones[boton.dataset.accion ?? ''];
    if (accion) boton.addEventListener('click', accion);
  }

  /* --------------------------- Lista lateral ----------------------------- */
  const filas = new Map<string, HTMLButtonElement>();
  for (const fila of document.querySelectorAll<HTMLButtonElement>('[data-fila]')) {
    const id = fila.dataset.fila!;
    filas.set(id, fila);
    fila.addEventListener('click', () => {
      estado.activar(id);
      if (estado.obtener().repaso) estado.revelar(id);
    });
  }

  /* ------------------------------- Ficha --------------------------------- */
  const ficha = document.getElementById('ficha-estructura');
  const fNumero = document.getElementById('ficha-numero');
  const fNombre = document.getElementById('ficha-nombre');
  const fOculto = document.getElementById('ficha-oculto');
  const fDescripcion = document.getElementById('ficha-descripcion');
  const fRevelar = document.getElementById('ficha-revelar');
  const fCerrar = document.getElementById('ficha-cerrar');
  const fAnterior = document.getElementById('ficha-anterior') as HTMLButtonElement | null;
  const fSiguiente = document.getElementById('ficha-siguiente') as HTMLButtonElement | null;
  const fVideo = document.getElementById('ficha-video');
  const fVideoTexto = document.getElementById('ficha-video-texto');
  if (fVideoTexto && datos.video?.tipo === 'audio') fVideoTexto.textContent = 'Oír en el audio';
  const fEnlace = document.getElementById('ficha-enlace');
  const fEnlaceTexto = document.getElementById('ficha-enlace-texto');

  /**
   * La visibilidad de la ficha no puede ir por el atributo `hidden`: la regla
   * [hidden]{display:none!important} de la capa base de Tailwind gana a
   * cualquier !important sin capa, y en móvil la hoja inferior necesita
   * animarse. Se usa data-abierta, con `inert` para la accesibilidad.
   */
  function abrirFicha() {
    if (!ficha) return;
    const estaba = ficha.dataset.abierta === 'si';
    ficha.dataset.abierta = 'si';
    ficha.removeAttribute('inert');
    if (!estaba) ficha.dataset.altura = 'media';
    ajustarVisor();
  }
  function cerrarFicha() {
    if (!ficha) return;
    ficha.dataset.abierta = 'no';
    ficha.setAttribute('inert', '');
    delete document.documentElement.dataset.ficha;
  }

  /**
   * En movil la ficha es una hoja con dos paradas. El atributo del <html> es
   * lo que encoge el visor a 160 px: asi la lamina no queda debajo de la
   * hoja, que era el problema de fondo de la pagina en una pantalla pequena.
   */
  function alturaFicha(altura: 'media' | 'alta') {
    if (!ficha) return;
    ficha.dataset.altura = altura;
    ajustarVisor();
  }

  /**
   * El visor baja a 160 px solo cuando la hoja llegaria a taparlo. Una ficha
   * de dos lineas no tapa nada, y encoger la lamina por sistema seria perder
   * la mitad de la foto para no ganar nada.
   */
  const asaElemento = document.querySelector<HTMLElement>('.asa');
  function ajustarVisor() {
    const html = document.documentElement;
    const abierta = ficha?.dataset.abierta === 'si';
    const enMovil = !!asaElemento && getComputedStyle(asaElemento).display !== 'none';
    if (!ficha || !abierta || !enMovil) {
      delete html.dataset.ficha;
      recolocar();
      return;
    }
    requestAnimationFrame(() => {
      // Hasta donde llega lo que no se puede tapar: el visor y su asa.
      const tope = asaElemento!.getBoundingClientRect().bottom;
      const estorba = window.innerHeight - ficha.getBoundingClientRect().height < tope;
      if (estorba) html.dataset.ficha = ficha.dataset.altura ?? 'media';
      else delete html.dataset.ficha;
      recolocar();
    });
  }

  /**
   * Tras encoger o estirar el visor, la estructura elegida tiene que seguir
   * a la vista: se vuelve a encuadrar cuando la transicion ha terminado.
   */
  let reencuadre = 0;
  function recolocar() {
    const id = estado.obtener().activa;
    if (!id) return;
    window.clearTimeout(reencuadre);
    reencuadre = window.setTimeout(() => visor.irA(id, false), movimientoReducido() ? 0 : 280);
  }

  const fAltura = document.getElementById('ficha-altura');
  fAltura?.addEventListener('click', () => {
    alturaFicha(ficha?.dataset.altura === 'alta' ? 'media' : 'alta');
  });

  // El tirador tambien se arrastra, que es el gesto que la hoja pide a la
  // vista. Hacia abajo desde media altura, la ficha se cierra.
  if (fAltura) {
    let inicio: number | null = null;
    fAltura.addEventListener('pointerdown', (ev) => {
      inicio = ev.clientY;
    });
    fAltura.addEventListener('pointerup', (ev) => {
      if (inicio === null) return;
      const recorrido = ev.clientY - inicio;
      inicio = null;
      if (recorrido < -40) alturaFicha('alta');
      else if (recorrido > 40) {
        if (ficha?.dataset.altura === 'alta') alturaFicha('media');
        else estado.activar(null);
      }
    });
  }

  function vecina(paso: number): EstructuraCliente | undefined {
    const activa = estado.obtener().activa;
    const i = ordenadas.findIndex((e) => e.id === activa);
    if (i === -1) return ordenadas[0];
    return ordenadas[i + paso];
  }

  fCerrar?.addEventListener('click', () => estado.activar(null));
  fRevelar?.addEventListener('click', () => {
    const activa = estado.obtener().activa;
    if (activa) estado.revelar(activa);
  });
  fAnterior?.addEventListener('click', () => {
    const v = vecina(-1);
    if (v) estado.activar(v.id);
  });
  fSiguiente?.addEventListener('click', () => {
    const v = vecina(1);
    if (v) estado.activar(v.id);
  });
  fEnlace?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      if (fEnlaceTexto) {
        fEnlaceTexto.textContent = 'Enlace copiado';
        window.setTimeout(() => {
          fEnlaceTexto.textContent = 'Copiar enlace';
        }, 1800);
      }
    } catch {
      if (fEnlaceTexto) fEnlaceTexto.textContent = window.location.href;
    }
  });

  /* ------------------------------- El asa -------------------------------- */
  /* La barra de 64 px bajo el visor en movil. Dice que estructura esta
     elegida, deja pasar a la de al lado y abre al presentador. */
  const asaTitulo = document.getElementById('asa-titulo');
  const asaPista = document.getElementById('asa-pista');
  const asaAbrir = document.getElementById('asa-abrir');
  const asaAnterior = document.getElementById('asa-anterior') as HTMLButtonElement | null;
  const asaSiguiente = document.getElementById('asa-siguiente') as HTMLButtonElement | null;
  const asaPresentador = document.getElementById('asa-presentador');
  // Los textos de reposo los pone la plantilla; aqui solo se recuerdan.
  const asaTituloInicial = asaTitulo?.textContent ?? '';
  const asaPistaInicial = asaPista?.textContent ?? '';

  /**
   * Hay placas cuyas estructuras estan todas senaladas en la segunda foto:
   * el duodeno es una, y quien la abre ve una lamina sin un solo marcador y
   * nada que le diga que los hay en la otra. Esto lo dice, y lleva alli.
   */
  function imagenConEstructuras(actual: number): number | null {
    if (datos.imagenes.length < 2) return null;
    const aqui = datos.estructuras.some((e) =>
      e.puntos.some((pt) => pt.imagen === undefined || pt.imagen === actual),
    );
    if (aqui) return null;
    for (const e of datos.estructuras) {
      const otro = e.puntos.find((pt) => pt.imagen !== undefined);
      if (otro?.imagen !== undefined) return otro.imagen;
    }
    return null;
  }
  function cuantasEn(indice: number): number {
    return datos.estructuras.filter((e) =>
      e.puntos.some((pt) => pt.imagen === undefined || pt.imagen === indice),
    ).length;
  }

  /** En reposo el asa presenta la lamina; con algo elegido, lo nombra. */
  function pintarAsa() {
    const st = estado.obtener();
    const estructura = st.activa ? porId.get(st.activa) : undefined;
    if (asaAnterior) asaAnterior.disabled = !vecina(-1);
    if (asaSiguiente) asaSiguiente.disabled = !vecina(1);
    if (asaTitulo && asaPista) {
      const tapada = !!estructura && st.repaso && !st.reveladas.has(estructura.id);
      if (!estructura) {
        const otra = imagenConEstructuras(st.imagen);
        if (otra === null) {
          asaTitulo.textContent = asaTituloInicial;
          asaPista.textContent = asaPistaInicial;
        } else {
          const n = cuantasEn(otra);
          const donde = datos.imagenes[otra]?.aumento || 'la otra imagen';
          asaTitulo.textContent = 'Esta foto no lleva marcadores';
          asaPista.textContent =
            n === 1 ? `Ver la estructura de ${donde}` : `Ver las ${n} estructuras de ${donde}`;
        }
      } else {
        asaTitulo.textContent = tapada
          ? 'Estructura ' + estructura.numero
          : estructura.numero + ' · ' + estructura.nombre;
        asaPista.textContent = tapada ? 'Pulsa para revelar' : 'Ver la ficha';
      }
    }
    asaAbrir?.setAttribute('aria-expanded', String(ficha?.dataset.abierta === 'si'));
  }
  pintarAsa();

  asaAbrir?.addEventListener('click', () => {
    const activa = estado.obtener().activa;
    // Sin nada elegido, el asa es la puerta de entrada: lleva a la primera
    // estructura, o a la foto donde esten, si en esta no hay ninguna.
    if (!activa) {
      const otra = imagenConEstructuras(estado.obtener().imagen);
      if (otra !== null) {
        estado.cambiarImagen(otra);
        return;
      }
      const primera = ordenadas[0];
      if (primera) estado.activar(primera.id);
      return;
    }
    if (ficha?.dataset.abierta === 'si') alturaFicha('alta');
    else abrirFicha();
  });
  asaAnterior?.addEventListener('click', () => {
    const v = vecina(-1);
    if (v) estado.activar(v.id);
  });
  asaSiguiente?.addEventListener('click', () => {
    const v = vecina(1);
    if (v) estado.activar(v.id);
  });

  /* ---------------------------- Modo repaso ------------------------------ */
  const botonRepaso = document.getElementById('boton-repaso');
  botonRepaso?.addEventListener('click', () => estado.alternarRepaso());

  /* ------------------------ Reproductor del avatar ----------------------- */
  const explicador = document.getElementById('explicador');
  const minimizar = document.getElementById('explicador-minimizar');
  const abrir = document.getElementById('explicador-abrir');
  let reproductor: Reproductor | null = null;

  function alternarExplicador(minimizado?: boolean) {
    if (!explicador) return;
    const siguiente = minimizado ?? !explicador.classList.contains('explicador--minimizado');
    explicador.classList.toggle('explicador--minimizado', siguiente);
    abrir?.setAttribute('aria-expanded', String(!siguiente));
  }
  minimizar?.addEventListener('click', () => {
    alternarExplicador(true);
    abrir?.focus();
  });
  abrir?.addEventListener('click', () => {
    alternarExplicador(false);
    minimizar?.focus();
  });
  // En movil la burbuja no se ve: quien abre al presentador es su retrato
  // dentro del asa, pero el estado es el mismo.
  asaPresentador?.addEventListener('click', () => {
    alternarExplicador(false);
    minimizar?.focus();
  });
  // El explicador empieza recogido como burbuja cuando estorbaría más que
  // ayuda: en móvil siempre, y sin audio ni video porque entonces la tarjeta
  // sólo repite la descripción del panel y tapa marcadores de la lámina.
  const estorba = window.matchMedia('(max-width: 1023px)').matches || !datos.video;
  if (estorba) alternarExplicador(true);

  const hueco = document.getElementById('hueco-video');
  if (datos.video && hueco) {
    reproductor = crearReproductor(hueco, datos.video, datos.titulo);

    // El audio no puede mostrar subtitulos: el .vtt se pinta como transcripcion.
    if (datos.video.tipo === 'audio' && datos.video.subtitulos) {
      void montarTranscripcion(datos.video.subtitulos, reproductor);
    }

    const botonAlternar = document.getElementById('video-alternar');
    const iconoPlay = botonAlternar?.querySelector('[data-icono="play"]');
    const iconoPausa = botonAlternar?.querySelector('[data-icono="pausa"]');
    const textoAlternar = document.getElementById('video-alternar-texto');
    const elTiempo = document.getElementById('video-tiempo');
    const elCapitulo = document.getElementById('video-capitulo-actual');
    const botonesCapitulo = Array.from(
      document.querySelectorAll<HTMLButtonElement>('[data-capitulo]'),
    );
    const avatares = Array.from(
      document.querySelectorAll<HTMLElement>('.avatar--animable, .avatar--boca'),
    );

    botonAlternar?.addEventListener('click', () => reproductor?.alternar());

    for (const b of botonesCapitulo) {
      b.addEventListener('click', () => {
        reproductor?.buscar(Number(b.dataset.tiempo));
        estado.activar(b.dataset.capitulo!, 'usuario');
      });
    }

    reproductor.onEstado((reproduciendo) => {
      iconoPlay?.toggleAttribute('hidden', reproduciendo);
      iconoPausa?.toggleAttribute('hidden', !reproduciendo);
      if (textoAlternar) {
        textoAlternar.textContent = reproduciendo ? 'Pausar el video' : 'Reproducir el video';
      }
      // La caricatura solo se anima mientras suena la explicacion.
      for (const a of avatares) {
        a.classList.toggle('avatar--hablando', reproduciendo);

        // Y si tiene mas de un fotograma, se le mueve la boca.
        moverBoca(a, reproduciendo);

        // Si el presentador tiene bucle en video, se reproduce mudo a la par.
        const bucle = a.querySelector<HTMLVideoElement>('[data-bucle]');
        if (!bucle) continue;
        if (reproduciendo && !movimientoReducido()) {
          void bucle.play().catch(() => {
            /* el navegador puede bloquearlo: se queda en el poster */
          });
        } else {
          bucle.pause();
        }
      }
    });

    const capitulos = [...datos.video.capitulos].sort(
      (a, b) => a.tiempoSegundos - b.tiempoSegundos,
    );
    let ultimoCapitulo: string | null = null;

    reproductor.onTiempo((segundos) => {
      if (elTiempo) {
        const m = Math.floor(segundos / 60);
        const s = Math.floor(segundos % 60);
        elTiempo.textContent = m + ':' + String(s).padStart(2, '0');
      }
      // Capítulo vigente: el último cuyo tiempo ya pasó.
      let vigente: string | null = null;
      for (const c of capitulos) {
        if (segundos + 0.25 >= c.tiempoSegundos) vigente = c.estructuraId;
        else break;
      }
      if (vigente !== ultimoCapitulo) {
        ultimoCapitulo = vigente;
        for (const b of botonesCapitulo) {
          b.setAttribute('aria-current', String(b.dataset.capitulo === vigente));
        }
        const nombre = vigente ? porId.get(vigente)?.nombre : null;
        if (elCapitulo) elCapitulo.textContent = nombre ?? '';
        // Al avanzar el video, el visor se centra en la estructura del capítulo.
        if (vigente) estado.activar(vigente, 'video');
      }
    });
  }

  /* ------------------------------- Quiz ---------------------------------- */
  prepararQuiz(datos, visor);

  /* ------------------------- Navegación y teclado ------------------------ */
  const nav = document.getElementById('nav-placas');
  const anterior = nav?.dataset.anterior || null;
  const siguiente = nav?.dataset.siguiente || null;

  document.addEventListener('keydown', (ev) => {
    const destino = ev.target as HTMLElement | null;
    if (
      ev.metaKey ||
      ev.ctrlKey ||
      ev.altKey ||
      destino?.closest('input, textarea, select, [contenteditable="true"]')
    ) {
      return;
    }
    // Mientras haya un diálogo abierto manda él, Escape incluido: si aquí
    // hiciéramos preventDefault, el <dialog> no se cerraría nunca.
    if (document.querySelector('dialog[open]')) return;

    switch (ev.key) {
      case 'ArrowLeft':
        if (anterior) window.location.href = anterior;
        break;
      case 'ArrowRight':
        if (siguiente) window.location.href = siguiente;
        break;
      case '+':
      case '=':
        visor.acercar();
        break;
      case '-':
      case '_':
        visor.alejar();
        break;
      case '0':
        visor.ajustar();
        break;
      case 'm':
      case 'M':
        alternarExplicador();
        break;
      case 'r':
      case 'R':
        estado.alternarRepaso();
        break;
      case 'Escape':
        if (tira?.dataset.abierta === 'si') cerrarLaminas();
        else estado.activar(null);
        break;
      default:
        return;
    }
    ev.preventDefault();
  });

  /* ------------------------------- URL ----------------------------------- */
  function idDesdeHash(): string | null {
    const m = window.location.hash.match(/^#estructura=(.+)$/);
    return m ? decodeURIComponent(m[1]!) : null;
  }

  window.addEventListener('hashchange', () => {
    const id = idDesdeHash();
    if (id && porId.has(id)) estado.activar(id, 'url');
  });

  /* ------------------- Reacción única a los cambios ---------------------- */
  estado.suscribir((st, cambio) => {
    if (cambio === 'imagen') {
      visor.mostrarImagen(st.imagen);
      pintarCredito();
      for (const b of document.querySelectorAll<HTMLButtonElement>('[data-imagen]')) {
        b.setAttribute('aria-pressed', String(Number(b.dataset.imagen) === st.imagen));
      }
      pintarAsa();
      return;
    }

    if (cambio === 'repaso') {
      document.body.classList.toggle('repaso-activo', st.repaso);
      botonRepaso?.setAttribute('aria-pressed', String(st.repaso));
    }

    // Lista lateral
    for (const [id, fila] of filas) {
      fila.setAttribute('aria-current', String(id === st.activa));
      const oculto = st.repaso && !st.reveladas.has(id);
      fila.querySelector<HTMLElement>('[data-nombre]')?.toggleAttribute('hidden', oculto);
      fila.querySelector<HTMLElement>('[data-oculto]')?.toggleAttribute('hidden', !oculto);
    }

    // Nombres de los capítulos del video
    for (const b of document.querySelectorAll<HTMLElement>('[data-capitulo]')) {
      const id = b.dataset.capitulo!;
      const oculto = st.repaso && !st.reveladas.has(id);
      const nodo = b.querySelector<HTMLElement>('[data-nombre-capitulo]');
      if (nodo) nodo.textContent = oculto ? '· · ·' : (porId.get(id)?.nombre ?? '');
    }

    visor.sincronizarMarcadores();

    // Ficha
    const estructura = st.activa ? porId.get(st.activa) : undefined;

    pintarAsa();

    if (!estructura) {
      cerrarFicha();
      if (window.location.hash) {
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
      return;
    }

    const oculto = st.repaso && !st.reveladas.has(estructura.id);
    if (fNumero) fNumero.textContent = String(estructura.numero);
    if (fNombre) {
      fNombre.textContent = oculto ? 'Estructura ' + estructura.numero : estructura.nombre;
    }
    fOculto?.toggleAttribute('hidden', !oculto);
    if (fDescripcion) {
      const texto = oculto ? '' : estructura.descripcion;
      fDescripcion.textContent = texto;
      // Hay estructuras sin descripcion todavia: ahi la ficha se queda en el
      // nombre en vez de abrir un hueco vacio.
      fDescripcion.toggleAttribute('hidden', texto.trim() === '');
    }
    if (fAnterior) fAnterior.disabled = !vecina(-1);
    if (fSiguiente) fSiguiente.disabled = !vecina(1);

    const capitulo = datos.video?.capitulos.find((c) => c.estructuraId === estructura.id);
    fVideo?.toggleAttribute('hidden', !capitulo);
    if (capitulo && fVideo) {
      fVideo.onclick = () => {
        alternarExplicador(false);
        reproductor?.buscar(capitulo.tiempoSegundos);
      };
    }

    abrirFicha();

    if (cambio === 'activa') {
      visor.irA(estructura.id, st.origen === 'usuario');
      const url =
        window.location.pathname + window.location.search + '#estructura=' + estructura.id;
      history.replaceState(null, '', url);
    }
  });

  // Estado inicial desde la URL: /placa/duodeno#estructura=glandulas-de-brunner
  const inicial = idDesdeHash();
  if (inicial && porId.has(inicial)) {
    visor.viewer.addOnceHandler('open', () => estado.activar(inicial, 'url'));
  }
}
