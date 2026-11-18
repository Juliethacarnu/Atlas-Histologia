#!/usr/bin/env python3
"""
Lip-sync preciso para audios en espanol, con WhisperX.

    python scripts/lipsync_whisperx.py            # audios sin JSON de WhisperX
    python scripts/lipsync_whisperx.py --todo     # todos otra vez
    python scripts/lipsync_whisperx.py ano bazo   # solo esos

Rhubarb (npm run lipsync) adivina los sonidos sin saber que palabra se dice.
Este script primero transcribe el audio con Whisper (sabe espanol) y despues
alinea cada letra con el sonido (modelo wav2vec2 de espanol). Como el espanol
se escribe casi como se pronuncia, saber que letra suena en cada instante da
la forma de la boca con mucha mas precision.

Deja public/lipsync/<audio>.json con el mismo formato que Rhubarb (codigos A-H
y X), asi el cliente no cambia: si un audio tiene JSON de WhisperX se usa ese,
y si no, el de Rhubarb.

Requisitos (una vez; Python 3.10-3.12, WhisperX aun no funciona con 3.13+):
    pip install whisperx --extra-index-url https://download.pytorch.org/whl/cpu
Los modelos (~2 GB) se descargan solos la primera vez. Funciona sin GPU.
"""

import json
import os
import subprocess
import sys
import tempfile
import unicodedata

AUDIOS = os.path.join("public", "audios")
DESTINO = os.path.join("public", "lipsync")
EXTENSIONES = {".m4a", ".mp3", ".wav", ".ogg", ".aac", ".webm"}
MODELO = os.environ.get("WHISPER_MODELO", "medium")

# Letra -> codigo de boca (los mismos codigos de Rhubarb; el cliente los
# traduce a imagenes con MAPA_RHUBARB en src/cliente/lipsync-avatar.ts).
#   A labios cerrados   B casi cerrada   C abierta (e, i)   D muy abierta (a)
#   E redondeada (o)    F redonda (u)    G labiodental (f)  H lengua (l)
LETRAS = {
    "a": "D",
    "e": "C",
    "i": "C",
    "y": "C",
    "o": "E",
    "u": "F",
    "w": "F",
    # En espanol la b y la v suenan igual: los dos labios se juntan.
    "m": "A",
    "b": "A",
    "p": "A",
    "v": "A",
    "f": "G",
    "l": "H",
}
# El resto de consonantes (s, t, d, n, r, c, k, g, j, z, ch, ll, n...) dejan la
# boca casi cerrada, con los dientes cerca: B. La h no suena.
MUDAS = {"h"}

# Una pausa entre palabras mas larga que esto cierra la boca.
PAUSA_S = 0.18
# Formas mas cortas que esto se funden con la anterior: la boca no llega.
MINIMO_S = 0.045


def sin_tilde(c):
    return unicodedata.normalize("NFD", c)[0].lower()


def codigo(letra):
    c = sin_tilde(letra)
    if not c.isalpha() or c in MUDAS:
        return None
    return LETRAS.get(c, "B")


def ffmpeg():
    # El mismo ffmpeg que usa npm run lipsync.
    local = os.path.join("node_modules", "ffmpeg-static", "ffmpeg")
    return local if os.path.exists(local) else "ffmpeg"


def a_wav(origen, destino):
    subprocess.run(
        [ffmpeg(), "-loglevel", "error", "-y", "-i", origen, "-ac", "1", "-ar", "16000", destino],
        check=True,
    )


def leer_wav(ruta):
    """WAV mono de 16 kHz a float32 (whisperx.load_audio exige ffmpeg en el PATH)."""
    import wave

    import numpy as np

    with wave.open(ruta, "rb") as w:
        datos = w.readframes(w.getnframes())
    return np.frombuffer(datos, np.int16).astype(np.float32) / 32768.0


def cues_de(segmentos, duracion):
    """De letras con tiempo a una lista [inicio, codigo] sin huecos."""
    marcas = []  # (inicio, fin, codigo)
    for seg in segmentos:
        for ch in seg.get("chars", []):
            if "start" not in ch or "end" not in ch:
                continue
            c = codigo(ch.get("char", ""))
            if c is None:
                continue
            marcas.append((float(ch["start"]), float(ch["end"]), c))
    marcas.sort()

    cues = [[0.0, "X"]]
    fin_anterior = 0.0
    for inicio, fin, c in marcas:
        if inicio - fin_anterior > PAUSA_S:
            cues.append([round(fin_anterior + 0.04, 3), "X"])
        cues.append([round(inicio, 3), c])
        fin_anterior = max(fin_anterior, fin)
    cues.append([round(fin_anterior + 0.04, 3), "X"])

    # Ordenar, quitar repetidos seguidos y fundir los demasiado cortos.
    limpio = []
    for t, c in sorted(cues, key=lambda x: x[0]):
        if limpio and t - limpio[-1][0] < MINIMO_S:
            # El anterior dura casi nada: lo reemplaza este.
            limpio[-1] = [limpio[-1][0], c]
        elif not limpio or limpio[-1][1] != c:
            limpio.append([t, c])
        # mismo codigo seguido: se alarga solo
    # Puede haber quedado el mismo codigo dos veces seguidas tras fundir.
    final = []
    for t, c in limpio:
        if not final or final[-1][1] != c:
            final.append([t, c])
    return [x for x in final if x[0] <= duracion]


def main():
    args = sys.argv[1:]
    todo = "--todo" in args
    pedidos = {a for a in args if not a.startswith("--")}

    archivos = []
    for f in sorted(os.listdir(AUDIOS)):
        nombre, ext = os.path.splitext(f)
        if ext.lower() not in EXTENSIONES:
            continue
        if pedidos and nombre not in pedidos:
            continue
        json_path = os.path.join(DESTINO, nombre + ".json")
        if not todo and not pedidos and os.path.exists(json_path):
            with open(json_path, encoding="utf-8") as fh:
                if json.load(fh).get("herramienta", "").startswith("whisperx"):
                    continue
        archivos.append(f)

    if not archivos:
        print("Todos los audios ya tienen lip-sync de WhisperX.")
        return

    import torch  # noqa: E402  (pesado: solo si hay trabajo)
    import whisperx  # noqa: E402

    torch.set_num_threads(max(1, (os.cpu_count() or 2) - 1))
    print(f"Cargando Whisper '{MODELO}' y el alineador de espanol…")
    modelo = whisperx.load_model(MODELO, "cpu", compute_type="int8", language="es")
    alineador, meta = whisperx.load_align_model(language_code="es", device="cpu")

    os.makedirs(DESTINO, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        for i, f in enumerate(archivos, 1):
            nombre = os.path.splitext(f)[0]
            try:
                wav = os.path.join(tmp, nombre + ".wav")
                a_wav(os.path.join(AUDIOS, f), wav)
                audio = leer_wav(wav)
                duracion = len(audio) / 16000
                texto = modelo.transcribe(audio, batch_size=8, language="es")
                alineado = whisperx.align(
                    texto["segments"], alineador, meta, audio, "cpu", return_char_alignments=True
                )
                cues = cues_de(alineado["segments"], duracion)
                salida = {
                    "version": 1,
                    "herramienta": f"whisperx {MODELO} + wav2vec2 es (letras)",
                    "audio": f,
                    "duracion": round(duracion, 3),
                    "texto": " ".join(s["text"].strip() for s in texto["segments"]),
                    "cues": cues,
                }
                with open(os.path.join(DESTINO, nombre + ".json"), "w", encoding="utf-8") as fh:
                    json.dump(salida, fh, ensure_ascii=False, separators=(",", ":"))
                    fh.write("\n")
                print(f"  ✓ [{i}/{len(archivos)}] {f}: {len(cues)} posiciones de boca", flush=True)
            except Exception as e:  # un audio malo no para los demas
                print(f"  ! [{i}/{len(archivos)}] {f}: {e}", flush=True)


if __name__ == "__main__":
    main()
