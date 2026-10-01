/**
 * Construye URLs respetando el `base` de GitHub Pages.
 * Usar SIEMPRE esta funcion en href/src en lugar de rutas absolutas.
 */
const BASE = import.meta.env.BASE_URL;

export function ruta(...partes: string[]): string {
  const cola = partes
    .join('/')
    .split('/')
    .filter((p) => p.length > 0)
    .join('/');
  const raiz = BASE.endsWith('/') ? BASE : `${BASE}/`;
  return cola ? `${raiz}${cola}` : raiz;
}

/** URL compartible de una placa, opcionalmente apuntando a una estructura. */
export function rutaPlaca(idPlaca: string, idEstructura?: string): string {
  const base = ruta('placa', idPlaca);
  return idEstructura ? `${base}#estructura=${idEstructura}` : base;
}
