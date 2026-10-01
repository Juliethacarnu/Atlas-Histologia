/**
 * Estado compartido de la página de placa. Todo lo que se sincroniza entre el
 * visor, la lista lateral, la ficha, el video y el modo repaso pasa por aquí.
 */
/** De dónde vino la última activación: decide si se mueve el foco del teclado. */
export type Origen = 'usuario' | 'video' | 'url' | 'quiz';

export interface EstadoPlaca {
  /** id de la estructura activa, o null si no hay ninguna. */
  activa: string | null;
  /** Índice de la imagen/aumento visible. */
  imagen: number;
  /** Modo repaso: los nombres quedan ocultos hasta que se revelan. */
  repaso: boolean;
  /** Estructuras reveladas manualmente durante el repaso. */
  reveladas: Set<string>;
  /** Origen de la última activación. */
  origen: Origen;
}

type Oyente = (estado: EstadoPlaca, cambio: keyof EstadoPlaca | 'revelada') => void;

const estado: EstadoPlaca = {
  activa: null,
  imagen: 0,
  repaso: false,
  reveladas: new Set(),
  origen: 'usuario',
};

const oyentes = new Set<Oyente>();

function avisar(cambio: keyof EstadoPlaca | 'revelada') {
  for (const o of oyentes) o(estado, cambio);
}

export function suscribir(oyente: Oyente): () => void {
  oyentes.add(oyente);
  return () => oyentes.delete(oyente);
}

export function obtener(): Readonly<EstadoPlaca> {
  return estado;
}

export function activar(id: string | null, origen: Origen = 'usuario') {
  if (estado.activa === id) return;
  estado.activa = id;
  estado.origen = origen;
  avisar('activa');
}

export function cambiarImagen(indice: number) {
  if (estado.imagen === indice) return;
  estado.imagen = indice;
  avisar('imagen');
}

export function alternarRepaso(valor?: boolean) {
  const siguiente = valor ?? !estado.repaso;
  if (estado.repaso === siguiente) return;
  estado.repaso = siguiente;
  if (!siguiente) estado.reveladas.clear();
  avisar('repaso');
}

export function revelar(id: string) {
  if (estado.reveladas.has(id)) return;
  estado.reveladas.add(id);
  avisar('revelada');
}
