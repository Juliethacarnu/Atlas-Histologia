#!/usr/bin/env node
/**
 * Limpia y nivela los audios de las laminas.
 *
 *   npm run audios              # los que aun no se han mejorado
 *   npm run audios -- --todo    # todos otra vez (desde el original)
 *   npm run audios -- ano bazo  # solo esos
 *
 * Los audios se grabaron en sitios y con telefonos distintos: entre el mas
 * bajo y el mas alto hay 18 dB (uno se oye casi 4 veces mas fuerte que otro),
 * varios traen ruido de fondo y algun retumbe. A cada uno se le hace:
 *
 *   1. quitar el retumbe grave (por debajo de 80 Hz no hay voz);
 *   2. bajar el ruido de fondo, con cuidado para no dejar la voz metalica;
 *   3. un poco menos de "caja" y un poco mas de claridad en la voz;
 *   4. compresion suave, para que las silabas flojas no se pierdan;
 *   5. llevarlos todos al mismo volumen (-16 LUFS, el habitual para voz en
 *      la web), con un limitador para que ningun pico sature.
 *
 * La primera vez el original se guarda en originales/audios/ y siempre se
 * parte de el, asi que repetir el script no degrada nada. La duracion no
 * cambia: subtitulos, capitulos y lip-sync siguen cuadrando.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import ffmpeg from 'ffmpeg-static';

const AUDIOS = join('public', 'audios');
const ORIGINALES = join('originales', 'audios');
const OBJETIVO_LUFS = -16;
const TECHO_DB = -1.5;
const TRABAJO_LUFS = -20;
// Los filtros retrasan el sonido RETRASO_S; se recorta para que el audio
// siga empezando en el mismo instante que el original.
const RETRASO_S = 0.013;
const AJUSTE = `atrim=start=${RETRASO_S},asetpts=PTS-STARTPTS`;

const LIMPIEZA = [
  'highpass=f=80',
  // Quitarruido suave (medias no locales): baja el soplido de fondo unos
  // 13 dB tocando la voz menos de 1 dB. Mas fuerte ya la deja apagada.
  'anlmdn=s=0.5:p=0.002:r=0.006',
  'equalizer=f=250:t=q:w=1.2:g=-2',
  'equalizer=f=3500:t=q:w=1.0:g=2',
  'acompressor=threshold=-24dB:ratio=2.5:attack=8:release=160:makeup=1',
].join(',');

function correr(args) {
  const r = spawnSync(ffmpeg, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(r.stderr.split('\n').slice(-4).join(' '));
  return r.stderr;
}

/** Volumen medio (LUFS) del audio despues de pasarle `filtros`. */
function medir(origen, filtros) {
  const salida = correr([
    '-hide_banner', '-nostats', '-i', origen,
    '-af', `${filtros}loudnorm=print_format=json`,
    '-f', 'null', '-',
  ]);
  const json = salida.slice(salida.lastIndexOf('{'), salida.lastIndexOf('}') + 1);
  return Number(JSON.parse(json).input_i);
}

const args = process.argv.slice(2);
const todo = args.includes('--todo');
const pedidos = new Set(args.filter((a) => !a.startsWith('--')));

mkdirSync(ORIGINALES, { recursive: true });
const archivos = readdirSync(AUDIOS)
  .filter((f) => extname(f).toLowerCase() === '.m4a')
  .filter((f) => pedidos.size === 0 || pedidos.has(basename(f, '.m4a')))
  // Si ya hay original guardado, ese audio ya se mejoro.
  .filter((f) => todo || pedidos.size > 0 || !existsSync(join(ORIGINALES, f)))
  .sort();

if (archivos.length === 0) {
  console.log('Todos los audios ya estan mejorados.');
  process.exit(0);
}

let i = 0;
for (const f of archivos) {
  i++;
  const original = join(ORIGINALES, f);
  const destino = join(AUDIOS, f);
  try {
    if (!existsSync(original)) copyFileSync(destino, original);
    // Primero se lleva a un volumen de trabajo comun: el quitarruido y el
    // compresor actuan segun el nivel, y asi tratan igual a todos los audios.
    const lufs = medir(original, '');
    const previo = `volume=${Math.max(-20, Math.min(24, TRABAJO_LUFS - lufs)).toFixed(2)}dB,${LIMPIEZA}`;
    const ganancia = Math.max(-20, Math.min(24, OBJETIVO_LUFS - medir(original, previo + ',')));
    const tmp = destino + '.tmp.m4a';
    correr([
      '-hide_banner', '-nostats', '-y', '-i', original,
      '-af', `${previo},volume=${ganancia.toFixed(2)}dB,alimiter=limit=${TECHO_DB}dB:level=false,${AJUSTE}`,
      '-ac', '1', '-ar', '48000', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart',
      tmp,
    ]);
    renameSync(tmp, destino);
    console.log(`  ✓ [${i}/${archivos.length}] ${f}: estaba a ${lufs.toFixed(1)} LUFS`);
  } catch (e) {
    console.log(`  ! [${i}/${archivos.length}] ${f}: ${e.message}`);
  }
}
