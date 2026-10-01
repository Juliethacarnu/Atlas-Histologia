/** Datos que la página de placa serializa para el cliente. */

export interface PuntoNormalizado {
  x: number;
  y: number;
  /** Índice de la imagen a la que pertenece; si falta, vale para todas. */
  imagen?: number;
}

export interface EstructuraCliente {
  id: string;
  numero: number;
  nombre: string;
  descripcion: string;
  puntos: PuntoNormalizado[];
}

export interface ImagenCliente {
  url: string;
  aumento: string;
  credito: string;
}

export interface CapituloCliente {
  estructuraId: string;
  tiempoSegundos: number;
}

export interface VideoCliente {
  tipo: 'youtube' | 'mp4' | 'audio';
  src: string;
  subtitulos: string | null;
  capitulos: CapituloCliente[];
}

export interface DatosPlaca {
  id: string;
  titulo: string;
  imagenes: ImagenCliente[];
  estructuras: EstructuraCliente[];
  video: VideoCliente | null;
}

export function leerDatosPlaca(): DatosPlaca | null {
  const nodo = document.getElementById('datos-placa');
  if (!nodo?.textContent) return null;
  try {
    return JSON.parse(nodo.textContent) as DatosPlaca;
  } catch {
    console.error('No se pudieron leer los datos de la placa.');
    return null;
  }
}

export const movimientoReducido = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
