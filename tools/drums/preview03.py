# 30 s preview of section 03 (the drop) in the full live mix: all seven stems, voicing, pump, section low-pass, as in
# sound.js. Louder than the page so it's easy to hear.
import os, json, sys, numpy as np, subprocess
sys.path.insert(0, '/home/sprite/work/drop')
os.environ['STEMDIR'] = '/home/sprite/work/hypno/media'; os.environ['HITSF'] = '/home/sprite/work/hypno/hits.json'
V = json.loads(open('/home/sprite/work/calm/env.sh').read().split("VOICE='")[1].rsplit("'", 1)[0]); V['bass']['warm'].update(drive=1.6, mix=0.7)
os.environ['VOICE'] = json.dumps(V)
import solve2 as S
SR = S.SR; MIX = json.load(open('/home/sprite/work/hypno/mix.json')); sec = MIX['noise']
START = float(os.environ.get('START', '0')); DUR = 30
i0 = int(START * SR); N = int(DUR * SR)
mus = np.zeros(N)
for i, n in enumerate(S.STEMS):
    g = sec['g'][i]
    if g == 0: continue
    y = S.stem_out(n, sec, g)
    mus += np.tile(y, 2)[i0:i0 + N]
out = mus * 0.043 * 10 ** (18 / 20)
t = np.arange(N); out *= np.minimum(1, t / (0.3 * SR)) * np.minimum(1, (N - t) / (1.5 * SR))
print('peak', round(float(np.abs(out).max()), 3))
raw = (np.clip(out, -1, 1) * 32767).astype('<i2').tobytes(); open('/tmp/p03.raw', 'wb').write(raw)
subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 's16le', '-ar', str(SR), '-ac', '1', '-i', '/tmp/p03.raw', '-ac', '2', '-c:a', 'libmp3lame', '-b:a', '128k', '/home/sprite/work/hypno/preview-03-drop.mp3'], check=True)
