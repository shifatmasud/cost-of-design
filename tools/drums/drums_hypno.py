# Drum stems v7 for The Cost of Design: a calm, hypnotic groove (Shifat: "Drum rythm feels wrong. Make it hypnotic rythm calm").
# One 1-bar pattern that repeats exactly for all 18 bars (70 BPM, 44.1 kHz, seamless loop). No fills, no alternating
# bars, no random ghosts. Only tiny human variation: each stroke is a fresh take of the same sound, +-3% level, +-1 ms.
# - kick (only in the drop, 03): soft, short, on 1 and 3, the same every bar. The pump is keyed by it.
# - perc: soft snaps on 2 and 4 (small room), a steady 16th shaker that breathes (soft, soft, LOUD, soft on every beat,
#   very light swing, low level), and a muted low wood ostinato in 3-3-2 (real CC0 Kenney wood knocks, pitched down,
#   low-passed, very low in the mix).
# Writes kick.wav/perc.wav, bgm-kick.ogg/.mp3, bgm-perc.ogg/.mp3 and hits.json (pump keyed by the kick).
import numpy as np, scipy.fft as sfft, wave, json, subprocess, os, sys
sys.path.insert(0, '/home/sprite/work/ambient')
from lib import fftfilt, snap
from scipy.signal import resample_poly

SR = 44100; BEAT = 60 / 70; BARS = 18
L = int(round(BARS * 4 * BEAT * SR))
rng = np.random.default_rng(707)
S16 = BEAT / 4 * SR               # one 16th
SW16 = 0.07 * S16                 # very light swing on the odd 16ths (~15 ms)
LAID = 0.012 * SR                 # snaps, shaker and wood sit 12 ms behind the beat

def put(buf, start, sig, gain=1.0):
    n = len(sig); s = int(round(start)) % L; e = s + n
    if e <= L: buf[s:e] += sig * gain
    else:
        k = L - s; buf[s:] += sig[:k] * gain; buf[:n - k] += sig[k:] * gain

lp = lambda x, fc, o=4: fftfilt(x, lambda f: 1 / np.sqrt(1 + (f / fc) ** o))
hum = lambda: SR * rng.normal(0, 0.001)          # +-1 ms
vh = lambda: rng.uniform(0.97, 1.03)             # +-3% level

def kick(seed, vel):                # soft and short: less click, shorter body than v6
    r = np.random.default_rng(seed); n = int(0.22 * SR); t = np.arange(n) / SR
    f = 54 + 105 * np.exp(-t / 0.012) + 14 * np.exp(-t / 0.06)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t / 0.065) + 0.1 * np.sin(2 * ph) * np.exp(-t / 0.03)
    body = np.tanh(1.5 * body) / np.tanh(1.5)
    nz = r.normal(0, 1, n)
    click = fftfilt(nz, lambda fr: np.exp(-0.5 * ((fr - 2600) / 800) ** 2)) * np.exp(-t / 0.0028)
    click = click / (np.std(click[:120]) + 1e-9) * 0.16
    thump = fftfilt(nz, lambda fr: np.exp(-0.5 * ((fr - 850) / 380) ** 2)) * np.exp(-t / 0.006)
    thump = thump / (np.std(thump[:200]) + 1e-9) * 0.1
    s = (body + click + thump) * np.minimum(1, t / 0.0006) * np.clip((0.22 - t) / 0.05, 0, 1)
    return s * vel

def snp(seed, vel):                 # rounded attack: a 5 ms fade-in on the snap
    x = lp(snap(seed), 2000, 2); n = int(0.005 * SR); x[:n] *= np.linspace(0, 1, n) ** 1.5
    return x * vel

def stroke(seed, vel, kind):
    # one shaker stroke: a band of noise centred 2.3-3 kHz with a steep top (no hiss). push = the accent, soft swell;
    # pull = shorter and darker. Same shape every time, only the beads differ a little.
    r = np.random.default_rng(seed); n = int(0.14 * SR); t = np.arange(n) / SR
    fc = {'push': 2900, 'pull': 2400}[kind] * r.uniform(0.96, 1.04)
    bw = fc * 0.5
    nz = fftfilt(r.normal(0, 1, n), lambda f: np.exp(-0.5 * ((f - fc) / bw) ** 2) / np.sqrt(1 + (f / 4000) ** 8))
    a, d = {'push': (0.02, 0.04), 'pull': (0.012, 0.026)}[kind]
    env = np.where(t < a, (t / a) ** 1.5, np.exp(-(t - a) / d))
    g = fftfilt(r.normal(0, 1, n), lambda f: np.exp(-0.5 * (f / 120) ** 2))
    grit = np.clip(1 + 0.2 * g / (np.std(g) + 1e-12), 0.6, 1.4)
    return nz / np.std(nz) * env * grit * vel

# muted low wood: real CC0 knocks (Kenney Impact Sounds, already processed for the page), pitched down and low-passed
IMP = '/home/sprite/work/impacts'
def wav(p):
    with wave.open(p) as w: return np.frombuffer(w.readframes(w.getnframes()), '<i2').astype(float) / 32768
def wood(name, down):
    x = wav(f'{IMP}/v_{name}.wav')                     # 48 kHz; play it at SR*down to pitch it down
    y = resample_poly(x, 441 * 100, int(round(480 * 100 * down)))
    y = lp(y, 1100, 4); y = y / np.max(np.abs(y))
    n = len(y); y *= np.clip((n - np.arange(n)) / (0.02 * SR), 0, 1)
    return y
WOOD = [wood('solid-1', 0.80), wood('wood-1', 0.62), wood('wood-1', 0.66)]

bus = {k: np.zeros(L) for k in ('kick', 'snap', 'shaker', 'wood')}
HITS = []; sd = 1300
# shaker: every beat breathes the same way: step 0 soft, 1 softer, 2 (the 'and') accent, 3 a soft pull after it
SHAKE = [(0, 0.20, 'pull'), (1, 0.13, 'pull'), (2, 0.42, 'push'), (3, 0.22, 'pull')]
# wood 3-3-2 on 8ths: steps 0, 6, 12 of the bar (16ths), first one a little stronger
OST = [(0, 0.5, 0), (6, 0.36, 1), (12, 0.4, 2)]
for b in range(BARS):
    b0 = b * 16 * S16
    for bt in (0, 2):                                         # kick on 1 and 3
        sd += 1; v = 0.75 * rng.uniform(0.98, 1.02); th = b0 + bt * 4 * S16 + SR * rng.normal(0, 0.0005)
        put(bus['kick'], th, kick(sd, v)); HITS.append((th / SR, 0.9))
    for bt in (1, 3):                                         # snaps on 2 and 4
        sd += 1; put(bus['snap'], b0 + bt * 4 * S16 + LAID + hum(), snp(sd, 0.4 * vh()))
    for beat in range(4):
        for st, v, kind in SHAKE:
            sd += 1; s16 = beat * 4 + st
            put(bus['shaker'], b0 + s16 * S16 + (s16 % 2) * SW16 + LAID + hum(), stroke(sd, v * vh(), kind))
    for st, v, k in OST:
        put(bus['wood'], b0 + st * S16 + LAID + hum(), WOOD[k] * v * vh())

K_ = bus['kick'] / np.max(np.abs(bus['kick'])) * 0.8
S_ = bus['snap'] / np.max(np.abs(bus['snap'])) * 0.42 / 0.8
H_ = bus['shaker'] / np.max(np.abs(bus['shaker']))
W_ = bus['wood'] / np.max(np.abs(bus['wood']))

# small room (same as before): RT60 ~0.45 s, 8 ms pre-delay, wraps around the loop
room_rng = np.random.default_rng(303)
ni = int(0.6 * SR); ti = np.arange(ni) / SR
ir = room_rng.normal(0, 1, ni) * np.exp(-ti / 0.065) * np.minimum(1, ti / 0.003)
ir = fftfilt(ir, lambda f: 1 / np.sqrt(1 + (f / 3500) ** 2))
ir = np.concatenate([np.zeros(int(0.008 * SR)), ir])[:ni]
irp = np.zeros(L); irp[:ni] = ir; IRF = sfft.rfft(irp)
def room(x, wet):
    w = sfft.irfft(sfft.rfft(x) * IRF, L)
    return x + wet * w * np.sqrt(np.mean(x ** 2)) / (np.sqrt(np.mean(w ** 2)) + 1e-12)

freq = np.fft.rfftfreq(L, 1 / SR); fm = np.maximum(freq, 1)
hicut = 1 / np.sqrt(1 + (fm / 6500) ** 2) / np.sqrt(1 + (fm / 4200) ** 2) / np.sqrt(1 + (fm / 8000) ** 4) / np.sqrt(1 + (35 / fm) ** 4)
soft = 1 / np.sqrt(1 + (fm / 1900) ** 2)
F = lambda x: sfft.irfft(sfft.rfft(x) * hicut * soft, L)
def lv(x):
    b = x[: len(x) // 4410 * 4410].reshape(-1, 4410); r = np.sqrt((b ** 2).mean(1)); r = np.sort(r)[len(r) // 2:]
    return 20 * np.log10(np.sqrt((r ** 2).mean()) + 1e-12)
sn = F(0.42 * room(S_, 0.3)); sh = F(room(H_, 0.18)); wd = F(room(W_, 0.25))
SHK_DB = float(os.environ.get('SHK_DB', '-8')); WOOD_DB = float(os.environ.get('WOOD_DB', '-11'))
sh *= 10 ** ((lv(sn) + SHK_DB - lv(sh)) / 20); wd *= 10 ** ((lv(sn) + WOOD_DB - lv(wd)) / 20)
kick_d = sfft.irfft(sfft.rfft(K_) * hicut, L)
perc_d = sn + sh + wd

def write(name, x, peak, br):
    x = x * peak / np.max(np.abs(x))
    with wave.open(f'{name}.wav', 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(x, -1, 1) * 32767).astype('<i2').tobytes())
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', f'{name}.wav', '-c:a', 'libopus', '-b:a', br, '-vbr', 'constrained', '-cutoff', '8000', '-application', 'audio', f'bgm-{name}.ogg'], check=True)
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', f'{name}.wav', '-ar', '24000', '-c:a', 'libmp3lame', '-b:a', '24k', f'bgm-{name}.mp3'], check=True)
write('kick', kick_d, 0.2, '10k'); write('perc', perc_d, 0.2, '12k')
print('shaker vs snaps dB', round(lv(sh) - lv(sn), 1), 'wood vs snaps dB', round(lv(wd) - lv(sn), 1))
LOOPS = L / SR
json.dump(sorted([(round(t % LOOPS, 3), w) for t, w in HITS]), open('hits.json', 'w'))
print('kick hits', len(HITS), {f: os.path.getsize(f) for f in ('bgm-kick.ogg', 'bgm-perc.ogg', 'bgm-kick.mp3', 'bgm-perc.mp3')})
