/**
 * Los seis sistemas del atlas, en el orden en que se muestran.
 * `placasEsperadas` documenta el total del proyecto y lo usa la pagina de
 * creditos para avisar si falta o sobra alguna placa.
 */
export const SISTEMAS = [
  {
    id: 'sangre-linfoide',
    nombre: 'Sangre y linfoide',
    descripcion: 'Elementos formes de la sangre y organos del sistema inmunitario.',
    placasEsperadas: 6,
    acento: 'var(--color-sis-sangre)',
  },
  {
    id: 'piel-anexos',
    nombre: 'Piel y anexos',
    descripcion: 'Epidermis, dermis y estructuras anexas de la piel.',
    placasEsperadas: 6,
    acento: 'var(--color-sis-piel)',
  },
  {
    id: 'respiratorio',
    nombre: 'Sistema respiratorio',
    descripcion: 'Vias aereas de conduccion y porcion respiratoria del pulmon.',
    placasEsperadas: 9,
    acento: 'var(--color-sis-respiratorio)',
  },
  {
    id: 'digestivo',
    nombre: 'Sistema digestivo',
    descripcion: 'Tubo digestivo y glandulas anexas.',
    placasEsperadas: 15,
    acento: 'var(--color-sis-digestivo)',
  },
  {
    id: 'urinario',
    nombre: 'Sistema urinario',
    descripcion: 'Rinon y vias urinarias.',
    placasEsperadas: 6,
    acento: 'var(--color-sis-urinario)',
  },
  {
    id: 'endocrino',
    nombre: 'Sistema endocrino',
    descripcion: 'Glandulas de secrecion interna.',
    placasEsperadas: 4,
    acento: 'var(--color-sis-endocrino)',
  },
] as const;

export type SistemaId = (typeof SISTEMAS)[number]['id'];

export const IDS_SISTEMAS = SISTEMAS.map((s) => s.id) as [SistemaId, ...SistemaId[]];

export const TOTAL_PLACAS_ESPERADAS = SISTEMAS.reduce((n, s) => n + s.placasEsperadas, 0);

export function sistema(id: string) {
  return SISTEMAS.find((s) => s.id === id);
}

export function nombreSistema(id: string): string {
  return sistema(id)?.nombre ?? id;
}

export function acentoSistema(id: string): string {
  return sistema(id)?.acento ?? 'var(--color-hematoxilina)';
}
