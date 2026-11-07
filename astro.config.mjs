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

/**
 * El sitio cuelga de /Atlas-Histologia porque asi se llama el repositorio, y
 * tanto GitHub Pages como el servidor de desarrollo distinguen mayusculas. Al
 * escribir la direccion a mano es facil teclearla en minusculas y encontrarse
 * un 404. Este plugin solo existe en `astro dev`: manda a la direccion buena.
 *
 * No se toca la raiz: Vite ya le ha quitado la base a la URL cuando llega
 * aqui, asi que '/' y '/Atlas-Histologia/' son indistinguibles y redirigir
 * una acabaria redirigiendo la otra contra si misma.
 *
 * Lo dificil fue colocarlo. Astro trae su propio filtro de base que contesta
 * 404 a todo lo que caiga fuera de /Atlas-Histologia y pida `Accept:
 * text/html`, y lo pone al principio de la pila. Eso daba un sintoma
 * desconcertante -curl recibia el redirector y el navegador un 404, porque lo
 * unico que los separaba era esa cabecera- y explica por que no bastan ni
 * `servidor.middlewares.use()`, que encola al final, ni `enforce: 'pre'`, ni
 * meterlo a mano al principio: Astro lo monta en el gancho posterior y se
 * pone delante de todos.
 *
 * La solucion es jugar su misma carta un turno mas tarde: `configureServer`
 * devuelve una funcion, y esas corren despues de las de Astro. Lo que se mete
 * entonces al principio de la pila queda, ahora si, el primero de todos.
 */
function atajoDeDesarrollo() {
  /**
   * @param {import('node:http').IncomingMessage} peticion
   * @param {import('node:http').ServerResponse} respuesta
   * @param {() => void} siguiente
   */
  function redirigirSiEstaMalEscrita(peticion, respuesta, siguiente) {
    const ruta = (peticion.url ?? '/').split('?')[0];
    const enMinusculas = ruta.toLowerCase();
    const baseEnMinusculas = BASE.toLowerCase();

    const esLaBaseMalEscrita =
      ruta !== BASE &&
      !ruta.startsWith(BASE + '/') &&
      (enMinusculas === baseEnMinusculas || enMinusculas.startsWith(baseEnMinusculas + '/'));

    if (esLaBaseMalEscrita) {
      respuesta.writeHead(302, { Location: BASE + ruta.slice(BASE.length) });
      return respuesta.end();
    }

    siguiente();
  }

  return {
    name: 'atlas:atajo-de-desarrollo',
    apply: 'serve',
    /** @param {import('vite').ViteDevServer} servidor */
    configureServer(servidor) {
      return () => {
        servidor.middlewares.stack.unshift({
          route: '',
          handle: redirigirSiEstaMalEscrita,
        });
      };
    },
  };
}

export default defineConfig({
  site: SITIO,
  base: BASE,
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  vite: {
    plugins: [tailwindcss(), atajoDeDesarrollo()],
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
