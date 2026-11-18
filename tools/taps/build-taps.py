# Build the 3D tap sprite from Kenney "Impact Sounds" (CC0) recorded one-shots.
# These are the sounds for touching the 3D scenes: press, tap, grab, drag and let go.
import numpy as np, scipy.io.wavfile as w, scipy.signal as sg, json, subprocess, os
SR = 48000; SRC = '/tmp/kimp/wav/'; OUT = '/home/sprite/work/taps/'
# name, source file, use, high-pass Hz, max length ms, speaker level dB
V = [
  ('press-1',   'impactPunch_medium_000',  'press',   140, 150, -21),
  ('press-2',   'impactPunch_medium_001',  'press',   140, 150, -21),
  ('press-3',   'impactPunch_medium_004',  'press',   140, 150, -21),
  ('tap-1',     'impactGeneric_light_000', 'tap',     180, 120, -22),
  ('tap-2',     'impactGeneric_light_002', 'tap',     180, 120, -22),
  ('tap-3',     'impactGeneric_light_004', 'tap',     180, 120, -22),
  ('grab-1',    'impactPunch_medium_002',  'grab',    160, 130, -22),
  ('grab-2',    'impactPunch_medium_003',  'grab',    160, 130, -22),
  ('let-1',     'footstep_carpet_000',     'release', 250, 110, -23),
  ('let-2',     'footstep_carpet_001',     'release', 250, 140, -23),
  ('let-3',     'footstep_carpet_003',     'release', 250, 100, -23),
]
SLOT = 0.4; PAD = 0.08
hp = lambda f: sg.butter(2, f, 'highpass', fs=SR, output='sos')
lp = sg.butter(2, 5500, 'lowpass', fs=SR, output='sos')
sprite = np.zeros(int(SR * SLOT * len(V))); man = []
os.makedirs(OUT, exist_ok=True)
for i, (name, src, use, h, mx, tgt) in enumerate(V):
    sr, x = w.read(SRC + src + '.wav'); x = x.astype(float) / 32768
    if x.ndim > 1: x = x.mean(1)
    x = sg.sosfilt(lp, sg.sosfilt(hp(h), x))
    a = np.abs(x); pk = a.max(); on = max(0, int(np.argmax(a > pk * 0.03)) - int(0.001 * SR))
    x = x[on:]; env = np.sqrt(np.convolve(x * x, np.ones(240) / 240, 'same'))
    idx = np.where(env > env.max() * 10 ** (-48 / 20))[0]; end = min(max(idx[-1] + 1, int(0.045 * SR)), int(mx / 1000 * SR))
    x = x[:end].copy(); n = len(x)
    # natural decay kept; the last 35% eases to silence, 0.7 ms fade-in so it never clicks. No reverb.
    f = int(n * 0.35); x[n - f:] *= 0.5 * (1 + np.cos(np.linspace(0, np.pi, f)))
    fi = int(0.0007 * SR); x[:fi] *= np.linspace(0, 1, fi)
    # level by what a phone speaker plays (above 350 Hz, first 60 ms); peak never above -1 dBFS
    spk = sg.sosfilt(sg.butter(2, 350, 'highpass', fs=SR, output='sos'), x)[:int(0.06 * SR)]
    x *= 10 ** (tgt / 20) / np.sqrt(np.mean(spk ** 2))
    if np.abs(x).max() > 0.89: x *= 0.89 / np.abs(x).max()
    s0 = int(SR * (i * SLOT + PAD)); sprite[s0:s0 + n] = x
    w.write(OUT + 'v_' + name + '.wav', SR, (x * 32767).astype(np.int16))
    X = np.abs(np.fft.rfft(x * np.hanning(n), 8192)); fr = np.fft.rfftfreq(8192, 1 / SR)
    man.append({'name': name, 'use': use, 'dur': round(n / SR, 3), 'src': src + '.ogg', 'cent': int((X * fr).sum() / X.sum())})
w.write(OUT + 'taps.wav', SR, (sprite * 32767).astype(np.int16))
json.dump(man, open(OUT + 'manifest.json', 'w'), indent=1)
for m in man: print(m)
# encode: Opus 32 kbps, MP3 48 kbps at 24 kHz
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', OUT + 'taps.wav', '-ac', '1', '-c:a', 'libopus', '-b:a', '32k', OUT + 'taps.ogg'], check=True)
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', OUT + 'taps.wav', '-ac', '1', '-ar', '24000', '-c:a', 'libmp3lame', '-b:a', '48k', OUT + 'taps.mp3'], check=True)
