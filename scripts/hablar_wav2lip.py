#!/usr/bin/env python3
"""
Video del presentador diciendo de verdad cada audio (Wav2Lip).

    python scripts/hablar_wav2lip.py            # audios sin video todavia
    python scripts/hablar_wav2lip.py --todo     # todos otra vez
    python scripts/hablar_wav2lip.py ano bazo   # solo esos

Cada presentador tiene un video corto en bucle (originales/avatares/<Nombre>/
<Nombre>-bucle-original.mp4) donde mueve la cabeza, parpadea y gesticula, pero
sin decir nada concreto. Este script repite ese bucle lo que dure el audio de
cada lamina y le redibuja los labios con Wav2Lip para que digan ese audio.
Queda una persona que se mueve con naturalidad y cuya boca coincide con la voz.

Sale un mp4 mudo por lamina en public/hablando/<id>.mp4; la pagina lo
reproduce pegado al audio (src/cliente/video-hablando.ts).

Requisitos (una vez; Python 3.10-3.12):
    pip install onnxruntime numpy opencv-python-headless librosa
y dos modelos en ~/.cache/atlas-lipsync/modelos/ (o en $ATLAS_MODELOS):
    wav2lip_gan.onnx  https://huggingface.co/bluefoxcreation/Wav2lip-Onnx
    yunet.onnx        https://github.com/opencv/opencv_zoo (face_detection_yunet_2023mar.onnx)
Funciona sin GPU: ~1 minuto de computo por minuto de audio en 12 nucleos.
"""

import glob
import json
import os
import subprocess
import sys
import tempfile

import cv2
import librosa
import numpy as np
import onnxruntime as ort

PLACAS = os.path.join("src", "content", "placas")
PRESENTADORES = os.path.join("src", "content", "presentadores.json")
AUDIOS = os.path.join("public", "audios")
DESTINO = os.path.join("public", "hablando")
MODELOS = os.environ.get("ATLAS_MODELOS", os.path.expanduser("~/.cache/atlas-lipsync/modelos"))

FPS = 25
LADO = 448  # lado del video final, cuadrado
LOTE = 32

# Por presentador: recorte cuadrado del bucle original (lado y borde de arriba,
# en pixeles del original; el ancho se toma entero) y el segundo del bucle en
# que tiene la boca cerrada y la cara tranquila. Ese cuadro es la referencia
# que se le da a Wav2Lip: si se le diera el mismo cuadro que esta retocando
# (como hace el script original), cuando el presentador sonrie en el bucle la
# sonrisa se cuela en el resultado aunque el audio diga otra cosa.
RECORTES = {
    "Sara": (720, 98, 2.0),
    "Valeria": (720, 40, 2.0),
    "Daniel": (1080, 135, 3.5),
    "Andrea": (1080, 48, 10.7),
}


def ffmpeg():
    local = os.path.join("node_modules", "ffmpeg-static", "ffmpeg")
    return local if os.path.exists(local) else "ffmpeg"


# ------------------------------ El audio --------------------------------


def mel_de(ruta_audio):
    """Espectrograma mel exactamente como lo espera Wav2Lip (80 x T, 80 cuadros/s)."""
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        wav = tmp.name
    try:
        subprocess.run(
            [ffmpeg(), "-loglevel", "error", "-y", "-i", ruta_audio, "-ac", "1", "-ar", "16000", wav],
            check=True,
        )
        y, _ = librosa.load(wav, sr=16000)
    finally:
        os.unlink(wav)
    callado = callado_de(y)  # antes del preenfasis, que sube el ruido de fondo
    y = np.append(y[0], y[1:] - 0.97 * y[:-1])  # preenfasis
    d = np.abs(librosa.stft(y, n_fft=800, hop_length=200, win_length=800))
    base = librosa.filters.mel(sr=16000, n_fft=800, n_mels=80, fmin=55, fmax=7600)
    s = 20 * np.log10(np.maximum(1e-5, base @ d)) - 20
    return np.clip(8 * ((s + 100) / 100) - 4, -4, 4).astype(np.float32), len(y) / 16000, callado


def callado_de(y):
    """
    Por cuadro de video, cuanto hay que cerrar la boca (0 = habla, 1 = callado).

    Wav2Lip a veces deja la boca abierta en un silencio, sobre todo si en ese
    tramo del bucle el presentador sonrie. Los silencios se sacan del volumen
    del propio audio: tramos de al menos 0,2 s por debajo del 15 % del nivel
    normal de la voz. La boca tarda un par de cuadros en cerrar y abre un
    pelin antes de que vuelva la voz.
    """
    n = int(np.ceil(len(y) / 16000 * FPS))
    paso = 16000 // FPS
    rms = np.array([np.sqrt(np.mean(y[i * paso : (i + 2) * paso] ** 2) + 1e-12) for i in range(n)])
    voz = np.median(rms[rms > np.percentile(rms, 40)])
    mudo = rms < voz * 0.15
    callado = np.zeros(n, np.float32)
    i = 0
    while i < n:
        if not mudo[i]:
            i += 1
            continue
        j = i
        while j < n and mudo[j]:
            j += 1
        if j - i >= int(0.2 * FPS):
            callado[i + 1 : max(i + 1, j - 2)] = 1.0
        i = j
    # Entrar y salir en tres cuadros, no de golpe.
    return np.convolve(callado, np.ones(3) / 3, mode="same")


# ---------------------------- El presentador ----------------------------


class Bucle:
    """El bucle de un presentador, ya recortado, con la cara localizada."""

    def __init__(self, nombre):
        lado, arriba, reposo = RECORTES[nombre]
        origen = os.path.join("originales", "avatares", nombre, f"{nombre}-bucle-original.mp4")
        cap = cv2.VideoCapture(origen)
        fps = cap.get(cv2.CAP_PROP_FPS) or 30
        todos = []
        while True:
            ok, f = cap.read()
            if not ok:
                break
            f = f[arriba : arriba + lado, :lado]
            todos.append(cv2.resize(f, (LADO, LADO), interpolation=cv2.INTER_AREA))
        cap.release()
        # De la cadencia original a 25 cuadros/s.
        n = int(len(todos) / fps * FPS)
        self.cuadros = [todos[min(len(todos) - 1, round(i * fps / FPS))] for i in range(n)]

        det = cv2.FaceDetectorYN.create(os.path.join(MODELOS, "yunet.onnx"), "", (LADO, LADO), 0.5)
        cajas = []
        for f in self.cuadros:
            _, caras = det.detect(f)
            if caras is None or len(caras) == 0:
                cajas.append(cajas[-1] if cajas else None)
                continue
            x, y, w, h = max(caras, key=lambda c: c[2] * c[3])[:4]
            cajas.append([x, y, x + w, y + h])
        primera = next((c for c in cajas if c is not None), None)
        if primera is None:
            raise RuntimeError(f"No se encontro la cara en el bucle de {nombre}")
        cajas = np.array([c if c is not None else primera for c in cajas], np.float32)
        # Suavizar en el tiempo (el bucle es circular) para que el recorte no tiemble.
        k = 7
        ext = np.concatenate([cajas[-k:], cajas, cajas[:k]])
        nucleo = np.ones(2 * k + 1) / (2 * k + 1)
        suave = np.stack([np.convolve(ext[:, j], nucleo, mode="valid") for j in range(4)], axis=1)
        # Wav2Lip se entreno con cajas que bajan un poco de la barbilla.
        alto = suave[:, 3] - suave[:, 1]
        suave[:, 3] += alto * 0.08
        self.cajas = np.clip(np.round(suave), 0, LADO).astype(int)
        r = min(len(self.cuadros) - 1, int(reposo * FPS))
        x0, y0, x1, y1 = self.cajas[r]
        self.referencia = cv2.resize(
            self.cuadros[r][y0:y1, x0:x1], (96, 96), interpolation=cv2.INTER_AREA
        )

    def cuadro(self, i):
        j = i % len(self.cuadros)
        return self.cuadros[j], self.cajas[j]


def mascara(alto, ancho):
    """Solo se pega la mitad de abajo de la cara, con el borde difuminado."""
    m = np.zeros((alto, ancho), np.float32)
    cv2.ellipse(
        m,
        (ancho // 2, int(alto * 0.70)),
        (int(ancho * 0.36), int(alto * 0.27)),
        0,
        0,
        360,
        1.0,
        -1,
    )
    k = max(3, int(ancho * 0.12) | 1)
    return cv2.GaussianBlur(m, (k, k), 0)[..., None]


# ------------------------------ Una lamina ------------------------------


def hablar(sesion, bucle, ruta_audio, salida):
    mel, duracion, callado = mel_de(ruta_audio)
    total = int(np.ceil(duracion * FPS))
    with tempfile.TemporaryDirectory() as tmp:
        crudo = os.path.join(tmp, "crudo.mp4")
        video = cv2.VideoWriter(crudo, cv2.VideoWriter_fourcc(*"mp4v"), FPS, (LADO, LADO))
        for a in range(0, total, LOTE):
            idx = range(a, min(total, a + LOTE))
            caras, mels, datos = [], [], []
            for i in idx:
                cuadro, (x0, y0, x1, y1) = bucle.cuadro(i)
                cara = cv2.resize(cuadro[y0:y1, x0:x1], (96, 96), interpolation=cv2.INTER_AREA)
                ini = int(i * 80.0 / FPS)
                trozo = mel[:, ini : ini + 16]
                if trozo.shape[1] < 16:
                    trozo = mel[:, -16:]
                caras.append(cara)
                mels.append(trozo)
                datos.append((cuadro, x0, y0, x1, y1))
            tapadas = np.asarray(caras, np.float32) / 255.0
            tapadas[:, 48:] = 0
            refs = np.repeat(bucle.referencia[None].astype(np.float32) / 255.0, len(tapadas), 0)
            entrada = np.concatenate([tapadas, refs], axis=3).transpose(0, 3, 1, 2)
            entrada_mel = np.asarray(mels, np.float32)[:, None]
            nombres = [e.name for e in sesion.get_inputs()]
            # El modelo recibe (mel, video); se emparejan por forma, no por nombre.
            alim = {}
            for e in sesion.get_inputs():
                alim[e.name] = entrada_mel if e.shape[1] == 1 else entrada
            assert len(alim) == len(nombres) == 2
            pred = sesion.run(None, alim)[0].transpose(0, 2, 3, 1) * 255.0
            for i, p, (cuadro, x0, y0, x1, y1) in zip(idx, pred, datos):
                c = float(callado[min(i, len(callado) - 1)])
                if c > 0:
                    # En silencio, la boca cerrada del cuadro de referencia.
                    p = p * (1 - c) + bucle.referencia.astype(np.float32) * c
                ancho, alto = x1 - x0, y1 - y0
                nueva = cv2.resize(p, (ancho, alto), interpolation=cv2.INTER_CUBIC)
                # Un poco de nitidez: el modelo trabaja a 96 px y sale blando.
                nueva = cv2.addWeighted(nueva, 1.5, cv2.GaussianBlur(nueva, (0, 0), 1.6), -0.5, 0)
                m = mascara(alto, ancho)
                fuera = cuadro.copy()
                zona = fuera[y0:y1, x0:x1].astype(np.float32)
                fuera[y0:y1, x0:x1] = np.clip(nueva * m + zona * (1 - m), 0, 255).astype(np.uint8)
                video.write(fuera)
        video.release()
        os.makedirs(os.path.dirname(salida), exist_ok=True)
        subprocess.run(
            [ffmpeg(), "-loglevel", "error", "-y", "-i", crudo, "-an", "-c:v", "libx264",
             "-profile:v", "main", "-pix_fmt", "yuv420p", "-crf", "27", "-preset", "slow",
             "-g", "50", "-movflags", "+faststart", salida],
            check=True,
        )
    return duracion


def main():
    args = sys.argv[1:]
    todo = "--todo" in args
    pedidos = {a for a in args if not a.startswith("--")}

    with open(PRESENTADORES, encoding="utf-8") as fh:
        carpetas = {p["id"]: p["avatarCarpeta"] for p in json.load(fh)}

    trabajos = []
    for ruta in sorted(glob.glob(os.path.join(PLACAS, "*.json"))):
        with open(ruta, encoding="utf-8") as fh:
            placa = json.load(fh)
        video = placa.get("video") or {}
        nombre = carpetas.get(placa.get("presentador"))
        if video.get("tipo") != "audio" or nombre not in RECORTES:
            continue
        ident = os.path.splitext(video["src"])[0]
        if pedidos and ident not in pedidos:
            continue
        salida = os.path.join(DESTINO, ident + ".mp4")
        if not todo and not pedidos and os.path.exists(salida):
            continue
        trabajos.append((nombre, os.path.join(AUDIOS, video["src"]), salida))

    if not trabajos:
        print("Todas las laminas ya tienen su video hablado.")
        return

    opciones = ort.SessionOptions()
    opciones.intra_op_num_threads = max(1, (os.cpu_count() or 2) - 1)
    sesion = ort.InferenceSession(
        os.path.join(MODELOS, "wav2lip_gan.onnx"), opciones, providers=["CPUExecutionProvider"]
    )
    bucles = {}
    for i, (nombre, audio, salida) in enumerate(trabajos, 1):
        try:
            if nombre not in bucles:
                bucles[nombre] = Bucle(nombre)
            d = hablar(sesion, bucles[nombre], audio, salida)
            kb = os.path.getsize(salida) / 1024
            print(f"  ✓ [{i}/{len(trabajos)}] {os.path.basename(salida)} ({nombre}, {d:.0f} s, {kb:.0f} KB)", flush=True)
        except Exception as e:  # una lamina mala no para las demas
            print(f"  ! [{i}/{len(trabajos)}] {os.path.basename(salida)}: {e}", flush=True)


if __name__ == "__main__":
    main()
