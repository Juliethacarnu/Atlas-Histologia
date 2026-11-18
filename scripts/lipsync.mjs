#!/usr/bin/env node
/**
 * npm run lipsync              procesa los audios que todavia no tienen JSON
 * npm run lipsync -- --todo    los vuelve a procesar todos
 * npm run lipsync -- ano       solo los audios cuyo nombre se indica
 *
 * Analiza cada audio de public/audios/ con Rhubarb Lip Sync y deja en
 * public/lipsync/<audio>.json que forma tiene la boca en cada momento. El sitio
 * es estatico (GitHub Pages): el analisis se hace aqui, una vez, y el navegador
 * solo lee el resultado.
 *
 * Rhubarb (https://github.com/DanielSWolf/rhubarb-lip-sync) trae dos
 * reconocedores: PocketSphinx, que solo entiende ingles, y "phonetic", que no
 * depende del idioma: reconoce sonidos, no palabras. Las grabaciones estan en
 * espanol, asi que se usa siempre `-r phonetic`. Su limite: no sabe que
 * palabra se dice, solo como suena, y a veces confunde vocales cercanas (una
 * "o" que sale como "a" abierta). Para mover una boca es suficiente.
 *
 * El JSON guarda los codigos de Rhubarb tal cual (A-H y X); a que imagen de la
 * boca corresponde cada uno lo decide el cliente (src/cliente/lipsync-avatar.ts,
 * tabla MAPA_RHUBARB).
 *
 * Herramientas: ffmpeg viene con el paquete ffmpeg-static (devDependency).
 * Rhubarb se descarga solo la primera vez, de la release oficial de GitHub, a
 * .herramientas/ (no se versiona). Tambien se puede indicar uno ya instalado
 * con la variable RHUBARB=/ruta/al/rhubarb.
 */
import { execFile } from 'node:child_process';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir, cpus } from 'node:os';
import { basename, extname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import ffmpeg from 'ffmpeg-static';

const ejecutar = promisify(execFile);

const AUDIOS = join('public', 'audios');
const DESTINO = join('public', 'lipsync');
const HERRAMIENTAS = '.herramientas';
const VERSION_RHUBARB = '1.14.0';
const EXTENSIONES = new Set(['.m4a', '.mp3', '.wav', '.ogg', '.aac', '.webm']);

/* ------------------------------ Rhubarb --------------------------------- */

async function conseguirRhubarb() {
  if (process.env.RHUBARB) return process.env.RHUBARB;

  const plataforma = { linux: 'Linux', darwin: 'macOS', win32: 'Windows' }[process.platform];
  if (!plataforma) throw new Error(`Rhubarb no tiene version para ${process.platform}`);
  const carpeta = join(HERRAMIENTAS, `Rhubarb-Lip-Sync-${VERSION_RHUBARB}-${plataforma}`);
  const binario = join(carpeta, process.platform === 'win32' ? 'rhubarb.exe' : 'rhubarb');
  if (existsSync(binario)) return binario;

  const zip = join(HERRAMIENTAS, `rhubarb-${VERSION_RHUBARB}.zip`);
  const url =
    `https://github.com/DanielSWolf/rhubarb-lip-sync/releases/download/v${VERSION_RHUBARB}/` +
    `Rhubarb-Lip-Sync-${VERSION_RHUBARB}-${plataforma}.zip`;
  console.log(`Descargando Rhubarb ${VERSION_RHUBARB} de la release oficial…`);
  mkdirSync(HERRAMIENTAS, { recursive: true });
  const respuesta = await fetch(url);
  if (!respuesta.ok || !respuesta.body) throw new Error(`No se pudo descargar ${url}`);
  await pipeline(Readable.fromWeb(respuesta.body), createWriteStream(zip));
  try {
    await ejecutar('unzip', ['-oq', zip, '-d', HERRAMIENTAS]);
  } catch {
    // Sin unzip (Windows): tar de bsdtar tambien abre .zip.
    await ejecutar('tar', ['-xf', zip, '-C', HERRAMIENTAS]);
  }
  rmSync(zip, { force: true });
  if (!existsSync(binario)) throw new Error(`No aparecio ${binario} al descomprimir`);
  return binario;
}

/* ------------------------------ Un audio -------------------------------- */

async function procesar(rhubarb, archivo) {
  const nombre = basename(archivo, extname(archivo));
  const wav = join(tmpdir(), `atlas-lipsync-${process.pid}-${nombre}.wav`);
  try {
    // Rhubarb solo lee WAV u Ogg: se pasa a WAV mono de 16 kHz, que es lo que
    // usa por dentro.
    await ejecutar(ffmpeg, [
      '-loglevel',
      'error',
      '-y',
      '-i',
      join(AUDIOS, archivo),
      '-ac',
      '1',
      '-ar',
      '16000',
      wav,
    ]);
    const { stdout } = await ejecutar(
      rhubarb,
      ['-q', '-r', 'phonetic', '-f', 'json', '--extendedShapes', 'GHX', wav],
      { maxBuffer: 32 * 1024 * 1024 },
    );
    const resultado = JSON.parse(stdout);
    const cues = resultado.mouthCues.map((c) => [Math.round(c.start * 1000) / 1000, c.value]);
    const salida = {
      version: 1,
      herramienta: `rhubarb ${VERSION_RHUBARB} -r phonetic --extendedShapes GHX`,
      audio: archivo,
      duracion: resultado.metadata.duration,
      // [segundo en que empieza, codigo de Rhubarb]; cada uno dura hasta el siguiente.
      cues,
    };
    writeFileSync(join(DESTINO, `${nombre}.json`), JSON.stringify(salida) + '\n');
    return cues.length;
  } finally {
    rmSync(wav, { force: true });
  }
}

/* -------------------------------- Todos --------------------------------- */

const argumentos = process.argv.slice(2);
const todo = argumentos.includes('--todo');
const pedidos = argumentos.filter((a) => !a.startsWith('--'));

mkdirSync(DESTINO, { recursive: true });
const audios = readdirSync(AUDIOS)
  .filter((f) => EXTENSIONES.has(extname(f).toLowerCase()))
  .filter((f) => pedidos.length === 0 || pedidos.includes(basename(f, extname(f))))
  .filter((f) => {
    if (todo || pedidos.length > 0) return true;
    const json = join(DESTINO, `${basename(f, extname(f))}.json`);
    // Se rehace si el audio es mas nuevo que su JSON (se cambio la grabacion).
    return !existsSync(json) || statSync(json).mtimeMs < statSync(join(AUDIOS, f)).mtimeMs;
  });

if (audios.length === 0) {
  console.log(
    'Todos los audios ya tienen su lip-sync. (npm run lipsync -- --todo para rehacerlos)',
  );
  process.exit(0);
}

const rhubarb = await conseguirRhubarb();
console.log(`Analizando ${audios.length} audio(s) con Rhubarb (reconocedor fonetico)…`);

const cola = [...audios];
let fallos = 0;
const trabajadores = Array.from(
  { length: Math.max(1, Math.min(4, cpus().length - 1)) },
  async () => {
    while (cola.length > 0) {
      const archivo = cola.shift();
      try {
        const n = await procesar(rhubarb, archivo);
        console.log(`  ✓ ${archivo}: ${n} posiciones de boca`);
      } catch (e) {
        fallos++;
        console.log(`  ! ${archivo}: ${e.message.split('\n')[0]}`);
      }
    }
  },
);
await Promise.all(trabajadores);

// Quitar los JSON de audios que ya no existen.
const vivos = new Set(readdirSync(AUDIOS).map((f) => basename(f, extname(f))));
for (const f of readdirSync(DESTINO)) {
  if (f.endsWith('.json') && !vivos.has(basename(f, '.json'))) {
    rmSync(join(DESTINO, f));
    console.log(`  - ${f}: su audio ya no esta, se borra`);
  }
}

if (fallos > 0) {
  console.log(`${fallos} audio(s) fallaron; esos siguen funcionando con la boca por volumen.`);
  process.exitCode = 1;
}
