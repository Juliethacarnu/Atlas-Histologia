/**
 * Transcripción para las explicaciones en audio.
 *
 * Un elemento <audio> no muestra subtítulos: los navegadores sólo renderizan
 * las pistas de texto sobre video. Así que el mismo archivo .vtt que servería
 * de subtítulo se lee aquí y se pinta como transcripción desplegable, con cada
 * intervención enlazada a su momento del audio.
 */
import type { Reproductor } from './video';
import { ruta } from '../utils/ruta';

interface Intervencion {
  inicio: number;
  texto: string;
}

/** Convierte «00:01:04.500» o «01:04.500» a segundos. */
function aSegundos(marca: string): number {
  const partes = marca.trim().replace(',', '.').split(':').map(Number);
  if (partes.some((n) => Number.isNaN(n))) return 0;
  return partes.reduce((total, n) => total * 60 + n, 0);
}

export function parsearVtt(texto: string): Intervencion[] {
  const intervenciones: Intervencion[] = [];
  const bloques = texto.replace(/\r/g, '').split(/\n{2,}/);

  for (const bloque of bloques) {
    const lineas = bloque.split('\n').filter((l) => l.trim().length > 0);
    const iTiempo = lineas.findIndex((l) => l.includes('-->'));
    if (iTiempo === -1) continue;

    const inicio = aSegundos(lineas[iTiempo]!.split('-->')[0]!);
    const contenido = lineas
      .slice(iTiempo + 1)
      .join(' ')
      // Quita las etiquetas de voz y estilo que admite WebVTT.
      .replace(/<[^>]*>/g, '')
      .trim();

    if (contenido) intervenciones.push({ inicio, texto: contenido });
  }
  return intervenciones;
}

function reloj(s: number): string {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}

/**
 * Descarga el .vtt y lo pinta dentro de #transcripcion. Cada intervención es
 * un botón que lleva el audio a ese punto; la que suena queda resaltada.
 */
export async function montarTranscripcion(
  archivoVtt: string,
  reproductor: Reproductor,
): Promise<void> {
  const caja = document.getElementById('transcripcion');
  const lista = document.getElementById('transcripcion-lista');
  if (!caja || !lista) return;

  let intervenciones: Intervencion[] = [];
  try {
    const respuesta = await fetch(ruta('audios', archivoVtt));
    if (!respuesta.ok) return;
    intervenciones = parsearVtt(await respuesta.text());
  } catch {
    return; // sin transcripción: el audio sigue funcionando
  }
  if (intervenciones.length === 0) return;

  const botones = intervenciones.map((intervencion) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'transcripcion__linea';
    b.setAttribute('aria-current', 'false');

    const marca = document.createElement('span');
    marca.className = 'transcripcion__marca';
    marca.textContent = reloj(intervencion.inicio);

    const cuerpo = document.createElement('span');
    cuerpo.textContent = intervencion.texto;

    b.append(marca, cuerpo);
    b.addEventListener('click', () => reproductor.buscar(intervencion.inicio));
    li.appendChild(b);
    return b;
  });

  lista.replaceChildren(...botones.map((b) => b.parentElement!));
  caja.removeAttribute('hidden');

  let vigente = -1;
  reproductor.onTiempo((segundos) => {
    let indice = -1;
    for (let i = 0; i < intervenciones.length; i++) {
      if (segundos + 0.2 >= intervenciones[i]!.inicio) indice = i;
      else break;
    }
    if (indice === vigente) return;
    botones[vigente]?.setAttribute('aria-current', 'false');
    botones[indice]?.setAttribute('aria-current', 'true');
    vigente = indice;
  });
}
