#!/usr/bin/env python3
"""
Limpia la voz de un WAV con DeepFilterNet (lo usa npm run audios).

    python scripts/limpiar_voz.py entrada.wav salida.wav [mas pares...]

DeepFilterNet es una red entrenada para separar la voz de todo lo demas:
soplido, ventilador, eco de la habitacion. Trabaja a 48 kHz y no cambia la
duracion. Se deja un tope de atenuacion para que el fondo no quede en un
silencio digital, que suena artificial entre frases.

Requisitos (una vez; Python 3.9-3.11):
    pip install torch==2.0.1 torchaudio==2.0.2 deepfilternet==0.5.6 soundfile "numpy<2" \
        --extra-index-url https://download.pytorch.org/whl/cpu
"""

import sys

import soundfile as sf
import torch
from df.enhance import enhance, init_df

# Cuanto se puede bajar el fondo, como mucho (dB).
TOPE_DB = 30


def main():
    pares = sys.argv[1:]
    if len(pares) < 2 or len(pares) % 2:
        sys.exit(__doc__)
    modelo, estado, _ = init_df(log_level="ERROR")
    for entrada, salida in zip(pares[::2], pares[1::2]):
        audio, sr = sf.read(entrada, dtype="float32", always_2d=True)
        if sr != estado.sr():
            sys.exit(f"{entrada}: se esperaba {estado.sr()} Hz y trae {sr}")
        limpio = enhance(modelo, estado, torch.from_numpy(audio.T), atten_lim_db=TOPE_DB)
        sf.write(salida, limpio.numpy().T, sr, subtype="PCM_24")
        print(salida, flush=True)


if __name__ == "__main__":
    main()
