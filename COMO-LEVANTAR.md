# Cómo levantar el Atlas en tu máquina, paso a paso

Guía corta para arrancar el proyecto desde cero. Para el detalle de cómo agregar
placas, avatares, audios o publicar en GitHub Pages, ver `README.md`.

Verificado el 14 de noviembre de 2026 con Node 22.23.2 y npm 10.9.8 en Linux.

---

## Qué es este proyecto

Sitio **estático** hecho con [Astro 7](https://astro.build) + TypeScript + Tailwind CSS v4.
El visor de zoom es [OpenSeadragon](https://openseadragon.github.io). No hay backend,
base de datos ni variables de entorno: todo el contenido vive en archivos del repositorio.

| Qué                                | Dónde                                                        |
| ---------------------------------- | ------------------------------------------------------------ |
| Una placa (texto, marcas, audio)   | `src/content/placas/<id>.json` (90 archivos, uno por placa)  |
| Esquema que valida esos JSON       | `src/content.config.ts`                                      |
| Los 9 sistemas y su orden          | `src/datos/sistemas.ts`                                      |
| Presentadores y sus caricaturas    | `src/content/presentadores.json` y `public/avatares/`        |
| Imágenes ya convertidas a WebP     | `public/placas/` (3 tamaños por imagen, ya versionadas)      |
| Audios de las explicaciones        | `public/audios/` (60 archivos m4a)                           |
| Fotos originales y PDF fuente      | `originales/` (124 MB, solo para regenerar los WebP)         |
| Páginas del sitio                  | `src/pages/` (inicio, placa/[id], autores, créditos, 404)    |
| Herramienta de anotación (solo dev)| `src/paginas-dev/anotar.astro`                               |
| Lógica del navegador               | `src/cliente/*.ts` (visor, marcas, lupa, video, quiz…)       |
| Scripts auxiliares                 | `scripts/` (optimizar imágenes, importar placas)             |
| Publicación automática             | `.github/workflows/deploy.yml` (GitHub Pages en cada push)   |

---

## Paso 0 · Requisitos

- **Node.js 20 o superior** (el workflow de CI usa 22). Comprueba con `node -v`.
- npm (viene con Node).
- Nada más: no hace falta Docker, Python ni ningún servicio externo.

## Paso 1 · Clonar y entrar

```bash
git clone https://github.com/juliethacarnu/Atlas-Histologia.git
cd Atlas-Histologia
```

Si ya tienes la carpeta, solo entra en ella.

## Paso 2 · Instalar dependencias

```bash
npm install
```

Tarda alrededor de un minuto la primera vez (unos 430 paquetes). Es normal que npm
avise de vulnerabilidades en dependencias de desarrollo; no afectan al sitio publicado.

> Si `npm install` modifica `package-lock.json` solo añadiendo líneas `"dev": true`,
> es cosmético. Puedes descartarlo con `git checkout -- package-lock.json`.

## Paso 3 · Arrancar el servidor de desarrollo

```bash
npm run dev
```

Abre en el navegador:

**http://localhost:4321/Atlas-Histologia/**

Ojo con tres cosas:

1. **La raíz `http://localhost:4321/` devuelve 404.** El sitio cuelga de
   `/Atlas-Histologia` porque así se llama el repositorio en GitHub Pages
   (constante `BASE` en `astro.config.mjs`).
2. **Mayúsculas y minúsculas importan.** Si escribes `/atlas-histologia/` en
   minúsculas, el servidor de desarrollo te redirige solo a la dirección buena.
3. **No necesitas correr `npm run optimizar` para arrancar.** Las imágenes WebP de
   `public/placas/` ya están en el repositorio. Ese comando solo hace falta si
   añades o cambias una foto en `originales/`.

### El servidor queda en segundo plano

Astro 7 arranca el servidor de desarrollo como proceso en segundo plano. Comandos útiles:

```bash
npx astro dev status   # ¿está corriendo? en qué puerto y pid
npx astro dev logs     # ver los logs
npx astro dev stop     # detenerlo
```

### Direcciones que puedes probar

| URL                                                            | Qué es                                        |
| -------------------------------------------------------------- | --------------------------------------------- |
| http://localhost:4321/Atlas-Histologia/                        | Inicio: bandeja de placas por sistema         |
| http://localhost:4321/Atlas-Histologia/placa/duodeno           | Una placa con visor, marcas y audio           |
| http://localhost:4321/Atlas-Histologia/autores                 | Página de autores                             |
| http://localhost:4321/Atlas-Histologia/creditos                | Créditos y fuentes                            |
| http://localhost:4321/Atlas-Histologia/admin/anotar            | Herramienta para colocar marcas (**solo dev**) |

La herramienta de anotación no existe en el build de producción: se inyecta como ruta
únicamente cuando el comando es `astro dev`.

## Paso 4 · Comprobar que todo cuadra (opcional pero recomendado)

```bash
npm run check
```

Valida tipos y los esquemas de contenido. Debe terminar con `0 errors`. Si un JSON de
placa está mal (id duplicado, capítulo que apunta a una estructura inexistente, sistema
que no existe…), aquí lo dice con el archivo y el campo exacto.

Los avisos `'z' is deprecated` son hints de Astro 7, no errores.

## Paso 5 · Compilar y ver el sitio como quedará publicado

```bash
npm run build      # genera dist/ (94 páginas, ~53 MB con audios e imágenes)
npm run preview    # sirve dist/ en http://localhost:4321/Atlas-Histologia/
```

`preview` usa el mismo puerto 4321 que `dev`; si el dev sigue corriendo, páralo antes con
`npx astro dev stop` o pasa otro puerto: `npx astro preview --port 4322`.

En el build **no** aparece `/admin/anotar` (responde 404), que es lo esperado.

---

## Todos los comandos

| Comando                            | Qué hace                                                            |
| ---------------------------------- | ------------------------------------------------------------------- |
| `npm run dev`                      | Servidor de desarrollo con recarga en caliente. Incluye `/admin/anotar`. |
| `npm run build`                    | Compila el sitio estático en `dist/`.                               |
| `npm run preview`                  | Sirve `dist/` tal como lo verá GitHub Pages.                        |
| `npm run check`                    | Comprueba tipos y valida los JSON de las placas.                    |
| `npm run optimizar`                | Convierte `originales/` a WebP en `public/placas/` y recorta avatares. Salta lo que no cambió. |
| `npm run importar -- archivo.json` | Parte un JSON con varias placas en un archivo por placa.            |
| `npm run formato`                  | Formatea todo con Prettier.                                         |

En VS Code están también como tareas (**Terminal → Ejecutar tarea…**). Las extensiones
recomendadas (Astro, Tailwind, ESLint, Prettier) están en `.vscode/extensions.json`.

---

## Flujo de trabajo habitual

1. `npm run dev` y abre http://localhost:4321/Atlas-Histologia/.
2. Edita un JSON en `src/content/placas/`: la página se recarga sola.
3. Para colocar o mover marcas, usa http://localhost:4321/Atlas-Histologia/admin/anotar,
   pulsa **Copiar JSON** y pégalo en el campo `estructuras` de la placa.
4. Si añadiste una foto nueva en `originales/`, corre `npm run optimizar`.
5. `npm run check` antes de hacer commit.
6. Al hacer `git push` a `main`, GitHub Actions compila y publica en
   https://juliethacarnu.github.io/Atlas-Histologia/ (ver pestaña Actions).

---

## Estado actual del contenido (14 nov 2026)

- 90 placas en 9 sistemas: digestivo 15, ojo 15, reproductor femenino 19, respiratorio 9,
  endocrino 8, piel 6, urinario 6, reproductor masculino 6, sangre y linfoide 6.
- 60 placas tienen audio; 30 todavía no.
- 3 placas marcadas como `borrador: true`.
- 389 de 475 estructuras tienen marca sobre la lámina; las 86 pendientes están
  listadas en `PENDIENTE.md`.
- Todas las imágenes y audios que los JSON referencian existen en `public/`.

> Nota: `README.md` habla de "46 placas" y de la URL en minúsculas
> `/atlas-histologia/`; ambos datos quedaron viejos. El proyecto hoy tiene 90 placas y
> la base es `/Atlas-Histologia` (con mayúsculas).

---

## Si algo falla

| Síntoma                                        | Causa y arreglo                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------- |
| `http://localhost:4321/` da 404                | Normal. Entra por `/Atlas-Histologia/`.                                         |
| `npm run dev` dice que el puerto está ocupado  | Ya hay un dev corriendo en segundo plano: `npx astro dev status` / `stop`.      |
| **La lámina se queda "cargando" y nunca aparece** | La caché de dependencias de Vite quedó vieja (OpenSeadragon responde 504 en la consola de red). Arreglo: `npx astro dev stop && rm -rf node_modules/.vite .astro && npm run dev`, y recarga con Ctrl+Shift+R. |
| El build falla nombrando un JSON               | Error de esquema en esa placa. El mensaje dice archivo y campo. Ver `README.md` § 2. |
| Una placa sale con imagen gris "placeholder"   | No existe `public/placas/<archivo>--grande.webp`. Pon la foto en `originales/` y corre `npm run optimizar`. |
| `sharp` falla al instalar                      | Necesita Node 20+. Borra `node_modules/` y vuelve a `npm install`.              |
| Los cambios en un JSON no se ven               | Guarda el archivo; si sigue igual, `npx astro dev stop` y `npm run dev` otra vez. |
