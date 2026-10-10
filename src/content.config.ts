import { defineCollection, z } from 'astro:content';
import { glob, file } from 'astro/loaders';
import { IDS_SISTEMAS } from './datos/sistemas';

/* ------------------------------------------------------------------
   PRESENTADORES  ·  un unico archivo: src/content/presentadores.json
   ------------------------------------------------------------------ */
const presentadores = defineCollection({
  loader: file('src/content/presentadores.json'),
  schema: z.object({
    id: z.string(),
    nombre: z.string(),
    rol: z.string().default('Presentador'),
    /** Nombre del archivo dentro de public/avatares/ (PNG o SVG cuadrado, fondo transparente). */
    avatarImagen: z.string().nullable().default(null),
    /**
     * Video corto en bucle del presentador (public/avatares/), mudo, que
     * sustituye a la caricatura estatica mientras suena el audio de la placa.
     * Uno por persona: sirve para todas sus placas.
     */
    avatarBucle: z.string().nullable().default(null),
    /** Color de respaldo para el marcador de iniciales. Formato #rrggbb. */
    avatarColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, 'avatarColor debe ser un hexadecimal #rrggbb')
      .default('#2E2566'),
  }),
});

/* ------------------------------------------------------------------
   PLACAS  ·  un archivo JSON por placa en src/content/placas/
   ------------------------------------------------------------------ */

/** Coordenada normalizada: 0 = borde izquierdo/superior, 1 = borde derecho/inferior. */
const coordenada = z.number().min(0).max(1);

const punto = z.object({
  x: coordenada,
  y: coordenada,
  /**
   * Indice (base 0) de la imagen de `imagenes` a la que pertenece el punto.
   * Si se omite, el punto se muestra en todas las imagenes de la placa.
   */
  imagen: z.number().int().min(0).optional(),
});

const estructura = z.object({
  /** Identificador estable en kebab-case: se usa en la URL (#estructura=...). */
  id: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'El id de estructura debe ir en kebab-case, sin acentos'),
  /** Admite sub-numeracion de la diapositiva: 3, 3.1, 3.2... */
  numero: z.number().positive(),
  nombre: z.string().min(1),
  descripcion: z.string().default(''),
  x: coordenada.optional(),
  y: coordenada.optional(),
  /** Puntos adicionales: una misma estructura puede senalarse en varios sitios. */
  puntos: z.array(punto).default([]),
});

const imagenPlaca = z.object({
  /** Nombre base del archivo en public/placas/ (sin sufijo de tamano ni extension). */
  archivo: z.string(),
  aumento: z.string().default(''),
  credito: z.string().default(''),
});

const capitulo = z.object({
  estructuraId: z.string(),
  tiempoSegundos: z.number().min(0),
});

const video = z.object({
  /**
   * youtube: video alojado en YouTube (se sirve por youtube-nocookie).
   * mp4:     video local en public/videos/.
   * audio:   solo voz (m4a/mp3/ogg) en public/audios/; el sitio anima la
   *          caricatura del presentador mientras suena. Pesa mucho menos y
   *          no exige generar ningun video.
   */
  tipo: z.enum(['youtube', 'mp4', 'audio']),
  /** youtube: el ID del video. mp4: archivo en public/videos/. audio: archivo en public/audios/. */
  src: z.string().min(1),
  /**
   * Archivo .vtt en public/videos/. Con mp4 son los subtitulos incrustados;
   * con audio se muestra como transcripcion desplegable y navegable.
   */
  subtitulos: z.string().nullable().default(null),
  capitulos: z.array(capitulo).default([]),
});

const placas = defineCollection({
  loader: glob({
    pattern: '**/*.json',
    base: 'src/content/placas',
    // El id de la coleccion (y de la URL) es el campo `id` del JSON.
    generateId: ({ data, entry }) => (typeof data.id === 'string' ? data.id : entry),
  }),
  schema: z
    .object({
      id: z
        .string()
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'El id de placa debe ir en kebab-case, sin acentos'),
      titulo: z.string().min(1),
      sistema: z.enum(IDS_SISTEMAS),
      /** Casilla «Órgano / Tejido» de la diapositiva: es un unico campo. */
      organo: z.string().default(''),
      tincion: z.string().default('H&E'),
      aumentos: z.array(z.string()).default([]),
      descripcionGeneral: z.string().default(''),
      fuente: z.string().default(''),
      credito: z.string().default(''),
      /** id de un registro de presentadores.json */
      presentador: z.string().nullable().default(null),
      imagenes: z.array(imagenPlaca).default([]),
      video: video.nullable().default(null),
      estructuras: z.array(estructura).default([]),
      /** Marca las placas cuyo texto sigue siendo PLACEHOLDER. */
      borrador: z.boolean().default(false),
    })
    .superRefine((placa, ctx) => {
      const vistos = new Set<string>();
      for (const e of placa.estructuras) {
        if (vistos.has(e.id)) {
          ctx.addIssue({
            code: 'custom',
            message: `Estructura duplicada "${e.id}" en la placa "${placa.id}"`,
            path: ['estructuras'],
          });
        }
        vistos.add(e.id);
        // Las coordenadas son opcionales a proposito: una estructura puede
        // existir en la lista antes de estar senalada sobre la lamina. Sin
        // coordenadas no se pinta marcador, y la herramienta /admin/anotar
        // sirve justo para irselas poniendo.
      }
      for (const c of placa.video?.capitulos ?? []) {
        if (!vistos.has(c.estructuraId)) {
          ctx.addIssue({
            code: 'custom',
            message: `El capitulo apunta a la estructura inexistente "${c.estructuraId}"`,
            path: ['video', 'capitulos'],
          });
        }
      }
    }),
});

export const collections = { placas, presentadores };
