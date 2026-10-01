// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

/**
 * ===== CONFIGURACION DE GITHUB PAGES =====
 * Cambia estas dos constantes por los datos de tu repositorio.
 *   SITIO: https://<tu-usuario>.github.io
 *   BASE:  /<nombre-del-repositorio>   (deja '/' si el repo se llama <tu-usuario>.github.io)
 * Ver README.md > "Publicar en GitHub Pages".
 */
const SITIO = 'https://juliethacarnu.github.io';
const BASE = '/Atlas-Histologia';

export default defineConfig({
  site: SITIO,
  base: BASE,
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  vite: {
    plugins: [tailwindcss()],
  },
  integrations: [
    /**
     * La herramienta interna de anotacion vive fuera de src/pages/ y solo se
     * inyecta como ruta durante `astro dev`. De este modo NO existe en el
     * build de produccion: no se genera ningun HTML para /admin/anotar.
     */
    {
      name: 'atlas:ruta-anotador-solo-dev',
      hooks: {
        'astro:config:setup': ({ command, injectRoute, logger }) => {
          if (command !== 'dev') return;
          injectRoute({
            pattern: '/admin/anotar',
            entrypoint: './src/paginas-dev/anotar.astro',
          });
          logger.info('Herramienta de anotacion disponible en /admin/anotar');
        },
      },
    },
  ],
});
