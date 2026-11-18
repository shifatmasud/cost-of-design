# Build the 3D tap sprite from Kenney "Impact Sounds" (CC0) recorded one-shots.
# These are the sounds for touching the 3D scenes: press, tap, grab, drag and let go.
# Also the hover air push and the slide brush, from Kenney "RPG Audio" (CC0) cloth and page recordings.
# Source wavs: the Kenney .ogg files decoded with ffmpeg to mono 48 kHz wav.
import numpy as np, scipy.io.wavfile as w, scipy.signal as sg, json, subprocess, os
SR = 48000; SRC = '/tmp/kimp/wav/'; SRC2 = '/tmp/krpg/wav/'; OUT = '/home/sprite/work/taps/'
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
# ---- soft sounds: hover air push (11 to 13) and slide brush (14 to 16) ----
# Real cloth and paper recordings, made smooth: band-limited (no hiss), pitched down for warmth, the crinkle partly
# evened out (divided by its own envelope to a power), then a smooth raised-cosine envelope. No click, no tone.
# name, source, use, start s, take s, resample rate (<1 = lower and longer), low-pass Hz, flatten power, out ms, attack share, level dB
SOFT = [
  ('hover-1', 'cloth1',             'hover', 0.080, 0.215, 0.85, 3000, 0.75, 270, 0.32, -25),
  ('hover-2', 'cloth2',             'hover', 0.085, 0.200, 0.83, 3000, 0.75, 255, 0.30, -25),
  ('hover-3', 'cloth3',             'hover', 0.040, 0.225, 0.87, 3000, 0.75, 275, 0.34, -25),
  ('brush-1', 'cloth4',             'brush', 0.060, 0.090, 0.92, 3800, 0.45,  85, 0.18, -24),
  ('brush-2', 'handleSmallLeather2','brush', 0.095, 0.085, 0.90, 3800, 0.45,  80, 0.18, -24),
  ('brush-3', 'handleSmallLeather', 'brush', 0.065, 0.085, 0.92, 3800, 0.45,  80, 0.18, -24),
]
hp2 = lambda f: sg.butter(2, f, 'highpass', fs=SR, output='sos')
lp6 = lambda f: sg.butter(6, f, 'lowpass', fs=SR, output='sos')
sprite = np.concatenate([sprite, np.zeros(int(SR * SLOT * len(SOFT)))])
for j, (name, src, use, st, tk, rr, lpf, fp, oms, att, tgt) in enumerate(SOFT):
    i = len(V) + j
    sr, x = w.read(SRC2 + src + '.wav'); x = x.astype(float) / 32768
    if x.ndim > 1: x = x.mean(1)
    x = sg.sosfiltfilt(lp6(lpf + 1500), sg.sosfiltfilt(hp2(180 if use == 'hover' else 200), x))
    x = x[int(st * SR):int((st + tk) * SR)]
    # pitch down by resampling (a slower, darker air), then band-limit again
    x = sg.resample(x, int(len(x) / rr))
    x = sg.sosfiltfilt(lp6(lpf), x)
    # even out the crinkle: divide by the envelope to a power (1 = flat noise, 0 = as recorded)
    env = np.sqrt(np.convolve(x * x, np.hanning(int(0.02 * SR)) / (0.01 * SR), 'same')) + 1e-4
    x = x / env ** fp
    x = sg.sosfiltfilt(lp6(lpf), x)
    n = min(len(x), int(oms / 1000 * SR)); x = x[:n].copy()
    a = int(n * att)
    e = np.ones(n); e[:a] = 0.5 * (1 - np.cos(np.linspace(0, np.pi, a)))
    e[a:] = (0.5 * (1 + np.cos(np.linspace(0, np.pi, n - a)))) ** 1.3
    x *= e; x -= np.linspace(x[0], x[-1], n)  # exact zero at both ends
    spk = sg.sosfilt(sg.butter(2, 350, 'highpass', fs=SR, output='sos'), x)
    win = spk[max(0, a - int(0.03 * SR)):a + int(0.06 * SR)]
    x *= 10 ** (tgt / 20) / np.sqrt(np.mean(win ** 2))
    if np.abs(x).max() > 0.89: x *= 0.89 / np.abs(x).max()
    s0 = int(SR * (i * SLOT + PAD)); sprite[s0:s0 + n] = x
    w.write(OUT + 'v_' + name + '.wav', SR, (x * 32767).astype(np.int16))
    X = np.abs(np.fft.rfft(x * np.hanning(n), 8192)); fr = np.fft.rfftfreq(8192, 1 / SR)
    hi = 10 * np.log10((X[fr > 5000] ** 2).sum() / (X ** 2).sum())
    man.append({'name': name, 'use': use, 'dur': round(n / SR, 3), 'src': 'RPG Audio/' + src + '.ogg', 'cent': int((X * fr).sum() / X.sum()), 'above5k_dB': float(round(hi, 1))})
w.write(OUT + 'taps.wav', SR, (sprite * 32767).astype(np.int16))
json.dump(man, open(OUT + 'manifest.json', 'w'), indent=1)
for m in man: print(m)
# encode: Opus 32 kbps, MP3 48 kbps at 24 kHz
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', OUT + 'taps.wav', '-ac', '1', '-c:a', 'libopus', '-b:a', '32k', OUT + 'taps.ogg'], check=True)
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', OUT + 'taps.wav', '-ac', '1', '-ar', '24000', '-c:a', 'libmp3lame', '-b:a', '48k', OUT + 'taps.mp3'], check=True)
