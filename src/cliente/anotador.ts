/**
 * Herramienta de anotación (solo en desarrollo).
 *
 * Coloca marcadores haciendo clic sobre la imagen y exporta el arreglo
 * `estructuras` con coordenadas normalizadas (0 a 1), listo para pegar en el
 * JSON de la placa. El trabajo se guarda en localStorage por placa, de modo
 * que recargar la página no lo pierde.
 */

interface EstructuraEditable {
  id: string;
  numero: number;
  nombre: string;
  descripcion: string;
  x: number;
  y: number;
}

interface PlacaAnotable {
  id: string;
  titulo: string;
  sistema: string;
  imagenes: { url: string; aumento: string }[];
  estructuras: EstructuraEditable[];
}

const nodo = document.getElementById('datos-anotador');
if (nodo?.textContent) iniciar(JSON.parse(nodo.textContent) as PlacaAnotable[]);

function claveAlmacen(idPlaca: string) {
  return `atlas-anotador:${idPlaca}`;
}

/** Convierte un nombre en un id kebab-case sin acentos. */
function aId(nombre: string, respaldo: string): string {
  const base = nombre
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || respaldo;
}

function iniciar(placas: PlacaAnotable[]) {
  const selector = document.getElementById('anotador-placa') as HTMLSelectElement;
  const selectorImagen = document.getElementById('anotador-imagen') as HTMLSelectElement;
  const lienzo = document.getElementById('anotador-lienzo') as HTMLElement;
  const imagen = document.getElementById('anotador-img') as HTMLImageElement;
  const capa = document.getElementById('anotador-capa') as HTMLElement;
  const lista = document.getElementById('anotador-lista') as HTMLElement;
  const salida = document.getElementById('anotador-json') as HTMLTextAreaElement;
  const zoom = document.getElementById('anotador-zoom') as HTMLInputElement;
  const aviso = document.getElementById('anotador-aviso') as HTMLElement;

  let placa: PlacaAnotable = placas[0]!;
  let estructuras: EstructuraEditable[] = [];
  let seleccionada: string | null = null;

  /* ------------------------------ Persistencia ----------------------------- */

  function guardar() {
    try {
      localStorage.setItem(claveAlmacen(placa.id), JSON.stringify(estructuras));
    } catch {
      /* sin almacenamiento: solo se pierde el autoguardado */
    }
    pintarJson();
  }

  function cargar() {
    let guardadas: EstructuraEditable[] | null = null;
    try {
      const bruto = localStorage.getItem(claveAlmacen(placa.id));
      if (bruto) guardadas = JSON.parse(bruto) as EstructuraEditable[];
    } catch {
      guardadas = null;
    }
    estructuras = guardadas ?? placa.estructuras.map((e) => ({ ...e }));
    aviso.textContent = guardadas
      ? 'Recuperado el borrador guardado en este navegador.'
      : 'Cargadas las estructuras del archivo JSON.';
    seleccionada = null;
  }

  /* -------------------------------- Pintado -------------------------------- */

  function pintarMarcadores() {
    capa.replaceChildren(
      ...estructuras.map((e) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'anotador-marcador';
        if (e.id === seleccionada) b.classList.add('anotador-marcador--activo');
        b.style.left = `${e.x * 100}%`;
        b.style.top = `${e.y * 100}%`;
        b.textContent = String(e.numero);
        b.title = `${e.nombre} — arrastra para mover`;
        b.setAttribute('aria-label', `Marcador ${e.numero}: ${e.nombre}`);
        b.addEventListener('pointerdown', (ev) => empezarArrastre(ev, e, b));
        b.addEventListener('click', (ev) => {
          ev.stopPropagation();
          seleccionada = e.id;
          pintar();
          document.getElementById(`campo-nombre-${e.id}`)?.focus();
        });
        return b;
      }),
    );
  }

  function pintarLista() {
    lista.replaceChildren(
      ...estructuras.map((e) => {
        const fila = document.createElement('li');
        fila.className = 'anotador-fila';
        if (e.id === seleccionada) fila.dataset.activa = 'si';

        fila.innerHTML = `
          <div class="anotador-fila__cabecera">
            <input type="number" min="1" value="${e.numero}" aria-label="Número"
              class="anotador-num" data-campo="numero" />
            <input type="text" value="${escaparAtributo(e.nombre)}" placeholder="Nombre de la estructura"
              id="campo-nombre-${e.id}" aria-label="Nombre" class="anotador-texto" data-campo="nombre" />
            <button type="button" class="anotador-borrar" aria-label="Borrar marcador ${e.numero}">✕</button>
          </div>
          <textarea rows="2" placeholder="Descripción" aria-label="Descripción"
            class="anotador-texto" data-campo="descripcion">${escaparTexto(e.descripcion)}</textarea>
          <p class="anotador-coords">
            <code>${e.id}</code>
            <span>x ${e.x.toFixed(4)} · y ${e.y.toFixed(4)}</span>
          </p>`;

        for (const campo of fila.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
          '[data-campo]',
        )) {
          campo.addEventListener('input', () => {
            const clave = campo.dataset.campo as 'numero' | 'nombre' | 'descripcion';
            if (clave === 'numero') e.numero = Number(campo.value) || e.numero;
            else if (clave === 'nombre') {
              e.nombre = campo.value;
              // El id sigue al nombre mientras no se haya usado en un video.
              e.id = aId(campo.value, e.id);
              // Se refresca sólo la etiqueta del id: volver a pintar la fila
              // entera haría perder el foco mientras se escribe.
              const etiqueta = fila.querySelector('.anotador-coords code');
              if (etiqueta) etiqueta.textContent = e.id;
            } else e.descripcion = campo.value;
            guardar();
            pintarMarcadores();
          });
        }

        fila.querySelector('.anotador-borrar')?.addEventListener('click', () => {
          estructuras = estructuras.filter((o) => o !== e);
          if (seleccionada === e.id) seleccionada = null;
          guardar();
          pintar();
        });

        fila.addEventListener('click', () => {
          seleccionada = e.id;
          pintarMarcadores();
          for (const otra of lista.children) (otra as HTMLElement).removeAttribute('data-activa');
          fila.dataset.activa = 'si';
        });

        return fila;
      }),
    );
  }

  function pintarJson() {
    const ordenadas = [...estructuras].sort((a, b) => a.numero - b.numero);
    salida.value = JSON.stringify(
      ordenadas.map((e) => ({
        id: e.id,
        numero: e.numero,
        nombre: e.nombre,
        descripcion: e.descripcion,
        x: Number(e.x.toFixed(4)),
        y: Number(e.y.toFixed(4)),
      })),
      null,
      2,
    );
  }

  function pintar() {
    pintarMarcadores();
    pintarLista();
    pintarJson();
  }

  /* ------------------------------- Arrastre -------------------------------- */

  function empezarArrastre(ev: PointerEvent, e: EstructuraEditable, boton: HTMLElement) {
    ev.preventDefault();
    boton.setPointerCapture(ev.pointerId);
    let movido = false;

    const mover = (m: PointerEvent) => {
      movido = true;
      const caja = imagen.getBoundingClientRect();
      e.x = Math.min(1, Math.max(0, (m.clientX - caja.left) / caja.width));
      e.y = Math.min(1, Math.max(0, (m.clientY - caja.top) / caja.height));
      boton.style.left = `${e.x * 100}%`;
      boton.style.top = `${e.y * 100}%`;
    };

    const soltar = () => {
      boton.removeEventListener('pointermove', mover);
      boton.removeEventListener('pointerup', soltar);
      if (movido) {
        guardar();
        pintarLista();
      }
    };

    boton.addEventListener('pointermove', mover);
    boton.addEventListener('pointerup', soltar);
  }

  /* ------------------------------ Interacción ------------------------------ */

  imagen.addEventListener('click', (ev) => {
    const caja = imagen.getBoundingClientRect();
    const x = (ev.clientX - caja.left) / caja.width;
    const y = (ev.clientY - caja.top) / caja.height;
    const numero = estructuras.reduce((n, e) => Math.max(n, e.numero), 0) + 1;
    const nueva: EstructuraEditable = {
      id: `estructura-${numero}`,
      numero,
      nombre: '',
      descripcion: '',
      x: Number(x.toFixed(4)),
      y: Number(y.toFixed(4)),
    };
    estructuras.push(nueva);
    seleccionada = nueva.id;
    guardar();
    pintar();
    document.getElementById(`campo-nombre-${nueva.id}`)?.focus();
  });

  selector.addEventListener('change', () => {
    placa = placas.find((p) => p.id === selector.value) ?? placas[0]!;
    prepararImagenes();
    cargar();
    pintar();
  });

  selectorImagen.addEventListener('change', () => {
    const im = placa.imagenes[Number(selectorImagen.value)];
    if (im) imagen.src = im.url;
  });

  zoom.addEventListener('input', () => {
    lienzo.style.width = `${zoom.value}%`;
  });

  document.getElementById('anotador-copiar')?.addEventListener('click', async () => {
    const boton = document.getElementById('anotador-copiar')!;
    try {
      await navigator.clipboard.writeText(salida.value);
      boton.textContent = 'JSON copiado';
      window.setTimeout(() => (boton.textContent = 'Copiar JSON'), 1600);
    } catch {
      salida.select();
    }
  });

  document.getElementById('anotador-limpiar')?.addEventListener('click', () => {
    if (!window.confirm('¿Borrar todos los marcadores de esta placa?')) return;
    estructuras = [];
    seleccionada = null;
    guardar();
    pintar();
  });

  document.getElementById('anotador-recargar')?.addEventListener('click', () => {
    if (!window.confirm('¿Descartar el borrador y volver a lo que dice el archivo JSON?')) return;
    try {
      localStorage.removeItem(claveAlmacen(placa.id));
    } catch {
      /* sin almacenamiento */
    }
    cargar();
    pintar();
  });

  function prepararImagenes() {
    selectorImagen.replaceChildren(
      ...placa.imagenes.map((im, i) => {
        const op = document.createElement('option');
        op.value = String(i);
        op.textContent = im.aumento || `Imagen ${i + 1}`;
        return op;
      }),
    );
    const primera = placa.imagenes[0];
    if (primera) imagen.src = primera.url;
  }

  /* --------------------------------- Arranque ------------------------------- */
  prepararImagenes();
  cargar();
  pintar();
}

function escaparAtributo(t: string) {
  return t.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function escaparTexto(t: string) {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
}
