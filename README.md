# Atlas virtual de histología

Sitio estático con 46 preparaciones teñidas con hematoxilina y eosina (H&E), agrupadas por
sistema. Cada placa se abre en un visor con zoom profundo, sus estructuras están señaladas con
marcadores numerados y un compañero la explica en un video corto con su caricatura.

Hecho con [Astro](https://astro.build) (salida estática), TypeScript, Tailwind CSS v4 y
[OpenSeadragon](https://openseadragon.github.io). Sin CDN: las tipografías van autoalojadas con
`@fontsource`.

---

## 1. Instalación

Necesitas Node.js 20 o superior.

```bash
npm install          # instala las dependencias
npm run optimizar    # genera las imágenes de public/placas/
npm run dev          # abre http://localhost:4321
```

La primera vez que ejecutes `npm run optimizar` sin nada en `./originales/`, el script crea
**placeholders** con aspecto de tinción H&E para las 46 placas, de modo que el sitio se pueda
probar antes de tener las láminas reales.

### Comandos

| Comando                            | Qué hace                                                        |
| ---------------------------------- | --------------------------------------------------------------- |
| `npm run dev`                      | Servidor de desarrollo. Incluye la herramienta `/admin/anotar`. |
| `npm run build`                    | Compila el sitio en `dist/`. **No** incluye `/admin/anotar`.    |
| `npm run preview`                  | Sirve `dist/` tal como lo verá GitHub Pages.                    |
| `npm run optimizar`                | Convierte `./originales/` a WebP en `public/placas/`.           |
| `npm run importar -- archivo.json` | Parte un JSON con varias placas en un archivo por placa.        |
| `npm run check`                    | Comprueba tipos y valida los esquemas de contenido.             |
| `npm run formato`                  | Formatea con Prettier.                                          |

En VS Code también están como tareas: **Terminal → Ejecutar tarea…** → `dev`, `build`,
`optimizar imágenes`, `previsualizar build`, `comprobar tipos`.

---

## 2. Cómo agregar una placa, paso a paso

Agregar una placa = **un archivo JSON + una imagen**. No hay que tocar ningún índice.

### Paso 1 · Exporta la imagen

Exporta la lámina desde Canva en PNG o JPG, lo más grande que puedas (idealmente 3000–4000 px de
ancho) y guárdala en `./originales/` con el nombre que vaya a tener el identificador de la placa:

```
originales/duodeno.png
```

### Paso 2 · Conviértela

```bash
npm run optimizar
```

Esto crea tres WebP en `public/placas/`:

| Archivo                   | Ancho máximo | Para qué                        |
| ------------------------- | ------------ | ------------------------------- |
| `duodeno--grande.webp`    | 4000 px      | el visor con zoom               |
| `duodeno--media.webp`     | 1600 px      | vista previa y redes sociales   |
| `duodeno--miniatura.webp` | 480 px       | la bandeja de placas del inicio |

El script salta las imágenes que ya estén convertidas y sin cambios.

> Si una placa tiene **varios aumentos**, exporta una imagen por aumento y nómbralas
> `duodeno-x4.png`, `duodeno-x20.png`. Luego decláralas en el campo `imagenes` (paso 3).

### Paso 3 · Crea el JSON de la placa

Crea `src/content/placas/duodeno.json`. El nombre del archivo es indiferente: lo que manda es el
campo `id`, que además es la URL (`/placa/duodeno`).

```json
{
  "id": "duodeno",
  "titulo": "Duodeno",
  "sistema": "digestivo",
  "organo": "Duodeno",
  "tejido": "Mucosa y submucosa",
  "tincion": "H&E",
  "aumentos": ["x4", "x20"],
  "descripcionGeneral": "Corte transversal de la pared duodenal...",
  "fuente": "Preparación del laboratorio de la asignatura",
  "credito": "Fotografía propia",
  "presentador": "p1",
  "imagenes": [
    { "archivo": "duodeno-x4", "aumento": "x4", "credito": "Fotografía propia" },
    { "archivo": "duodeno-x20", "aumento": "x20", "credito": "Fotografía propia" }
  ],
  "video": {
    "tipo": "youtube",
    "src": "dQw4w9WgXcQ",
    "subtitulos": null,
    "capitulos": [{ "estructuraId": "glandulas-de-brunner", "tiempoSegundos": 32 }]
  },
  "estructuras": [
    {
      "id": "glandulas-de-brunner",
      "numero": 1,
      "nombre": "Glándulas de Brunner",
      "descripcion": "Glándulas tubuloalveolares de la submucosa...",
      "x": 0.4312,
      "y": 0.5188
    }
  ],
  "borrador": false
}
```

#### Referencia de los campos

| Campo                | Tipo             | Notas                                                                                                    |
| -------------------- | ---------------- | -------------------------------------------------------------------------------------------------------- |
| `id`                 | texto kebab-case | Es la URL. Sin acentos ni mayúsculas.                                                                    |
| `titulo`             | texto            | Lo que se ve en la etiqueta del portaobjetos.                                                            |
| `sistema`            | enumerado        | `sangre-linfoide`, `piel-anexos`, `respiratorio`, `digestivo`, `urinario`, `endocrino`.                  |
| `organo`, `tejido`   | texto            | Etiquetas secundarias, se usan en la búsqueda.                                                           |
| `tincion`            | texto            | Por defecto `"H&E"`.                                                                                     |
| `aumentos`           | lista de textos  | Por ejemplo `["x4","x20"]`.                                                                              |
| `descripcionGeneral` | texto            | Párrafo que abre el panel lateral.                                                                       |
| `fuente`, `credito`  | texto            | Aparecen en «Créditos y fuentes».                                                                        |
| `presentador`        | id o `null`      | Un id de `src/content/presentadores.json`.                                                               |
| `imagenes`           | lista            | `{ archivo, aumento, credito }`. Si la dejas vacía, se asume un archivo con el mismo nombre que el `id`. |
| `video`              | objeto o `null`  | `tipo`: `youtube`, `mp4` o `audio`. Ver abajo.                                                           |
| `estructuras`        | lista            | Ver abajo.                                                                                               |
| `borrador`           | booleano         | `true` marca la placa como PLACEHOLDER en la bandeja.                                                    |

**Estructuras.** Cada una necesita `id` (kebab-case, se usa en la URL compartible), `numero`,
`nombre`, `descripcion` y coordenadas **normalizadas** de 0 a 1:

```json
{
  "id": "vellosidad",
  "numero": 2,
  "nombre": "Vellosidad intestinal",
  "descripcion": "…",
  "x": 0.22,
  "y": 0.31
}
```

Si una estructura se señala en **varios puntos**, añade `puntos`:

```json
{
  "id": "capilar",
  "numero": 3,
  "nombre": "Capilar",
  "descripcion": "…",
  "x": 0.31,
  "y": 0.44,
  "puntos": [
    { "x": 0.55, "y": 0.61 },
    { "x": 0.7, "y": 0.29, "imagen": 1 }
  ]
}
```

`imagen` es opcional y vale el índice (empezando en 0) de la imagen de `imagenes` a la que
pertenece ese punto. Sin `imagen`, el punto se muestra en todas.

Como las coordenadas son normalizadas, **no dependen de la resolución**: si mañana vuelves a
exportar la lámina más grande, los marcadores siguen en su sitio.

### Paso 4 · Comprueba

```bash
npm run dev
```

Si algo del JSON no cuadra con el esquema, Astro lo dice con el archivo y el campo exacto. El
esquema también avisa de estructuras duplicadas, de estructuras sin coordenadas y de capítulos de
video que apuntan a una estructura que no existe.

### Si tienes las 46 placas en un solo JSON

```bash
npm run importar -- mis-placas.json
```

Acepta un arreglo de placas o `{ "placas": [ … ] }`. Escribe un archivo por placa y **conserva**
los campos `imagenes` y `video` que ya hubiera en los archivos existentes, así que puedes
reimportar los textos sin perder lo que ya habías enlazado.

---

## 3. Cómo usar la herramienta de anotación

Para no calcular coordenadas a mano en 46 placas.

1. `npm run dev`
2. Abre **http://localhost:4321/atlas-histologia/admin/anotar**
3. Elige la placa y, si tiene varias, la imagen.
4. **Haz clic sobre la imagen** para colocar un marcador. Escribe su nombre y su descripción; el
   `id` se genera solo a partir del nombre.
5. **Arrastra** un marcador para corregir su posición. Usa el control de zoom del lienzo para
   afinar en estructuras pequeñas.
6. Pulsa **Copiar JSON** y pega el resultado en el campo `estructuras` del archivo de la placa.

El borrador se guarda en el navegador (`localStorage`) por placa, así que puedes recargar sin
perder el trabajo. **Volver al archivo** descarta el borrador y recupera lo que dice el JSON.

Esta página **no existe en producción**: `astro.config.mjs` la inyecta como ruta sólo cuando el
comando es `astro dev`, y el archivo vive en `src/paginas-dev/`, fuera de `src/pages/`.

---

## 4. Cómo preparar las caricaturas de los avatares

Cada presentador es una **ilustración estilo caricatura** de un compañero, no un video de un
rostro real.

**Formato recomendado**

- **Forma:** cuadrada (1:1).
- **Tamaño:** 512 × 512 px como mínimo; 1024 × 1024 px va sobrado. Si es SVG, el tamaño es
  indiferente.
- **Archivo:** PNG con **fondo transparente**, o SVG.
- **Encuadre:** busto, con la cabeza centrada horizontalmente y apoyada en el borde inferior. El
  componente alinea la imagen abajo (`object-position: 50% 100%`), así que la caricatura se
  «asoma» desde el borde de la tarjeta.
- **Peso:** por debajo de 150 KB por avatar.

**Dónde ponerlas:** `public/avatares/`, por ejemplo `public/avatares/ana.png`.

**Cómo declararlas:** en `src/content/presentadores.json`. Ese archivo sólo debe
contener compañeros con nombre real: lo que haya ahí se publica tal cual en la
página de Autores. Para añadir uno nuevo, otro objeto en la lista:

```json
[
  {
    "id": "p1",
    "nombre": "Ana Gómez",
    "rol": "Presentadora",
    "avatarImagen": "ana.png",
    "avatarColor": "#2E2566"
  }
]
```

- `avatarImagen` es sólo el nombre del archivo dentro de `public/avatares/`.
- Si la pones en `null`, el sitio muestra un marcador con las **iniciales** sobre `avatarColor`.
  Es decir, el sitio funciona desde el primer día aunque las caricaturas lleguen después.
- `avatarColor` debe ser un hexadecimal `#rrggbb`.

**Animación de «hablando»:** mientras el video correspondiente está en reproducción, la
caricatura hace un rebote muy corto. Si no hay video, se queda estática. Con
`prefers-reduced-motion: reduce` el rebote se sustituye por un anillo en rosa eosina.

---

## 5. Cómo subir los videos

Hay tres caminos. Puedes mezclarlos: cada placa elige el suyo.

### Opción A · YouTube (recomendada)

1. Sube el video a YouTube como **No listado** (_Unlisted_): no aparece en búsquedas ni en tu
   canal, pero cualquiera con el enlace lo ve. No uses _Privado_: eso impide incrustarlo.
2. Copia **sólo el id** del video, no la URL completa. De
   `https://www.youtube.com/watch?v=dQw4w9WgXcQ` el id es `dQw4w9WgXcQ`.
3. En el JSON de la placa:

```json
"video": { "tipo": "youtube", "src": "dQw4w9WgXcQ", "subtitulos": null, "capitulos": [] }
```

El reproductor usa **youtube-nocookie.com**, así que no deja cookies de seguimiento hasta que se
pulsa reproducir. Los subtítulos se toman de los de YouTube (súbelos allí en español); el campo
`subtitulos` se ignora en este modo.

### Opción B · mp4 local

Para videos pequeños, **menos de 100 MB** (GitHub rechaza archivos más grandes y Pages limita el
sitio a 1 GB).

1. Exporta en H.264 / AAC, 1280 × 720 suele bastar para un avatar hablando.
2. Guarda el archivo en `public/videos/`, por ejemplo `public/videos/duodeno.mp4`.
3. Crea los subtítulos en formato **WebVTT** (`.vtt`) y ponlos al lado:

```
WEBVTT

00:00:00.000 --> 00:00:04.500
En esta preparación de duodeno observamos…
```

4. En el JSON de la placa:

```json
"video": {
  "tipo": "mp4",
  "src": "duodeno.mp4",
  "subtitulos": "duodeno.vtt",
  "capitulos": []
}
```

> Ojo: `.gitignore` excluye `public/videos/*.mp4` por defecto, para que no acabes empujando
> cientos de megas sin darte cuenta. Si quieres versionar un mp4, bórrale esa línea o usa
> `git add -f public/videos/duodeno.mp4`.

### Opción C · solo audio (la más barata)

**No necesitas generar ningún video.** Grabáis la voz y el sitio anima la caricatura del
presentador mientras suena: hace un rebote corto, igual que con un video. La caricatura queda
quieta al pausar.

Por qué suele ser la mejor opción para 46 placas:

- Un mp3 de dos minutos pesa unos 2 MB; el mismo contenido en video son 20–40 MB. Con 46 placas
  la diferencia es entre caber de sobra en GitHub Pages o no caber.
- No hace falta ninguna herramienta de IA para animar la boca.
- Es vuestra voz de verdad.

1. Grabad la explicación (la grabadora del móvil, Audacity o el propio Canva sirven). Exportad a
   **mp3**, **m4a** o **ogg**.
2. Guardad el archivo en `public/videos/`, por ejemplo `public/videos/duodeno.mp3`.
3. En el JSON de la placa:

```json
"video": {
  "tipo": "audio",
  "src": "duodeno.mp3",
  "subtitulos": "duodeno.vtt",
  "capitulos": []
}
```

**Transcripción.** Un elemento `<audio>` no puede mostrar subtítulos: los navegadores sólo
dibujan pistas de texto sobre video. Por eso, en modo audio el archivo `.vtt` que indiques en
`subtitulos` se muestra como **transcripción desplegable**, y cada intervención es un botón que
lleva el audio a ese momento. El formato del `.vtt` es el mismo de la opción B. Es opcional, pero
es lo que hace accesible la explicación para quien no puede oírla.

> Igual que con el mp4, `.gitignore` no filtra los audios: revisa que ninguno se te vaya de
> tamaño antes de empujar.

### Capítulos

Los capítulos enlazan el video con los marcadores: al llegar el video a ese segundo, se resalta
el marcador y el visor se centra en él.

```json
"capitulos": [
  { "estructuraId": "vellosidad", "tiempoSegundos": 12 },
  { "estructuraId": "glandulas-de-brunner", "tiempoSegundos": 48 }
]
```

`estructuraId` tiene que existir en `estructuras`; si no, el build falla con un mensaje claro.

---

## 6. Publicar en GitHub Pages

### Paso 1 · Ajusta `astro.config.mjs`

Arriba del archivo hay dos constantes:

```js
const SITIO = 'https://USUARIO.github.io';
const BASE = '/atlas-histologia';
```

- `SITIO`: `https://<tu-usuario>.github.io`.
- `BASE`: `/<nombre-del-repositorio>`. Si el repositorio se llama exactamente
  `<tu-usuario>.github.io`, pon `BASE = '/'`.

Todos los enlaces del sitio pasan por la función `ruta()` de `src/utils/ruta.ts`, así que con
cambiar estas dos constantes basta.

### Paso 2 · Sube el repositorio

```bash
git init
git add .
git commit -m "Atlas virtual de histología"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/atlas-histologia.git
git push -u origin main
```

### Paso 3 · Activa Pages

En GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

### Paso 4 · Listo

Cada `git push` a `main` dispara `.github/workflows/deploy.yml`, que compila y publica. El
progreso se ve en la pestaña **Actions**; la URL final aparece en **Settings → Pages**.

---

## 7. Cómo está organizado el proyecto

```
originales/                  imágenes fuente de Canva (no se publican)
public/
  placas/                    WebP generados por npm run optimizar
  avatares/                  caricaturas de los presentadores
  videos/                    mp4, audio (mp3/m4a/ogg) y .vtt locales
scripts/
  optimizar-imagenes.mjs     sharp: WebP en tres tamaños
  placeholders.mjs           imágenes de relleno con aspecto H&E
  importar-placas.mjs        parte un JSON grande en un archivo por placa
src/
  content.config.ts          esquemas de Zod: placas y presentadores
  content/
    placas/*.json            una placa por archivo
    presentadores.json       tabla de presentadores
  datos/sistemas.ts          los 6 sistemas, su orden y su color de acento
  estilos/global.css         paleta, tipografía y utilidades
  componentes/               Avatar, VisorPlaca, PanelEstructuras, ExplicadorFlotante…
  cliente/                   TypeScript del navegador (visor, video, quiz, transcripción, anotador)
  layouts/Base.astro
  paginas-dev/anotar.astro   herramienta de anotación (sólo en dev)
  pages/
    index.astro              bandeja de placas con búsqueda y filtros
    placa/[id].astro         visor, marcadores, explicador, repaso
    autores.astro
    creditos.astro
    404.astro
```

### Sistema de diseño

**Paleta** (en `src/estilos/global.css`, tokens de CSS):

| Nombre       | Valor     | Uso                                       |
| ------------ | --------- | ----------------------------------------- |
| Hematoxilina | `#2E2566` | acento principal, marcadores              |
| Eosina       | `#D9497A` | estado activo, foco                       |
| Núcleo       | `#1A1233` | fondo del visor («campo del microscopio») |
| Portaobjetos | `#F4F1F8` | fondo de página                           |
| Vidrio       | `#FFFFFF` | superficies y etiquetas                   |

Los seis sistemas tienen además un color de acento pequeño, usado sólo en el filo de la etiqueta
del portaobjetos y en el punto del filtro.

**Tipografías:** Newsreader (serif) para títulos y nombres de sistemas; Instrument Sans para la
interfaz y el cuerpo. Ambas autoalojadas con `@fontsource-variable`.

**Modo claro y oscuro:** por `prefers-color-scheme`, con un interruptor manual que guarda la
preferencia en `localStorage`.

**Movimiento:** sólo dos gestos, el acercamiento animado del visor hacia una estructura y el
rebote del avatar mientras habla. Ambos desactivados con `prefers-reduced-motion: reduce`.

### Atajos de teclado en la página de placa

| Tecla   | Acción                                     |
| ------- | ------------------------------------------ |
| `←` `→` | placa anterior y siguiente                 |
| `+` `-` | acercar y alejar                           |
| `0`     | ajustar a la pantalla                      |
| `M`     | minimizar o abrir el explicador del avatar |
| `R`     | modo repaso                                |
| `Esc`   | cerrar la ficha de la estructura           |

### URLs compartibles

- Una placa: `/placa/duodeno`
- Una estructura concreta: `/placa/duodeno#estructura=glandulas-de-brunner`
- La bandeja filtrada: `/?sistema=digestivo&q=vellosidad`

---

## 8. Contenido pendiente

Las 46 placas se generaron con textos marcados **PLACEHOLDER** para que la estructura del sitio
funcione desde el principio. Sustitúyelos por tus textos verificados; las placas con
`"borrador": true` se muestran con una etiqueta PLACEHOLDER en la bandeja, y basta poner ese
campo en `false` cuando estén listas.

No hay contenido de histología inventado en este repositorio: donde falta información, lo dice.
