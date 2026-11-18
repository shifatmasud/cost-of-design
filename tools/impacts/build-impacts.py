# Build the impact sprite from Kenney "Impact Sounds" (CC0) one-shots.
import numpy as np, scipy.io.wavfile as w, scipy.signal as sg, json, subprocess, os
SR = 48000; SRC = '/tmp/kimp/wav/'; OUT = '/home/sprite/work/impacts/'
# name, source file, material, high-pass Hz, max length ms
V = [
  ('wood-1',    'impactWood_light_000',    'wood',    120, 200),
  ('wood-2',    'impactWood_light_002',    'wood',    120, 200),
  ('wood-3',    'impactWood_light_003',    'wood',    120, 200),
  ('block-1',   'impactPlank_medium_000',  'wood',    160, 220),
  ('block-2',   'impactPlank_medium_004',  'wood',    160, 220),
  ('ceramic-1', 'impactPlate_light_000',   'ceramic', 140, 280),
  ('ceramic-2', 'impactPlate_light_002',   'ceramic', 140, 280),
  ('plastic-1', 'impactGeneric_light_001', 'plastic', 140, 160),
  ('plastic-2', 'impactGeneric_light_003', 'plastic', 140, 160),
  ('solid-1',   'impactWood_medium_003',   'solid',    90, 300),
]
SLOT = 0.5; PAD = 0.1
hp = lambda f: sg.butter(2, f, 'highpass', fs=SR, output='sos')
lp = sg.butter(2, 5500, 'lowpass', fs=SR, output='sos')
sprite = np.zeros(int(SR * SLOT * len(V))); man = []
for i, (name, src, mat, h, mx) in enumerate(V):
    sr, x = w.read(SRC + src + '.wav'); x = x.astype(float) / 32768
    x = sg.sosfilt(lp, sg.sosfilt(hp(h), x))
    a = np.abs(x); pk = a.max(); on = max(0, int(np.argmax(a > pk * 0.03)) - int(0.001 * SR))
    x = x[on:]; env = np.sqrt(np.convolve(x * x, np.ones(240) / 240, 'same'))
    idx = np.where(env > env.max() * 10 ** (-50 / 20))[0]; end = min(max(idx[-1] + 1, int(0.085 * SR)), int(mx / 1000 * SR))
    x = x[:end].copy(); n = len(x)
    # natural decay kept; the last 35% eases to silence (raised cosine), 1 ms fade-in to avoid a click
    f = int(n * 0.35); x[n - f:] *= 0.5 * (1 + np.cos(np.linspace(0, np.pi, f)))
    fi = int(0.0007 * SR); x[:fi] *= np.linspace(0, 1, fi)
    # level: match the loudness of the first 40 ms, peak never above -1 dBFS
    # level by what a phone speaker plays (above 350 Hz, first 60 ms): all alike, ceramic a little softer, solid a little fuller
    spk = sg.sosfilt(sg.butter(2, 350, 'highpass', fs=SR, output='sos'), x)[:int(0.06 * SR)]
    tgt = {'wood': -20, 'plastic': -20, 'ceramic': -22.5, 'solid': -19}[mat]
    x *= 10 ** (tgt / 20) / np.sqrt(np.mean(spk ** 2))
    if np.abs(x).max() > 0.89: x *= 0.89 / np.abs(x).max()
    s0 = int(SR * (i * SLOT + PAD)); sprite[s0:s0 + n] = x
    w.write(OUT + 'v_' + name + '.wav', SR, (x * 32767).astype(np.int16))
    X = np.abs(np.fft.rfft(x * np.hanning(n), 8192)); fr = np.fft.rfftfreq(8192, 1 / SR)
    man.append({'name': name, 'mat': mat, 'dur': round(n / SR, 3), 'src': src + '.ogg', 'cent': int((X * fr).sum() / X.sum())})
w.write(OUT + 'impacts.wav', SR, (sprite * 32767).astype(np.int16))
json.dump(man, open(OUT + 'manifest.json', 'w'), indent=1)
for m in man: print(m)
