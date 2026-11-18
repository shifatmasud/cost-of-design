// Sound: tiny UI sounds, all made live with the Web Audio API, plus distant ambient background music in six synced
// stems (media/bgm-*.ogg, mp3 fallback) that follows the section in view.
// The page's own idea, applied to sound: every sound has a cost, so each one is short, quiet and warm.
// - One shared AudioContext. Sound is ON by default; a visitor's own "off" is saved in localStorage.
// - Browsers block audio until a real gesture, so the context unlocks on the first tap, click or key anywhere,
//   and that first interaction plays its own sound right away.
// - Low master volume, a soft limiter, a little random pitch on every sound, throttles and a voice cap so fast repeats never stack.
// - Muted while the tab is hidden. With reduced motion, the scroll-driven sounds are dropped.
// - Background music: airy pads, a soft girl choir (bed and melody), vocal chops, an ambient drum groove (frame drum, finger
//   snaps, shaker, soft kick) and a warm reese bass, all far back in a long dark hall with the highs rolled off. Rendered
//   offline as six same-length stems (70 BPM, 18 bars, seamless). The drums gently pump the bass, pads and choir. Loaded only
//   after sound unlocks, kept well under the UI sounds, ducks a little when a UI sound plays, fades with the wave button,
//   pauses with the tab.
// The toggle is the Shade Verse title-screen sound button (shade-verse src/title/TitleButton.tsx, variant 'quiet'):
// one thin wave line, a gentle sine drifts when on and eases flat when off, with the same ink press (ink-button.js, kind 'sound').
import { bindInk } from './ink-button.js';

const KEY = 'cod-muted';
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
let muted = false;
try { muted = localStorage.getItem(KEY) === '1'; } catch (_) {}

// ---------- engine ----------
const AC = window.AudioContext || window.webkitAudioContext;
let ctx = null, out = null, noiseBuf = null, voices = 0, gesture = false, gestureT = 0;
const MASTER = 0.5, MAX_VOICES = 8;    // UI sound level (the music has its own gain)

function build() {
  if (ctx || !AC) return;
  // 24 kHz is plenty here (the UI sounds are low-passed at 6.5 kHz, the music is rolled off from about 4 kHz) and halves the decoded music's memory
  try { ctx = new AC({ latencyHint: 'interactive', sampleRate: 24000 }); } catch (_) { try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { try { ctx = new AC(); } catch (e2) { ctx = null; return; } } }
  const lim = ctx.createDynamicsCompressor();
  lim.threshold.value = -18; lim.knee.value = 12; lim.ratio.value = 6; lim.attack.value = 0.003; lim.release.value = 0.15;
  const warm = ctx.createBiquadFilter(); warm.type = 'lowpass'; warm.frequency.value = 6500; warm.Q.value = 0.4;
  out = ctx.createGain(); out.gain.value = muted ? 0 : MASTER;
  out.connect(warm); warm.connect(lim); lim.connect(ctx.destination);
  const n = Math.floor(ctx.sampleRate * 0.6); noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
}
// the first gesture: build the context and resume it; try again on each gesture until it runs
function unlock() {
  gesture = true; gestureT = performance.now();
  setTimeout(() => { gesture = false; }, 0);
  if (document.hidden) return;
  build();
  if (ctx && ctx.state !== 'running') { const p = ctx.resume(); if (p && p.then) p.then(music, () => {}); }
  else if (ctx && !mus) music();
}
['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'].forEach((t) => document.addEventListener(t, unlock, { capture: true, passive: true }));
document.addEventListener('visibilitychange', () => {
  if (!ctx) return;
  if (document.hidden) ctx.suspend().catch(() => {});
  else ctx.resume().then(() => { if (!mus) music(); }, () => {});
});

// ---------- background music: six synced stems that follow the section in view ----------
// Ambient, 70 BPM, 18 bars (61.7 s), seamless. Stems: airy pads, choir bed, choir melody, vocal chops, ambient drums
// (frame drum, snaps, shaker, soft kick; the loop has its own groove section in bars 5-11) and a reese bass. All six start
// on one AudioContext clock at the same time, so they stay locked. An IntersectionObserver picks the section in the middle
// of the screen, and each stem's volume and one soft low-pass glide there over about 3 s. No scroll handler.
// Sidechain pump: a duck curve made once from the drum hit times (below) loops in sync with the stems and dips the bass,
// pads and choir on each kick and frame drum hit. Its depth follows the drum stem's level, so no drums means no pump.
// No per-frame work: after the start it all runs inside the audio engine.
const MUSIC = 0.043;           // quiet: well under the UI sounds
const LOOP = 18 * 4 * 60 / 70;
const STEMS = ['pads', 'choir', 'melody', 'chops', 'drums', 'bass'];
const DR = 4;                                       // index of the drum stem
// Small speakers. A phone or laptop speaker plays almost nothing under about 350 Hz. The drums (kick and frame drum, mostly
// 80-160 Hz) and the reese bass (low-passed at 520 Hz) live down there, so through a speaker they sat 21-40 dB under the
// pads and were never heard, and the chops sat 17-26 dB under. Each stem gets a fixed trim and voicing before the section
// gain, so the same mix carries on a speaker and stays mellow on headphones (measured offline on the stems):
// - drums: snap and frame-drum slap brought forward with two soft mid peaks, and a little warmth from the kick
// - bass: soft harmonics (300-1100 Hz) made from its own low end, so the ear hears the bass line on a small speaker
// - chops: +6 dB
const VOICE = {
  chops: { trim: 2 },
  drums: { trim: 1.7, eq: [[1800, 0.9, 12], [650, 1, 6]], warm: { split: 180, pre: 4, drive: 2, hp: 250, lp: 900, mix: 0.12 } },
  bass:  { trim: 0.8, warm: { split: 260, pre: 4, drive: 2, hp: 300, lp: 1100, mix: 1 } },
};
// per section: gain of each stem (1 = the full mix; pads, choir, melody, chops, drums, bass), and the low-pass cutoff in Hz
const MIX = {
  hero:   { g: [1, 0.75, 0, 0, 0.2, 0.35], lp: 2000 },      // pads, soft choir; the loop's own groove barely there
  rule:   { g: [1, 0.85, 0.12, 0.2, 0.4, 0.5], lp: 2300 },  // 01: one rule for every sense, a hint of drums and bass
  cost:   { g: [0.95, 0.6, 0, 0.35, 0.9, 0.75], lp: 2600 }, // 02: two kinds of cost, drum section, choir pulled back
  noise:  { g: [0.9, 0.5, 0, 0.5, 1, 0.85], lp: 2900 },     // 03: noise vs intent, the fullest drum section
  budget: { g: [1, 0.8, 1, 0.4, 0.5, 0.65], lp: 3200 },     // 04: budget, the choir melody lift, light drums under it
  close:  { g: [1, 1, 0.1, 0, 0.1, 0.4], lp: 2200 },        // spend with intent: back to pads and choir
  footer: { g: [0.9, 0, 0, 0, 0, 0.3], lp: 900 },           // dark footer: pads and a little bass, darker, soft swell
};
// sidechain: stem index -> duck depth at drum level 1 (gentle: about -5 dB bass, -3 dB pads, -1 dB choir at the deepest)
const PUMP = { 5: 0.45, 0: 0.28, 1: 0.1 };
// drum hits in the loop: [time s, weight] (kick and frame drum doum hits, from the same render as bgm-drums)
const HITS = [[3.433,0.6],[6.85,0.6],[10.286,0.6],[13.714,0.49],[13.716,0.6],[14.998,0.05],[15.426,0.1],[15.857,0.08],[16.719,0.05],[17.143,0.73],[17.146,0.6],[18.427,0.19],[18.85,0.39],[19.286,0.3],[20.144,0.19],[20.571,0.6],[20.571,0.94],[21.86,0.32],[22.29,0.63],[22.714,0.5],[23.566,0.32],[23.997,0.4],[24.0,1.0],[25.291,0.35],[25.714,0.7],[26.998,0.35],[27.42,0.6],[27.429,1.0],[28.706,0.35],[29.142,0.7],[29.571,0.55],[30.426,0.35],[30.852,0.6],[30.857,1.0],[32.14,0.35],[32.563,0.7],[33.0,0.55],[33.851,0.35],[34.285,0.6],[34.286,1.0],[35.576,0.35],[36.008,0.7],[36.429,0.55],[37.288,0.35],[37.713,0.6],[37.714,0.91],[39.001,0.3],[39.427,0.59],[39.857,0.47],[40.712,0.3],[41.143,0.6],[41.143,0.64],[42.434,0.14],[42.853,0.28],[43.286,0.22],[44.15,0.14],[44.571,0.46],[44.572,0.6],[46.28,0.07],[46.714,0.06],[48.003,0.6],[51.416,0.6],[54.848,0.6],[58.285,0.4],[61.714,0.6]];
function pumpBuffer() {
  // a small mono curve at a low rate (3 kHz is plenty for a gain curve): 0 at rest, down to -1 on a full hit.
  // Each hit dips in 30 ms and lets go over about 2/3 of a beat (time constant 0.2 s at 70 BPM).
  let sr = 3000, b;
  try { b = ctx.createBuffer(1, Math.round(LOOP * sr), sr); } catch (_) { sr = 22050; b = ctx.createBuffer(1, Math.round(LOOP * sr), sr); }
  const d = b.getChannelData(0), n = d.length;
  for (const [t0, w] of HITS) for (const sh of [-LOOP, 0, LOOP]) {
    const a = Math.max(0, Math.ceil((t0 + sh - 0.03) * sr)), z = Math.min(n, Math.floor((t0 + sh + 1.6) * sr));
    for (let i = a; i < z; i++) {
      const dt = i / sr - (t0 + sh), e = w * (dt < 0 ? (dt + 0.03) / 0.03 : Math.exp(-dt / 0.2));
      if (-e < d[i]) d[i] = -Math.min(e, 1);
    }
  }
  return b;
}
// a stem's fixed voicing: src -> trim -> mid peaks -> out, plus src -> low band -> soft clip -> 300 Hz-1 kHz band -> out
let shapeCurve = null;
function voice(name, out) {
  const v = VOICE[name];
  if (!v) return out;
  const inp = ctx.createGain(); inp.gain.value = v.trim;
  let last = inp;
  (v.eq || []).forEach(([f, q, db]) => {
    const p = ctx.createBiquadFilter(); p.type = 'peaking'; p.frequency.value = f; p.Q.value = q; p.gain.value = db;
    last.connect(p); last = p;
  });
  last.connect(out);
  if (v.warm) {
    const w = v.warm, split = ctx.createBiquadFilter(), pre = ctx.createGain(), sh = ctx.createWaveShaper(),
      hp = ctx.createBiquadFilter(), lp = ctx.createBiquadFilter(), mix = ctx.createGain(), tap = ctx.createGain();
    split.type = 'lowpass'; split.frequency.value = w.split; split.Q.value = 0;
    pre.gain.value = w.pre;
    if (!shapeCurve || shapeCurve.d !== w.drive) {
      const n = 1024, c = new Float32Array(n), k = Math.tanh(w.drive);
      for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(w.drive * x) / k; }
      shapeCurve = { c, d: w.drive };
    }
    sh.curve = shapeCurve.c;
    hp.type = 'highpass'; hp.frequency.value = w.hp; hp.Q.value = 0;
    lp.type = 'lowpass'; lp.frequency.value = w.lp; lp.Q.value = 0;
    mix.gain.value = w.mix * v.trim;
    tap.connect(split); split.connect(pre); pre.connect(sh); sh.connect(hp); hp.connect(lp); lp.connect(mix); mix.connect(out);
    tap.connect(inp);
    return tap;
  }
  return inp;
}
// ?audiodebug: a small readout of each stem (loaded, decoded, playing, gain, live level), to check on a real phone
const DEBUG = /[?&]audiodebug\b/.test(location.search);
const dbg = { stems: STEMS.map((n) => ({ n, st: 'waiting for first tap', kb: 0, dur: 0, ch: 0, ext: '', err: '' })), note: '' };
let mus = null, duckT = 0, scene = 'hero';
const musFade = (to, sec) => {
  if (!mus) return;
  const g = mus.gain.gain, t = ctx.currentTime;
  g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(to, t + sec);
};
const glide = (p, to, t, tc) => { p.cancelScheduledValues(t); p.setValueAtTime(p.value, t); p.setTargetAtTime(to, t, tc); };
function mixTo(name, now) {
  scene = name;
  if (!mus || !mus.ready) return;
  const m = MIX[name], t = ctx.currentTime, tc = now ? 0.01 : 0.9;    // 0.9 s time constant: settled in about 3 s
  mus.st.forEach((g, i) => glide(g.gain, m.g[i], t, tc));
  mus.amt.forEach(([i, a]) => glide(a.gain, PUMP[i] * m.g[DR], t, tc));   // pump depth follows the drum level
  glide(mus.lp.frequency, m.lp, t, now ? 0.01 : 1.1);
  if (name === 'footer' && !now) {                                   // a soft swell as the footer opens
    const p = mus.st[0].gain; p.cancelScheduledValues(t); p.setValueAtTime(p.value, t);
    p.setTargetAtTime(1.25, t, 0.8); p.setTargetAtTime(m.g[0], t + 3, 1.6);
  }
}
function music() {
  if (!ctx || muted || document.hidden || ctx.state !== 'running') return;
  if (mus) { musFade(MUSIC, 1.6); return; }
  mus = { gain: ctx.createGain(), duck: ctx.createGain(), lp: ctx.createBiquadFilter(), st: [], amt: [], ready: false };
  mus.lp.type = 'lowpass'; mus.lp.Q.value = 0.5; mus.lp.frequency.value = MIX[scene].lp;
  mus.gain.gain.value = 0; mus.lp.connect(mus.gain); mus.gain.connect(mus.duck); mus.duck.connect(ctx.destination);
  const opus = !!document.createElement('audio').canPlayType('audio/ogg; codecs="opus"');
  // fetch all six at once, then decode them one at a time (lower peak memory on a 1 GB phone)
  let chain = Promise.resolve();
  const load = (i, ext) => {
    const d = dbg.stems[i]; d.ext = ext; d.st = 'loading'; d.err = '';
    const got = fetch(`./media/bgm-${STEMS[i]}.${ext}`).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
      .then((b) => { d.kb = Math.round(b.byteLength / 1024); d.st = 'loaded'; return b; });
    const dec = chain.then(() => got).then((b) => new Promise((res, rej) => { d.st = 'decoding'; ctx.decodeAudioData(b, res, (e) => rej(e || new Error('decode failed'))); }))
      .then((buf) => { d.st = 'decoded'; d.dur = buf.duration; d.ch = buf.numberOfChannels; return buf; },
        (e) => { d.st = 'failed'; d.err = String((e && e.message) || e); throw e; });
    chain = dec.catch(() => {});
    return dec;
  };
  const all = (ext) => { chain = Promise.resolve(); return Promise.all(STEMS.map((n, i) => load(i, ext))); };
  let mp3 = !opus;
  (opus ? all('ogg').catch(() => { mp3 = true; return all('mp3'); }) : all('mp3')).then((bufs) => {
    // MP3 decoders may add a little silence at the start; the pads never go silent, so skip to their first sound
    let off = 0;
    if (mp3) for (let i = 0, d0 = bufs[0].getChannelData(0), lim = Math.min(d0.length, Math.floor(bufs[0].sampleRate * 0.25)); i < lim; i++) {
      if (Math.abs(d0[i]) > 1e-4) { off = i / bufs[0].sampleRate; break; }
    }
    const end = Math.min(off + LOOP, ...bufs.map((b) => b.duration)), when = ctx.currentTime + 0.12;
    const pump = ctx.createBufferSource(); pump.buffer = pumpBuffer(); pump.loop = true; pump.loopEnd = LOOP;
    mus.an = [];
    bufs.forEach((buf, i) => {
      const g = ctx.createGain(); g.gain.value = MIX[scene].g[i]; mus.st.push(g);
      if (PUMP[i]) {                       // stem -> voicing -> pump gain (1 + depth * curve) -> section gain
        const pg = ctx.createGain(), amt = ctx.createGain(); pg.gain.value = 1;
        amt.gain.value = PUMP[i] * MIX[scene].g[DR]; pump.connect(amt); amt.connect(pg.gain); mus.amt.push([i, amt]);
        pg.connect(g);
        g.connect(mus.lp);
        g.inp = pg;
      } else { g.connect(mus.lp); g.inp = g; }
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.loopStart = off; src.loopEnd = end;
      src.connect(voice(STEMS[i], g.inp)); src.start(when, off);
      if (DEBUG) { const a = ctx.createAnalyser(); a.fftSize = 512; g.connect(a); mus.an.push(a); }
      dbg.stems[i].st = 'playing';
    });
    pump.start(when, 0);
    mus.when = when; mus.mp3 = mp3;
    mus.ready = true; mixTo(scene, true);
    if (!muted) musFade(MUSIC, 3);
  }).catch((e) => { dbg.note = 'music failed: ' + String((e && e.message) || e); mus = null; });
}
if (DEBUG) {
  const box = document.createElement('pre'); box.id = 'audiodebug';
  box.style.cssText = 'position:fixed;left:6px;bottom:6px;z-index:2147483647;margin:0;padding:8px 10px;max-width:calc(100vw - 12px);' +
    'background:rgba(18,19,21,.88);color:#f5f3ef;font:11px/1.35 ui-monospace,Menlo,Consolas,monospace;border-radius:8px;pointer-events:none;white-space:pre';
  document.body.appendChild(box);
  const buf = new Float32Array(512);
  const level = (a) => { a.getFloatTimeDomainData(buf); let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i]; const r = Math.sqrt(s / buf.length); return r > 1e-6 ? (20 * Math.log10(r)).toFixed(0) + ' dB' : 'silent'; };
  const state = () => ({
    ctx: ctx ? ctx.state : 'none', sr: ctx ? ctx.sampleRate : 0, muted, scene, ready: !!(mus && mus.ready),
    music: mus ? +mus.gain.gain.value.toFixed(4) : 0, lp: mus ? Math.round(mus.lp.frequency.value) : 0, codec: mus && mus.ready ? (mus.mp3 ? 'mp3' : 'opus') : '',
    stems: dbg.stems.map((d, i) => ({ n: d.n, st: d.st, kb: d.kb, dur: +d.dur.toFixed(1), ch: d.ch, err: d.err,
      gain: mus && mus.ready ? +mus.st[i].gain.value.toFixed(3) : null,
      pump: mus && mus.ready && PUMP[i] ? mus.amt.find(([j]) => j === i)[1].gain.value.toFixed(2) : null,
      level: mus && mus.ready && mus.an[i] ? level(mus.an[i]) : '' })),
    note: dbg.note,
  });
  window.__audioState = state;
  const pad = (s, n) => (String(s) + ' '.repeat(n)).slice(0, n);
  setInterval(() => {
    const s = state();
    const head = `audio ${s.ctx} ${s.sr} Hz ${s.codec}${s.muted ? ' MUTED' : ''}\nsection ${s.scene}  music ${s.music}  lp ${s.lp} Hz\n` +
      pad('stem', 7) + pad('state', 10) + pad('kb', 5) + pad('gain', 6) + pad('pump', 5) + 'level';
    const rows = s.stems.map((d) => pad(d.n, 7) + pad(d.st, 10) + pad(d.kb || '', 5) + pad(d.gain == null ? '' : d.gain, 6) + pad(d.pump == null ? '' : d.pump, 5) + d.level + (d.err ? ' ' + d.err : ''));
    box.textContent = [head, ...rows, s.note].filter(Boolean).join('\n') + (s.ctx === 'none' ? '\ntap anywhere to start sound' : '');
  }, 250);
}
// a UI sound dips the music a little, then lets it back up
function duck() {
  if (!mus || !mus.ready || muted) return;
  const t = ctx.currentTime; if (t - duckT < 0.1) return; duckT = t;
  const g = mus.duck.gain; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(0.7, t + 0.05); g.setTargetAtTime(1, t + 0.15, 0.3);
}
// which section is in the middle of the screen (a thin band at the center; no scroll handler).
// The dark footer sits at the very bottom, so it counts once a third of it is open.
if (window.IntersectionObserver) {
  const secs = [...document.querySelectorAll('section')];
  const map = [[document.querySelector('.hero'), 'hero'], [secs[0], 'rule'], [secs[1], 'cost'], [secs[2], 'noise'],
    [secs[3], 'budget'], [document.querySelector('.close'), 'close']].filter(([el]) => el);
  const on = new Set(); let foot = false, mid = scene;
  const pick = () => { const n = foot ? 'footer' : mid; if (n !== scene) mixTo(n); };
  const o = new IntersectionObserver((es) => {
    es.forEach((e) => { const n = map.find(([el]) => el === e.target)[1]; e.isIntersecting ? on.add(n) : on.delete(n); });
    mid = map.map(([, n]) => n).filter((n) => on.has(n)).pop() || mid; pick();
  }, { rootMargin: '-45% 0px -45% 0px' });
  map.forEach(([el]) => o.observe(el));
  const fs = document.querySelector('.foot-space');
  if (fs) new IntersectionObserver((es) => { foot = es[es.length - 1].intersectionRatio >= 0.33; pick(); }, { threshold: [0, 0.33] }).observe(fs);
}

// a sound may start when the context runs, or inside the gesture that is unlocking it right now
const ready = () => !muted && ctx && !document.hidden && (ctx.state === 'running' || gesture || performance.now() - gestureT < 60);
const last = {};
const gate = (k, ms) => { const t = performance.now(); if (last[k] && t - last[k] < ms) return false; last[k] = t; return true; };
const vary = (f, amt = 0.04) => f * (1 + (Math.random() * 2 - 1) * amt);
const take = (dur) => { if (voices >= MAX_VOICES) return false; voices++; setTimeout(() => { voices--; }, (dur + 0.05) * 1000); return true; };

// a soft tone: sine or triangle with an exponential decay, optional pitch glide
function tone({ f = 600, f2 = 0, type = 'sine', g = 0.2, a = 0.004, dur = 0.08, at = 0, glide = 0 } = {}) {
  const t = ctx.currentTime + at, o = ctx.createOscillator(), v = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + (glide || dur));
  v.gain.setValueAtTime(0.0001, t); v.gain.exponentialRampToValueAtTime(g, t + a); v.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(v); v.connect(out); o.start(t); o.stop(t + dur + 0.02);
  if (g >= 0.045) duck();
  return o;
}
// a soft breath of filtered noise
function air({ f = 1200, f2 = 0, q = 1, type = 'bandpass', g = 0.1, a = 0.01, dur = 0.1, at = 0, peak = 0.5 } = {}) {
  const t = ctx.currentTime + at, s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), v = ctx.createGain();
  s.buffer = noiseBuf; s.playbackRate.value = vary(1, 0.1);
  fl.type = type; fl.Q.value = q; fl.frequency.setValueAtTime(f, t);
  if (f2) { fl.frequency.exponentialRampToValueAtTime(f2, t + dur * peak); fl.frequency.exponentialRampToValueAtTime(Math.max(80, f * 0.8), t + dur); }
  v.gain.setValueAtTime(0.0001, t); v.gain.exponentialRampToValueAtTime(g, t + Math.max(a, 0.002)); v.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl); fl.connect(v); v.connect(out); s.start(t, Math.random() * 0.3); s.stop(t + dur + 0.02);
  if (g >= 0.06) duck();
}

// pentatonic scale for letters: a soft, always-in-tune run
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19];
const note = (base, i) => base * Math.pow(2, PENTA[i % PENTA.length] / 12);

const S = {
  // hover: a tiny warm tick
  tick(level = 1) { if (!ready() || !gate('tick', 45) || !take(0.05)) return; tone({ f: vary(1900, 0.06), f2: 1500, g: 0.05 * level, dur: 0.035 }); air({ f: vary(3200), q: 2, g: 0.02 * level, dur: 0.02 }); },
  // a card or tile lifting: a low soft knock
  lift() { if (!ready() || !gate('lift', 120) || !take(0.12)) return; tone({ f: vary(420), f2: 520, type: 'triangle', g: 0.05, dur: 0.1, glide: 0.08 }); },
  // press: low muted thump
  thump() { if (!ready() || !gate('thump', 60) || !take(0.16)) return; tone({ f: vary(150), f2: 62, g: 0.32, a: 0.003, dur: 0.14, glide: 0.1 }); air({ f: 700, type: 'lowpass', q: 0.5, g: 0.05, dur: 0.04 }); },
  // tap: a light water-drop ripple
  ripple() { if (!ready() || !gate('ripple', 90) || !take(0.4)) return; const f = vary(520); tone({ f, f2: f * 1.9, g: 0.09, dur: 0.16, glide: 0.06 }); tone({ f: f * 1.5, f2: f * 2.4, g: 0.035, dur: 0.18, at: 0.09, glide: 0.06 }); tone({ f: f * 2, f2: f * 3, g: 0.015, dur: 0.18, at: 0.18, glide: 0.06 }); },
  // sound on: a gentle rising two-note; off: the same falling, quieter
  on() { if (!ctx || !take(0.35)) return; tone({ f: 660, g: 0.09, dur: 0.14 }); tone({ f: 990, g: 0.08, dur: 0.22, at: 0.085 }); },
  off() { if (!ctx || !take(0.3)) return; tone({ f: 740, g: 0.06, dur: 0.12 }); tone({ f: 494, g: 0.05, dur: 0.18, at: 0.08 }); },
  // soft airy whoosh (logo spin, page glide)
  whoosh(level = 1, dur = 0.55) { if (!ready() || !gate('whoosh', 250) || !take(dur)) return; air({ f: vary(380), f2: vary(1700), q: 0.9, g: 0.09 * level, a: dur * 0.35, dur }); },
  // a scrub grain: faint, its loudness follows the speed
  grain(speed) { if (!ready() || !gate('grain', 40) || !take(0.03)) return; const k = Math.min(1, speed / 25); air({ f: vary(2400 + 1600 * k, 0.15), q: 3, g: 0.012 + 0.03 * k, dur: 0.022 }); },
  // a rainbow letter: a tiny pitched pop
  pop(base, i, level = 1, at = 0) { if (!ready() || !take(0.12 + at)) return; const f = vary(note(base, i), 0.015); tone({ f: f * 0.8, f2: f, g: 0.07 * level, a: 0.003, dur: 0.09, glide: 0.025, at }); },
  // letter grab: a soft stretch, rising
  stretch() { if (!ready() || !gate('stretch', 80) || !take(0.2)) return; tone({ f: vary(240), f2: 380, type: 'triangle', g: 0.05, a: 0.02, dur: 0.18, glide: 0.16 }); },
  // letter drag: a faint creak while it moves
  creak(speed) { if (!ready() || !gate('creak', 110) || !take(0.08)) return; const k = Math.min(1, speed / 30); tone({ f: vary(300 + 160 * k, 0.08), type: 'triangle', g: 0.012 + 0.02 * k, a: 0.01, dur: 0.07 }); },
  // letter release: a springy wobble that settles
  spring() {
    if (!ready() || !gate('spring', 80) || !take(0.4)) return;
    const t = ctx.currentTime, o = ctx.createOscillator(), v = ctx.createGain(), base = vary(330), n = 40, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = i / (n - 1); c[i] = base * (1 + 0.28 * Math.sin(x * 26) * Math.exp(-x * 5)); }
    o.type = 'sine'; o.frequency.setValueCurveAtTime(c, t, 0.36);
    v.gain.setValueAtTime(0.0001, t); v.gain.exponentialRampToValueAtTime(0.08, t + 0.01); v.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);
    o.connect(v); v.connect(out); o.start(t); o.stop(t + 0.38);
  },
  // a physics cube landing: a soft wooden tock, louder when it hits harder, a few per second at most
  tock(speed, size = 0.45) { if (!ready() || !gate('tock', 170) || !take(0.09)) return; const k = Math.min(1, (speed - 1) / 5), f = vary(200 / size, 0.06); tone({ f, f2: f * 0.7, type: 'triangle', g: 0.012 + 0.045 * k, a: 0.002, dur: 0.07, glide: 0.05 }); air({ f: f * 3, q: 4, g: 0.004 + 0.01 * k, dur: 0.025 }); },
  // a 3D scene under the pointer: a soft round bloop
  hum() { if (!ready() || !gate('hum', 160) || !take(0.14)) return; const f = vary(330, 0.06); tone({ f, f2: f * 1.35, g: 0.045, a: 0.008, dur: 0.12, glide: 0.07 }); },
  // a finger or a held mouse sliding across a surface: a faint soft brush, louder when faster
  brush(speed) { if (!ready() || !gate('brush', 75) || !take(0.07)) return; const k = Math.min(1, speed / 30); air({ f: vary(1300 + 1300 * k, 0.12), q: 1.2, g: 0.008 + 0.022 * k, a: 0.012, dur: 0.065 }); },
  // a step on the budget meter
  step(f, g = 0.03, at = 0) { if (!ready() || !take(0.05 + at)) return; tone({ f: vary(f, 0.01), type: 'triangle', g, dur: 0.04, at }); },
  // a section coming in: barely there
  reveal() { if (!ready() || !gate('reveal', 300) || !take(0.3)) return; air({ f: vary(1800), f2: 2600, q: 0.7, g: 0.018, a: 0.08, dur: 0.28 }); },
  // the footer curtain: a low soft swell
  swell() { if (!ready() || !gate('swell', 2000) || !take(1.5)) return; tone({ f: 98, f2: 110, g: 0.07, a: 0.5, dur: 1.4, glide: 1.2 }); tone({ f: 147, f2: 165, g: 0.03, a: 0.6, dur: 1.3, glide: 1.2 }); air({ f: 300, f2: 700, type: 'lowpass', q: 0.5, g: 0.03, a: 0.5, dur: 1.2 }); },
  // the underline drawing in: a soft airy zip, rising
  zip() { if (!ready() || !gate('zip', 200) || !take(0.3)) return; air({ f: vary(900), f2: 3200, q: 2, g: 0.03, a: 0.08, dur: 0.28, peak: 0.85 }); },
  // the band slowing down: a low soft brake
  brake() { if (!ready() || !gate('brake', 600) || !take(0.4)) return; tone({ f: vary(260), f2: 150, type: 'triangle', g: 0.04, a: 0.02, dur: 0.35, glide: 0.3 }); },
  // a 3D toy pressed: a soft squish; tapped: a bouncy boop
  squish() { if (!ready() || !gate('squish', 70) || !take(0.12)) return; tone({ f: vary(300), f2: 180, g: 0.08, dur: 0.1, glide: 0.08 }); },
  boop() { if (!ready() || !gate('boop', 70) || !take(0.2)) return; const f = vary(360, 0.08); tone({ f, f2: f * 1.8, g: 0.09, dur: 0.14, glide: 0.05 }); tone({ f: f * 1.8, f2: f * 1.5, g: 0.03, dur: 0.12, at: 0.06 }); }
};
window.__sound = S;

// ---------- the sound button (Shade Verse title-screen wave toggle) ----------
const btn = document.getElementById('sound');
if (btn) {
  const MORPH_MS = 280;
  const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
  const W = 22, H = 14, dpr = Math.min(devicePixelRatio || 1, 2);
  const waves = [...btn.querySelectorAll('.snd-wave')].map((c) => {
    c.width = W * dpr; c.height = H * dpr; const g = c.getContext('2d'); g.scale(dpr, dpr);
    return { c, g, inv: c.hasAttribute('data-inv') };
  });
  let raf = 0, amp = muted ? 0 : 1, phase = 0, lastT = performance.now(), from = amp, to = amp, t0 = 0;
  const draw = (now) => {
    const dt = Math.min(0.05, Math.max(0, now - lastT) / 1000); lastT = now;
    const target = muted ? 0 : 1;
    if (target !== to) { from = amp; to = target; t0 = now; }
    const k = reduce ? 1 : Math.min(1, Math.max(0, now - t0) / MORPH_MS);
    amp = from + (to - from) * easeInOut(k);
    if (!reduce) phase += dt * 3.2;
    for (const w of waves) {
      const g = w.g; g.clearRect(0, 0, W, H); g.lineWidth = 1.4; g.lineCap = 'round'; g.lineJoin = 'round';
      g.strokeStyle = w.inv ? '#fafafa' : '#121315';
      g.beginPath();
      for (let x = 1; x <= W - 1; x += 0.5) { const env = Math.sin((Math.PI * (x - 1)) / (W - 2)); const y = H / 2 + Math.sin(x * 0.62 - phase) * 3 * amp * env; x === 1 ? g.moveTo(x, y) : g.lineTo(x, y); }
      g.stroke();
    }
    if (reduce || (target === 0 && k >= 1) || document.hidden) { raf = 0; return; }
    raf = requestAnimationFrame(draw);
  };
  const kick = () => { if (!raf) { lastT = performance.now(); raf = requestAnimationFrame(draw); } };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });
  kick();
  bindInk(btn, 'sound');
  const set = (m) => {
    muted = m;
    try { m ? localStorage.setItem(KEY, '1') : localStorage.removeItem(KEY); } catch (_) {}
    btn.setAttribute('aria-pressed', String(!m)); btn.setAttribute('aria-label', m ? 'Sound off' : 'Sound on');
    if (ctx && out) { const t = ctx.currentTime; out.gain.cancelScheduledValues(t); out.gain.setValueAtTime(out.gain.value, t); out.gain.linearRampToValueAtTime(m ? 0 : MASTER, t + (m ? 0.32 : 0.02)); }
    if (m) musFade(0, 0.7); else music();
    kick();
  };
  btn.setAttribute('aria-pressed', String(!muted)); btn.setAttribute('aria-label', muted ? 'Sound off' : 'Sound on');
  btn.addEventListener('click', () => { if (muted) { set(false); S.on(); } else { S.off(); set(true); } });
  btn.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') S.tick(0.8); });
  btn.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') S.tick(0.8); }, { passive: true });
}

// ---------- interactions ----------
const mouse = (e) => e.pointerType === 'mouse';
const hover = (el, fn) => el.addEventListener('pointerenter', (e) => { if (mouse(e)) fn(e); }, { passive: true });
const inside = (r, x, y) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
const P = { passive: true };
// drag across a surface (a held mouse, or a finger on touch where there is no hover): a faint brush
const brushOn = (el, lvl = 1) => {
  let lx = 0, ly = 0, lt = 0;
  const mv = (x, y) => { const t = performance.now(), v = Math.hypot(x - lx, y - ly) / Math.max(1, t - lt) * 16; lx = x; ly = y; lt = t; if (v > 1.5) S.brush(v * lvl); };
  el.addEventListener('pointermove', (e) => { if (!mouse(e)) return; if (e.buttons & 1) mv(e.clientX, e.clientY); else { lx = e.clientX; ly = e.clientY; lt = performance.now(); } }, P);
  el.addEventListener('touchstart', (e) => { const t = e.touches[0]; if (t) { lx = t.clientX; ly = t.clientY; lt = performance.now(); } }, P);
  el.addEventListener('touchmove', (e) => { const t = e.touches[0]; if (t) mv(t.clientX, t.clientY); }, P);
};
document.querySelectorAll('.pill, .tile, .card, .chips span, .meter.fit, .band').forEach((el) => brushOn(el, el.classList.contains('band') ? 0.8 : 1));

// "Read the idea": hover tick as the ink starts, low thump on press, ripple on tap, and a soft glide as the page scrolls
document.querySelectorAll('.pill--ink').forEach((el) => {
  hover(el, () => S.tick());
  el.addEventListener('pointerdown', (e) => { if (e.button === 0) S.thump(); }, { passive: true });
  el.addEventListener('keydown', (e) => { if (!e.repeat && (e.key === 'Enter' || e.key === ' ')) S.thump(); });
  el.addEventListener('click', () => { S.ripple(); if (!reduce) setTimeout(() => S.whoosh(0.6, 0.9), 160); });
});

// logos: tick on hover tilt, faint grain while scrubbing, whoosh on the click spin
document.querySelectorAll('.mark, .foot-mark').forEach((a) => {
  let down = null, moved = false, lx = 0, lt = 0, spinT = 0;
  hover(a, () => S.tick(0.8));
  a.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse' && e.button !== 0) return; if (!mouse(e)) S.tick(0.8); down = [e.clientX, e.clientY]; moved = false; lx = e.clientX; lt = performance.now(); }, { passive: true });
  a.addEventListener('pointermove', (e) => {
    if (!down) return;
    if (Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 8) moved = true;
    let cap = false; try { cap = a.hasPointerCapture(e.pointerId); } catch (_) {}
    if (cap) { const t = performance.now(), v = Math.abs(e.clientX - lx) / Math.max(1, t - lt) * 16; lx = e.clientX; lt = t; S.grain(v); }
  }, { passive: true });
  const up = () => { setTimeout(() => { down = null; }, 0); };
  a.addEventListener('pointerup', up, { passive: true }); a.addEventListener('pointercancel', up, { passive: true });
  a.addEventListener('click', (e) => {
    if (moved && e.detail) return; // a drag or a scrub, never a click
    if (e.defaultPrevented) { const t = performance.now(); if (t - spinT > 1500) { spinT = t; S.whoosh(1, 0.7); } }
    else S.tick();
  });
});

// links: a tick on hover; the footer name draws its underline with a soft zip
document.querySelectorAll('a').forEach((a) => {
  if (a.matches('.mark, .foot-mark, .pill--ink')) return;
  if (a.classList.contains('foot-name')) {
    hover(a, () => S.zip());
    a.addEventListener('pointerdown', (e) => { if (!mouse(e)) S.zip(); }, { passive: true });
  } else { hover(a, () => S.tick()); a.addEventListener('pointerdown', (e) => { if (!mouse(e)) S.tick(0.8); }, P); }
});
// keyboard focus: a quiet tick
document.addEventListener('focusin', (e) => { const t = e.target; if (t && t.matches && t.matches(':focus-visible')) S.tick(0.7); });

// 3D scenes: a soft squish on press, a bouncy boop on tap
document.querySelectorAll('[data-view]').forEach((el) => {
  let sx = 0, sy = 0, st = 0;
  const start = (x, y) => { sx = x; sy = y; st = performance.now(); S.squish(); };
  const end = (x, y) => { if (Math.hypot(x - sx, y - sy) < 8 && performance.now() - st < 450) S.boop(); };
  el.addEventListener('pointerdown', (e) => { if (mouse(e) && e.button === 0) start(e.clientX, e.clientY); }, { passive: true });
  el.addEventListener('pointerup', (e) => { if (mouse(e)) end(e.clientX, e.clientY); }, { passive: true });
  el.addEventListener('touchstart', (e) => { const t = e.touches[0]; sx = t.clientX; sy = t.clientY; st = performance.now(); }, { passive: true });
  el.addEventListener('touchend', (e) => { const t = e.changedTouches[0]; if (Math.hypot(t.clientX - sx, t.clientY - sy) < 10 && performance.now() - st < 450) { S.squish(); setTimeout(() => S.boop(), 40); } }, { passive: true });
  // hover: a soft bloop; grab a model: stretch, drag: creak, let go: springy wobble; slide across: brush
  hover(el, () => S.hum());
  let held = false, lx = 0, ly = 0, lt = 0;
  const view = () => (window.__views || []).find((v) => v.el === el);
  const mv = (x, y) => {
    const t = performance.now(), sp = Math.hypot(x - lx, y - ly) / Math.max(1, t - lt) * 16; lx = x; ly = y; lt = t;
    const v = view(), g = !!(v && v.inp.down && v.inp.grab);
    if (g && !held) { held = true; S.stretch(); }
    if (g) { if (sp > 1.5) S.creak(sp); } else if (sp > 1.5) S.brush(sp);
  };
  const release = () => { if (held) { held = false; S.spring(); } };
  el.addEventListener('pointermove', (e) => { if (!mouse(e)) return; if (e.buttons & 1) mv(e.clientX, e.clientY); else { lx = e.clientX; ly = e.clientY; lt = performance.now(); } }, P);
  el.addEventListener('touchstart', (e) => { const t = e.touches[0]; if (t) { lx = t.clientX; ly = t.clientY; lt = performance.now(); } }, P);
  el.addEventListener('touchmove', (e) => { const t = e.touches[0]; if (t) mv(t.clientX, t.clientY); }, P);
  ['pointerup', 'pointerleave', 'touchend', 'touchcancel'].forEach((ev) => el.addEventListener(ev, release, P));
});

// meters: a tick on hover, and on touch press
document.querySelectorAll('.meter').forEach((el) => { hover(el, () => S.tick(0.7)); el.addEventListener('pointerdown', (e) => { if (!mouse(e)) S.tick(0.7); }, P); });
// cards and tiles: a low soft knock as they lift (a tick with reduced motion); the same on touch press
document.querySelectorAll('.tile, .card').forEach((el) => {
  const f = () => (reduce ? S.tick(0.7) : S.lift());
  hover(el, f); el.addEventListener('touchstart', f, P);
});
// chips: tick on hover, thump on press
document.querySelectorAll('.chips span').forEach((el) => { hover(el, () => S.tick(0.8)); el.addEventListener('pointerdown', () => S.thump(), P); });
// band: a low brake as it slows under the pointer or finger
const band = document.querySelector('.band');
if (band) { hover(band, () => (reduce ? S.tick(0.7) : S.brake())); band.addEventListener('touchstart', () => (reduce ? S.tick(0.7) : S.brake()), P); }

if (!reduce) {

  // rainbow letters: pitched pops on hover bounce, a wave on tap, stretch on grab, creak on drag, springy release
  [['h1', 523.25], ['.close h2', 392]].forEach(([sel, base]) => {
    const title = document.querySelector(sel); if (!title) return;
    const letters = [...title.querySelectorAll('.pop b')]; if (!letters.length) return;
    const lt = letters.map(() => 0); let lastL = -1, sx = 0, sy = 0, st = 0, moved = false;
    const at = (x, y) => letters.findIndex((b) => inside(b.getBoundingClientRect(), x, y));
    const over = (x, y) => {
      const i = at(x, y);
      if (i >= 0 && i !== lastL && !letters[i]._drag) { const t = performance.now(); if (t - lt[i] >= 380) { lt[i] = t; S.pop(base, i); } }
      lastL = i;
    };
    const wave = () => { if (letters.some((b) => b._drag)) return; letters.forEach((_, i) => S.pop(base, i, 0.8, i * 0.06)); };
    title.addEventListener('pointermove', (e) => { if (mouse(e)) over(e.clientX, e.clientY); }, { passive: true });
    title.addEventListener('pointerleave', (e) => { if (mouse(e)) lastL = -1; }, { passive: true });
    title.addEventListener('pointerdown', (e) => { if (mouse(e)) { sx = e.clientX; sy = e.clientY; st = performance.now(); } }, { passive: true });
    title.addEventListener('pointerup', (e) => { if (mouse(e) && Math.hypot(e.clientX - sx, e.clientY - sy) < 6 && performance.now() - st < 500) wave(); }, { passive: true });
    title.addEventListener('touchstart', (e) => { const t = e.touches[0]; sx = t.clientX; sy = t.clientY; st = performance.now(); moved = false; over(sx, sy); }, { passive: true });
    title.addEventListener('touchmove', (e) => { const t = e.touches[0]; if (Math.hypot(t.clientX - sx, t.clientY - sy) > 10) moved = true; over(t.clientX, t.clientY); }, { passive: true });
    title.addEventListener('touchend', () => { if (!moved && performance.now() - st < 450) wave(); lastL = -1; }, { passive: true });
  });
  // drag: watch the 'held' class the page sets on a grabbed letter
  let heldN = 0, px = 0, py = 0, pt = 0;
  document.querySelectorAll('.pop b').forEach((b) => {
    let was = false;
    new MutationObserver(() => {
      const now = b.classList.contains('held');
      if (now && !was) { heldN++; S.stretch(); }
      if (!now && was) { heldN = Math.max(0, heldN - 1); S.spring(); }
      was = now;
    }).observe(b, { attributes: true, attributeFilter: ['class'] });
  });
  const drag = (x, y) => { if (!heldN) { px = x; py = y; pt = performance.now(); return; } const t = performance.now(), v = Math.hypot(x - px, y - py) / Math.max(1, t - pt) * 16; px = x; py = y; pt = t; if (v > 2) S.creak(v); };
  addEventListener('pointermove', (e) => drag(e.clientX, e.clientY), { passive: true });
  addEventListener('touchmove', (e) => { const t = e.touches[0]; if (t) drag(t.clientX, t.clientY); }, { passive: true });

  // Piled on meter: a soft step each time the number moves by 10 while you drag across it
  const over = document.querySelector('.meter.over');
  if (over) {
    const trk = over.querySelector('.trk'); let lastV = -1;
    const at = (x) => { const r = trk.getBoundingClientRect(); const v = Math.round(Math.min(1, Math.max(0.04, (x - r.left) / r.width)) * 12); if (v !== lastV) { if (lastV >= 0 && gate('meter', 45)) S.step(380 + v * 40, 0.025); lastV = v; } };
    over.addEventListener('pointermove', (e) => { if (mouse(e)) at(e.clientX); }, { passive: true });
    over.addEventListener('pointerleave', () => { lastV = -1; }, { passive: true });
    over.addEventListener('touchmove', (e) => { const t = e.touches[0]; if (inside(over.getBoundingClientRect(), t.clientX, t.clientY)) at(t.clientX); }, { passive: true });
    over.addEventListener('touchend', () => { lastV = -1; }, { passive: true });
  }

  // scroll-driven sounds (all dropped with reduced motion); they only play once sound has been unlocked
  if (window.IntersectionObserver) {
    const seen = new WeakSet();
    const io = (els, fn, opts) => { const o = new IntersectionObserver((es) => es.forEach((e) => fn(e, o)), opts); els.forEach((el) => o.observe(el)); };
    // section reveals: barely there, one at a time
    io([...document.querySelectorAll('.reveal')], (e, o) => { if (!e.isIntersecting || seen.has(e.target)) return; seen.add(e.target); o.unobserve(e.target); S.reveal(); }, { rootMargin: '0px 0px -8% 0px' });
    // budget bars filling: soft rising ticks that slow down with the fill
    io([...document.querySelectorAll('.meter')], (e, o) => {
      if (!e.isIntersecting) return; o.unobserve(e.target);
      const n = e.target.classList.contains('over') ? 9 : 6;
      for (let i = 0; i < n; i++) { const k = (i + 1) / n, at = 0.35 + 1.5 * (1 - Math.pow(1 - k, 0.45)) * 0.9; S.step(420 * Math.pow(2, (i * 2) / 12), 0.022, at); }
    }, { rootMargin: '0px 0px -10% 0px' });
    // "intent" scaling in: very faint pops, letter by letter
    const intent = document.querySelector('.close h2');
    if (intent) io([intent], (e, o) => { if (!e.isIntersecting || !ready()) return; o.unobserve(e.target); [...intent.querySelectorAll('.pop b')].forEach((_, i) => S.pop(392, i, 0.35, 1.1 + i * 0.085)); }, { rootMargin: '0px 0px -8% 0px' });
    // dark footer curtain: a low soft swell as it opens; again after it has closed
    const fs = document.querySelector('.foot-space');
    if (fs) { let open = false; io([fs], (e) => { if (e.intersectionRatio >= 0.35 && !open) { open = true; S.swell(); } else if (!e.isIntersecting) open = false; }, { threshold: [0, 0.35] }); }
  }
}
