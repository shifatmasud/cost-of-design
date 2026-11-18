# Build the hero button liquid sprite ("Read the idea") from CC0 water recordings on Freesound.
# Swell (ink spreads in), drain (ink leaves), press (a drop with its ripple tail) and settle (a tiny drip as it springs back).
# Source wavs: the Freesound HQ previews (see media/TAPS.md) decoded with ffmpeg to mono 48 kHz wav:
#   ffmpeg -i <id>.mp3 -ac 1 -ar 48000 <id>.wav
import numpy as np, scipy.io.wavfile as w, scipy.signal as sg, json, subprocess, os
SR = 48000; SRC = '/home/sprite/work/liquid-src/fs/wav/'; OUT = '/home/sprite/work/liquid-out/'
SLOT = 0.8; PAD = 0.08
# name, source id, use, start s, take s, rate (<1 = lower, warmer, longer), high-pass Hz, low-pass Hz,
# out ms, envelope ('drop' = keep the natural decay; 'swell' = quick rise, long fall; 'recede' = slow rise, slow fall), level dB
V = [
  # press: a soft drop, pitched down to a warm bloop, natural ripple tail kept
  ('press-1',  '792931', 'press',  0.000, 0.20, 0.82, 120, 3600, 230, 'drop',   -21),
  ('press-2',  '792932', 'press',  0.100, 0.23, 0.84, 120, 3600, 270, 'drop',   -21),
  ('press-3',  '683102', 'press',  0.060, 0.45, 0.74, 120, 3200, 380, 'drop',   -21),
  # settle: one tiny drip as the button springs back, lower and softer than the press
  ('settle-1', '257349', 'settle', 0.070, 0.16, 0.66, 160, 3000, 170, 'drop',   -25),
  ('settle-2', '476838', 'settle', 8.340, 0.16, 0.72, 160, 3000, 170, 'drop',   -25),
  ('settle-3', '476838', 'settle', 12.84, 0.16, 1.00, 160, 3000, 170, 'drop',   -25),
  # swell: gentle lapping water, quick rise and a long fall, like the ink flood (0.85 s, fast start)
  ('swell-1',  '26472',  'swell',  3.000, 0.70, 0.90, 140, 2400, 620, 'swell',  -25),
  ('swell-2',  '26472',  'swell',  45.50, 0.70, 0.90, 140, 2400, 600, 'swell',  -25),
  ('swell-3',  '26472',  'swell',  43.40, 0.70, 0.90, 140, 2400, 620, 'swell',  -25),
  # drain: the same water, lower and darker, easing in and out, like the ink drain (0.65 s, ease in-out)
  ('drain-1',  '26472',  'drain',  42.50, 0.70, 0.80, 140, 1700, 520, 'recede', -27),
  ('drain-2',  '26472',  'drain',   9.70, 0.70, 0.80, 140, 1700, 500, 'recede', -27),
  ('drain-3',  '26472',  'drain',  31.70, 0.70, 0.80, 140, 1700, 520, 'recede', -27),
]
hp = lambda f: sg.butter(2, f, 'highpass', fs=SR, output='sos')
lp = lambda f: sg.butter(6, f, 'lowpass', fs=SR, output='sos')
spkf = sg.butter(2, 350, 'highpass', fs=SR, output='sos')
sprite = np.zeros(int(SR * SLOT * len(V))); man = []
os.makedirs(OUT, exist_ok=True)
for i, (name, src, use, st, tk, rr, h, l, oms, kind, tgt) in enumerate(V):
    sr, x = w.read(SRC + src + '.wav'); x = x.astype(float) / 32768
    if x.ndim > 1: x = x.mean(1)
    x = x[int(st * SR):int((st + tk) * SR)]
    x = sg.sosfiltfilt(lp(l + 1500), sg.sosfiltfilt(hp(h), x))
    x = sg.resample(x, int(len(x) / rr))           # pitch down: warmer and a little longer
    x = sg.sosfiltfilt(lp(l), x)                    # band-limit again: no hiss
    if kind == 'drop':
        a = np.abs(x); pk = a.max(); on = max(0, int(np.argmax(a > pk * 0.03)) - int(0.001 * SR)); x = x[on:]
    n = min(len(x), int(oms / 1000 * SR)); x = x[:n].copy()
    e = np.ones(n)
    if kind == 'drop':      # natural decay; the last 40% eases to silence; 1 ms fade-in
        f = int(n * 0.4); e[n - f:] = 0.5 * (1 + np.cos(np.linspace(0, np.pi, f))); fi = int(0.001 * SR); e[:fi] = np.linspace(0, 1, fi)
        lvw = (0, int(0.08 * SR))
    elif kind == 'swell':   # 70 ms rise, then a long fall
        a = int(0.07 * SR); e[:a] = 0.5 * (1 - np.cos(np.linspace(0, np.pi, a))); e[a:] = (0.5 * (1 + np.cos(np.linspace(0, np.pi, n - a)))) ** 1.4
        lvw = (0, int(0.2 * SR))
    else:                   # recede: rise over 35%, fall over the rest
        a = int(n * 0.35); e[:a] = 0.5 * (1 - np.cos(np.linspace(0, np.pi, a))); e[a:] = (0.5 * (1 + np.cos(np.linspace(0, np.pi, n - a)))) ** 1.2
        lvw = (int(n * 0.15), int(n * 0.55))
    x *= e; x -= np.linspace(x[0], x[-1], n)       # exact zero at both ends, never clicks
    spk = sg.sosfilt(spkf, x)[lvw[0]:lvw[1]]
    x *= 10 ** (tgt / 20) / np.sqrt(np.mean(spk ** 2))
    if np.abs(x).max() > 0.89: x *= 0.89 / np.abs(x).max()
    s0 = int(SR * (i * SLOT + PAD)); sprite[s0:s0 + n] = x
    w.write(OUT + 'v_' + name + '.wav', SR, (x * 32767).astype(np.int16))
    nf = max(8192, n); X = np.abs(np.fft.rfft(x * np.hanning(n), nf)); fr = np.fft.rfftfreq(nf, 1 / SR)
    hi = 10 * np.log10((X[fr > 4000] ** 2).sum() / (X ** 2).sum() + 1e-12)
    man.append({'name': name, 'use': use, 'dur': round(n / SR, 3), 'src': 'freesound ' + src, 'cent': int((X * fr).sum() / X.sum()), 'above4k_dB': float(round(hi, 1))})
w.write(OUT + 'liquid.wav', SR, (sprite * 32767).astype(np.int16))
json.dump(man, open(OUT + 'manifest.json', 'w'), indent=1)
for m in man: print(m)
# encode: Opus 32 kbps, MP3 48 kbps at 24 kHz
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', OUT + 'liquid.wav', '-ac', '1', '-c:a', 'libopus', '-b:a', '32k', OUT + 'liquid.ogg'], check=True)
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', OUT + 'liquid.wav', '-ac', '1', '-ar', '24000', '-c:a', 'libmp3lame', '-b:a', '48k', OUT + 'liquid.mp3'], check=True)
