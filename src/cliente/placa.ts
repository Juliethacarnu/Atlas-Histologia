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

const datos = leerDatosPlaca();
if (datos) iniciar(datos);

function iniciar(datos: DatosPlaca) {
  const marco = document.getElementById('marco-visor');
  const contenedor = document.getElementById('visor');
  if (!marco || !contenedor) return;

  const porId = new Map(datos.estructuras.map((e) => [e.id, e]));
  const ordenadas = [...datos.estructuras].sort((a, b) => a.numero - b.numero);
  const visor = new Visor(contenedor, datos);

  /* ---------------------- Estado de carga del visor ---------------------- */
  const aviso = document.getElementById('estado-visor');
  visor.viewer.addHandler('open', () => aviso?.setAttribute('hidden', ''));
  visor.viewer.addHandler('open-failed', () => {
    if (!aviso) return;
    aviso.removeAttribute('hidden');
    aviso.textContent =
      'No se encontró la imagen de esta placa. Ejecuta «npm run optimizar» para generarla.';
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
    });
  }

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
    ficha.dataset.abierta = 'si';
    ficha.removeAttribute('inert');
  }
  function cerrarFicha() {
    if (!ficha) return;
    ficha.dataset.abierta = 'no';
    ficha.setAttribute('inert', '');
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
  // En móvil el explicador empieza recogido como burbuja para no tapar el visor.
  if (window.matchMedia('(max-width: 1023px)').matches) alternarExplicador(true);

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
    const avatares = Array.from(document.querySelectorAll<HTMLElement>('.avatar--animable'));

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
        estado.activar(null);
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
    if (fDescripcion) fDescripcion.textContent = oculto ? '' : estructura.descripcion;
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
