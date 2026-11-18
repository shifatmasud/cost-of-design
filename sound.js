// Sound: tiny UI sounds, all made live with the Web Audio API, plus distant ambient background music in seven synced
// stems (media/bgm-*.ogg, mp3 fallback) that follows the section in view.
// The page's own idea, applied to sound: every sound has a cost, so each one is short, quiet and warm.
// - One shared AudioContext. Sound is ON by default; a visitor's own "off" is saved in localStorage.
// - Browsers block audio until a real gesture, so the context unlocks on the first tap, click or key anywhere,
//   and that first interaction plays its own sound right away.
// - Low master volume, a soft limiter, a little random pitch on every sound, throttles and a voice cap so fast repeats never stack.
// - Muted while the tab is hidden. With reduced motion, the scroll-driven sounds are dropped.
// - Background music: airy pads, a soft girl choir (bed and melody), vocal chops, a calm, hypnotic drum groove in two stems,
//   one bar repeated exactly (kick: soft, short, dry, on 1 and 3, only in the drop, section 03; perc: soft snaps on 2 and 4,
//   a steady breathing 16th shaker and a muted low wood 3-3-2 ostinato, in a small room) and a warm reese bass, the rest far
//   back in a long dark hall, highs rolled off. Mix order on a speaker: drums, bass, chops, choir, pads (quietest). Rendered
//   offline as seven same-length stems (70 BPM, 18 bars, seamless). The kick gently pumps the bass, pads and choir.
//   Each section change plays one soft, dark noise rise and fall; the new layers come in on its way down. Loaded only
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
  // the knock sounds: fetched once, after the hero intro (about 4 s in), or sooner on the first hit
  if (ctx && !impBufs && !impLoading && !impT) impT = setTimeout(() => loadImpacts(), Math.max(0, 4000 - performance.now()));
}
let impT = 0;
['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'].forEach((t) => document.addEventListener(t, unlock, { capture: true, passive: true }));
document.addEventListener('visibilitychange', () => {
  if (!ctx) return;
  if (document.hidden) ctx.suspend().catch(() => {});
  else ctx.resume().then(() => { if (!mus) music(); }, () => {});
});

// ---------- background music: seven synced stems that follow the section in view ----------
// Ambient, 70 BPM, 18 bars (61.7 s), seamless. Stems: airy pads and choir in a long dark hall, choir melody, vocal chops
// (every other 2 bars), kick (soft, on 1 and 3), perc (soft snaps on 2 and 4; a steady 16th shaker on every beat:
// soft, softer, accent on the 'and', soft pull, very lightly swung; a muted low wood ostinato in 3-3-2 from real CC0
// wood knocks, very low). One bar that repeats exactly: no fills, no alternating bars, no ghosts (hypnotic). A soft, round
// reese bass. All seven start
// on one AudioContext clock at the same time, so they stay locked. An IntersectionObserver picks the section in the middle
// of the screen. Section change: a soft noise rise plays first while the old mix stays; its peak lands on the beat, and
// there the stems and the low-pass glide to the new section (about 1.3 s) while the noise falls. No scroll handler.
// Sidechain pump: a duck curve made once from the kick hit times (below) loops in sync with the stems and dips the bass,
// pads and choir on each kick hit. Its depth moves with the kick stem, so it only pumps in the drop (03).
// No per-frame work: after the start it all runs inside the audio engine.
const MUSIC = 0.043;           // quiet: well under the UI sounds
const LOOP = 18 * 4 * 60 / 70;
const STEMS = ['pads', 'choir', 'melody', 'chops', 'kick', 'perc', 'bass'];
const KI = 4;                                       // index of the kick stem
const BEAT = 60 / 70;
// Small speakers. A phone or laptop speaker plays almost nothing under about 350 Hz. The drums (kick body, mostly
// 80-160 Hz) and the reese bass (low-passed at 520 Hz) live down there, so through a speaker they sat 21-40 dB under the
// pads and were never heard, and the chops sat 17-26 dB under. Each stem gets a fixed trim and voicing before the section
// gain, so the same mix carries on a speaker and stays mellow on headphones (measured offline on the stems):
// - drums: snap and kick click brought forward with two soft mid peaks, and a little warmth from the kick body
// - bass: soft harmonics (300-1100 Hz) made from its own low end, so the ear hears the bass line on a small speaker
// - chops: +6 dB
const VOICE = {
  chops: { trim: 1.31 },
  kick:  { trim: 7.05, eq: [[1800, 0.9, 12], [650, 1, 6]], shelf: [220, -9], warm: { split: 180, pre: 4, drive: 2, hp: 250, lp: 900, mix: 0.12 } },
  bass:  { trim: 1.08, shelf: [180, -6], warm: { split: 260, pre: 4, drive: 1.6, hp: 300, lp: 1100, mix: 0.7 } },   // softer, rounder overtones
};
VOICE.perc = VOICE.kick;                           // same voicing as the old single drum stem
// Mix order, as heard on a phone or laptop speaker (Shifat): drums loudest, then bass, then chops, then choir and choir
// melody, and the pads quietest, about 3 dB per step wherever the layers play. Done mostly by turning the pads and choir
// down. The low shelf on the drums and bass keeps headphones from getting boomy, so the total stays within about 3 dB
// of the old mix on both a speaker and headphones. The kick stem is dry, no reverb (its 2-4 kHz click skips the soft tone
// cut so it reads on phone speakers); the perc stem has only a short small room on the snaps and shaker. Nothing here
// adds reverb or a hall to either.
// per section: gain of each stem (pads, choir, melody, chops, kick, perc, bass), the low-pass cutoff in Hz, and p, the
// pump depth (1 in the drop only, where the kick plays). Calm ambient (Shifat): levels on a speaker, vs the loudest
// layer: perc and bass 0, chops -3, choir -6, pads -9 in the drum sections; the drums are 3 dB lower than before and the
// whole mix is about 2-4 dB quieter. In the drop the kick comes in 1.5 dB under the perc, a soft lift, not a slam.
const MIX = {
  hero:   { g: [0.293, 0.32, 0, 0, 0, 0, 2.047], lp: 2000, p: 0 },  // bass, then choir, then pads
  rule:   { g: [0.155, 0.169, 0.16, 1.2, 0, 0.178, 1.507], lp: 2300, p: 0 },  // 01: one rule for every sense, light perc
  cost:   { g: [0.144, 0.157, 0, 1.125, 0, 0.163, 1.392], lp: 2600, p: 0 },  // 02: two kinds of cost, perc
  noise:  { g: [0.137, 0.149, 0, 1.063, 0.693, 0.153, 1.334], lp: 2900, p: 1 },  // 03: noise vs intent, the drop: kick + pump
  budget: { g: [0.191, 0.199, 0.237, 1.515, 0, 0.217, 1.839], lp: 3200, p: 0 },  // 04: budget, brightest, perc
  close:  { g: [0.319, 0.348, 0.328, 0, 0, 0, 2.206], lp: 2200, p: 0 },  // spend with intent: bass, choir, pads
  footer: { g: [0.308, 0, 0, 0, 0, 0, 1.506], lp: 900, p: 0 },  // dark footer: bass over pads, soft swell
};
// sidechain: stem index -> duck depth at pump 1 (very gentle, half the old depth: about -2.2 dB bass, -1.3 dB pads,
// -0.4 dB choir at the deepest)
const PUMP = { 6: 0.225, 0: 0.14, 1: 0.05 };
// kick hits in the loop: [time s, weight] (from the same render as bgm-kick: 1 and 3, every bar the same)
const HITS = [[1.714,0.9],[3.428,0.9],[5.142,0.9],[6.857,0.9],[8.572,0.9],[10.286,0.9],[12.0,0.9],[13.714,0.9],[15.43,0.9],[17.143,0.9],[18.857,0.9],[20.571,0.9],[22.285,0.9],[23.999,0.9],[25.715,0.9],[27.428,0.9],[29.142,0.9],[30.857,0.9],[32.572,0.9],[34.285,0.9],[35.999,0.9],[37.714,0.9],[39.429,0.9],[41.143,0.9],[42.857,0.9],[44.572,0.9],[46.286,0.9],[48.0,0.9],[49.714,0.9],[51.428,0.9],[53.143,0.9],[54.857,0.9],[56.571,0.9],[58.286,0.9],[59.999,0.9],[61.713,0.9]];
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
  if (v.shelf) {                                   // low shelf: less boom on headphones, same on a small speaker
    const sf = ctx.createBiquadFilter(); sf.type = 'lowshelf'; sf.frequency.value = v.shelf[0]; sf.gain.value = v.shelf[1];
    last.connect(sf); last = sf;
  }
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
// glide a param: hold where it is now (t), then from `at` ease to `to` with time constant tc
const glide = (p, to, t, tc, at = t) => { p.cancelScheduledValues(t); p.setValueAtTime(p.value, t); p.setTargetAtTime(to, at, tc); };
// land a section's mix from `at`. 'fx': with the noise fall (tc 0.45 s, settled in about 1.3 s; the kick and the pump a
// bit faster, 0.3 s, so the drop lands clearly and leaves cleanly). 'slow': no sweep (sound off, tab hidden), old 3 s glide.
function land(name, t, at, mode) {
  const m = MIX[name], k = mode === 'now' ? 0.01 : mode === 'slow' ? 0.9 : 0.45, kk = mode === 'fx' ? 0.3 : k;
  mus.st.forEach((g, i) => glide(g.gain, m.g[i], t, i === KI ? kk : k, at));
  mus.amt.forEach(([i, a]) => glide(a.gain, PUMP[i] * m.p, t, kk, at));   // pump depth moves with the kick
  glide(mus.lp.frequency, m.lp, t, mode === 'now' ? 0.01 : mode === 'slow' ? 1.1 : 0.55, at);
  if (name === 'footer' && mode !== 'now') {                          // a soft swell as the footer opens
    const p = mus.st[0].gain; p.cancelScheduledValues(t); p.setValueAtTime(p.value, t);
    p.setTargetAtTime(m.g[0] * 1.25, at, 0.8); p.setTargetAtTime(m.g[0], at + 3, 1.6);   // +2 dB, stays under the bass
  }
}
// ---------- section transitions: one soft, dark noise rise and fall ----------
// Pink noise (stereo, each side its own, so it feels wide) -> band-pass sweeping up, then down -> two fixed low-passes at
// 1.8 kHz (steep: nothing bright, no hiss) -> 140 Hz high-pass -> soft swell and fade -> a little dark, airy room.
// The rise plays while the old mix stays as it is; the peak snaps to the next half beat; there the new layers come in
// while the noise falls. Three subtle variants take turns. It joins the music after the section filter and the pump, so it
// never pumps, and it rides the music fader, so the wave button and the hidden tab cover it too. Peak about the choir's
// level in the drum sections, about 3 dB below it. One sweep at a time: a change during the rise moves the landing to the newest
// section on the same peak; a change during the fall fades the old sweep in 0.25 s and starts a new one.
const FXV = [
  { lo: 260, hi: 1500, q: 0.8, down: 1.35, wet: 0.35, g: 0.176 },
  { lo: 220, hi: 1300, q: 0.65, down: 1.5, wet: 0.45, g: 0.143 },
  { lo: 300, hi: 1700, q: 1.0, down: 1.2, wet: 0.3, g: 0.211 },
];
const FX_RISE = 1.05;            // shortest rise; snapping to the next half beat makes it 1.05-1.48 s
let fx = null, fxN = 0, fxPink = null, fxBus = null, fxConv = null;
const fxLog = [];
const fxNote = (s) => { if (!DEBUG) return; fxLog.push(ctx.currentTime.toFixed(1) + 's ' + s); if (fxLog.length > 4) fxLog.shift(); };
function fxSetup() {
  if (fxBus) return;
  const sr = ctx.sampleRate, n = Math.round(sr * 2), m = Math.round(sr * 1.1), pre = 0.015;
  // 2 s of looping pink noise: the filter runs over the same white noise twice, so the loop point is seamless
  fxPink = ctx.createBuffer(2, n, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = fxPink.getChannelData(ch); let b0 = 0, b1 = 0, b2 = 0, s = 0;
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < n; i++) {
      const w = pass ? d[i] : d[i]; b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
      if (pass) { d[i] = b0 + b1 + b2 + w * 0.1848; s += d[i] * d[i]; }
    }
    const k = 0.25 / Math.sqrt(s / n); for (let i = 0; i < n; i++) d[i] *= k;
  }
  // a short, dark, airy room (1.1 s, 15 ms pre-delay)
  const ir = ctx.createBuffer(2, m, sr), a = Math.exp(-2 * Math.PI * 1200 / sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch); let y = 0, e = 0;
    for (let i = 0; i < m; i++) {
      const t = i / sr - pre, x = t < 0 ? 0 : (Math.random() * 2 - 1) * Math.exp(-t / 0.22) * Math.min(1, t / 0.02);
      y = (1 - a) * x + a * y; d[i] = y; e += y * y;
    }
    const k = 1 / Math.sqrt(e); for (let i = 0; i < m; i++) d[i] *= k;
  }
  fxConv = ctx.createConvolver(); fxConv.normalize = false; fxConv.buffer = ir; fxConv.connect(mus.gain);
  fxBus = ctx.createGain(); fxBus.connect(mus.gain);
}
// the swell and fade as one curve: eases up to g at the peak (smoothstep^1.5), then eases down to 0 (raised cosine^1.5)
function fxCurve(g, rise, down) {
  const n = 160, c = new Float32Array(n), T = rise + down;
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * T;
    if (t < rise) { const x = t / rise, s = x * x * (3 - 2 * x); c[i] = g * Math.pow(s, 1.5); }
    else c[i] = g * Math.pow(0.5 * (1 + Math.cos(Math.PI * Math.min(1, (t - rise) / down))), 1.5);
  }
  return c;
}
function fxStop(t) {
  if (!fx || t >= fx.end) return;
  const g = fx.env.gain;
  if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(t); else { const v = g.value; g.cancelScheduledValues(t); g.setValueAtTime(v, t); }
  g.setTargetAtTime(0, t, 0.08); fx.src.stop(t + 0.5); fx.end = t;
}
function fxStart(t, from, to) {
  fxSetup(); fxStop(t);
  const vi = fxN % FXV.length, v = FXV[vi], hb = BEAT / 2;
  const peak = mus.when + Math.ceil((t + FX_RISE - mus.when) / hb) * hb, rise = peak - t, end = peak + v.down;
  const src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), l1 = ctx.createBiquadFilter(), l2 = ctx.createBiquadFilter(),
    hp = ctx.createBiquadFilter(), env = ctx.createGain(), wet = ctx.createGain();
  src.buffer = fxPink; src.loop = true;
  bp.type = 'bandpass'; bp.Q.value = v.q;
  bp.frequency.setValueAtTime(v.lo, t); bp.frequency.exponentialRampToValueAtTime(v.hi, peak); bp.frequency.exponentialRampToValueAtTime(v.lo * 0.85, end);
  l1.type = 'lowpass'; l2.type = 'lowpass'; l1.frequency.value = l2.frequency.value = 1800; l1.Q.value = l2.Q.value = -3;
  hp.type = 'highpass'; hp.frequency.value = 140; hp.Q.value = -3;
  env.gain.value = 0; env.gain.setValueCurveAtTime(fxCurve(v.g, rise, v.down), t, rise + v.down);
  wet.gain.value = v.wet;
  src.connect(bp); bp.connect(l1); l1.connect(l2); l2.connect(hp); hp.connect(env); env.connect(fxBus); env.connect(wet); wet.connect(fxConv);
  src.start(t, Math.random() * 2); src.stop(end + 0.05);
  const me = { n: ++fxN, start: t, peak, end, src, env };
  src.onended = () => { [src, bp, l1, l2, hp, env, wet].forEach((x) => x.disconnect()); if (fx === me) fx = null; };
  fx = me;
  fxNote(`#${me.n} v${vi + 1} ${from} > ${to}  rise ${rise.toFixed(2)}s down ${v.down}s`);
  return peak;
}
function mixTo(name, now) {
  const from = scene; scene = name;
  if (!mus || !mus.ready) return;                                     // nothing before the first tap
  const t = ctx.currentTime;
  if (now) return land(name, t, t, 'now');
  if (muted || ctx.state !== 'running') { fxStop(t); return land(name, t, t, 'slow'); }
  if (fx && t < fx.peak - 0.08) { land(name, t, fx.peak, 'fx'); fxNote(`#${fx.n} still rising: lands on ${name}`); return; }
  land(name, t, fxStart(t, from, name), 'fx');
}
let musWait = false;
function music() {
  if (!ctx || muted || document.hidden || ctx.state !== 'running') return;
  if (mus) { musFade(MUSIC, 1.6); return; }
  // the stems' fetch and decode wait until the hero intro has landed, so they never compete with it on the main thread
  if (window.__introDone && !window.__introIsDone) { if (!musWait) { musWait = true; window.__introDone.then(() => { musWait = false; music(); }); } return; }
  mus = { gain: ctx.createGain(), duck: ctx.createGain(), lp: ctx.createBiquadFilter(), st: [], amt: [], ready: false };
  mus.lp.type = 'lowpass'; mus.lp.Q.value = 0.5; mus.lp.frequency.value = MIX[scene].lp;
  mus.gain.gain.value = 0; mus.lp.connect(mus.gain); mus.gain.connect(mus.duck); mus.duck.connect(ctx.destination);
  const opus = !!document.createElement('audio').canPlayType('audio/ogg; codecs="opus"');
  // fetch all seven at once, then decode them one at a time (lower peak memory on a 1 GB phone)
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
        amt.gain.value = PUMP[i] * MIX[scene].p; pump.connect(amt); amt.connect(pg.gain); mus.amt.push([i, amt]);
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
    fx: { now: !fx || !ctx ? 'idle' : ctx.currentTime < fx.peak ? 'rising' : ctx.currentTime < fx.end ? 'falling' : 'idle', log: fxLog.slice() },
  });
  window.__audioState = state;
  const pad = (s, n) => (String(s) + ' '.repeat(n)).slice(0, n);
  setInterval(() => {
    const s = state();
    const head = `audio ${s.ctx} ${s.sr} Hz ${s.codec}${s.muted ? ' MUTED' : ''}\nsection ${s.scene}  music ${s.music}  lp ${s.lp} Hz\n` +
      pad('stem', 7) + pad('state', 10) + pad('kb', 5) + pad('gain', 6) + pad('pump', 5) + 'level';
    const rows = s.stems.map((d) => pad(d.n, 7) + pad(d.st, 10) + pad(d.kb || '', 5) + pad(d.gain == null ? '' : d.gain, 6) + pad(d.pump == null ? '' : d.pump, 5) + d.level + (d.err ? ' ' + d.err : ''));
    const fxl = ['fx ' + s.fx.now + ' (section sweeps)', ...s.fx.log.map((l) => '  ' + l)];
    box.textContent = [head, ...rows, ...fxl, s.note].filter(Boolean).join('\n') + (s.ctx === 'none' ? '\ntap anywhere to start sound' : '');
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

// ---------- collision impacts: real recorded knocks, no synth ----------
// Ten short one-shots cut from Kenney "Impact Sounds" (CC0, recorded foley; see media/IMPACTS.md): small wooden knocks,
// a wood block, a ceramic plate tap, a light plastic knock and one deeper solid wood knock. Trimmed tight, no reverb,
// high-passed and low-passed at 5.5 kHz, levelled for a phone speaker. One tiny sprite, media/impacts.ogg (Opus, 14 KB)
// or impacts.mp3 (30 KB), one variant every 0.5 s. Fetched only after sound unlocks: about 4 s into the page (after the
// hero intro) or on the first hit, whichever comes first. Each slot is copied into its own small buffer (about 1.7 s
// of audio in all, ~160 KB at 24 kHz) and the sprite is dropped. Until it is ready, hits are silent.
// Per hit: a random variant of the body's material, volume and brightness from impact speed (a soft hit is quieter and
// duller), a small random pitch change (bigger bodies lower), panned by screen position. At most about 6 a second
// overall, one per body every 0.25 s, and tiny resting contacts are skipped.
const IMP_SLOT = 0.5, IMP_DUR = [0.116, 0.117, 0.105, 0.22, 0.22, 0.28, 0.28, 0.085, 0.091, 0.197];
// material -> [variant, base playback rate]; the solid (the Intent cube) is the deep knock plus the blocks played lower
const IMP_MAT = {
  wood: [[0, 1], [1, 1], [2, 1], [3, 1], [4, 1]],
  ceramic: [[5, 1], [6, 1]],
  plastic: [[7, 1], [8, 1]],
  solid: [[9, 1], [9, 0.94], [3, 0.8], [4, 0.82]]
};
const IMP_TRIM = { wood: 1, ceramic: 0.8, plastic: 0.9, solid: 1.1 };
let impBufs = null, impLoading = false;
function loadImpacts() {
  if (impBufs || impLoading || !ctx || muted) return;
  impLoading = true;
  const opus = !!document.createElement('audio').canPlayType('audio/ogg; codecs="opus"');
  const get = (ext) => fetch(`./media/impacts.${ext}`).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
    .then((b) => new Promise((res, rej) => ctx.decodeAudioData(b, res, (e) => rej(e || new Error('decode failed')))));
  (opus ? get('ogg').catch(() => get('mp3')) : get('mp3')).then((sp) => {
    const sr = sp.sampleRate, d = sp.getChannelData(0);
    impBufs = IMP_DUR.map((dur, i) => {
      // find the knock in its slot (decoders may shift it a little), start 3 ms before it
      const s0 = Math.floor(i * IMP_SLOT * sr), s1 = Math.min(d.length, Math.floor((i * IMP_SLOT + 0.42) * sr));
      let pk = 0; for (let j = s0; j < s1; j++) pk = Math.max(pk, Math.abs(d[j]));
      let on = s0; while (on < s1 && Math.abs(d[on]) < pk * 0.04) on++;
      on = Math.max(s0, on - Math.floor(0.003 * sr));
      const n = Math.min(Math.floor((dur + 0.01) * sr), d.length - on), b = ctx.createBuffer(1, n, sr);
      b.getChannelData(0).set(d.subarray(on, on + n));
      return b;
    });
  }, () => { impLoading = false; });
}
function impact({ speed = 2, size = 0.45, mat = 'wood', x = null, id = null }) {
  if (!ready() || speed < 1) return;                 // muted, before the first tap, or a tiny resting contact
  if (!impBufs) { loadImpacts(); return; }
  if (id != null && !gate('imp' + id, 250)) return;  // one body: not again for a moment
  if (!gate('tock', 160) || !take(0.3)) return;      // all bodies: about 6 a second at most
  const set = IMP_MAT[mat] || IMP_MAT.wood, [vi, base] = set[Math.floor(Math.random() * set.length)];
  const k = Math.max(0, Math.min(1, (speed - 1) / 5));
  const t = ctx.currentTime, s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), v = ctx.createGain();
  // bigger bodies a little lower; plus a random +-4%
  s.buffer = impBufs[vi];
  s.playbackRate.value = base * Math.max(0.9, Math.min(1.06, Math.pow(0.45 / size, 0.25))) * (1 + (Math.random() * 2 - 1) * 0.04);
  // a soft hit is duller: the low-pass opens with impact speed
  fl.type = 'lowpass'; fl.Q.value = 0.5; fl.frequency.value = 1700 + 3800 * k;
  v.gain.value = (0.012 + 0.063 * Math.pow(k, 1.2)) * (IMP_TRIM[mat] || 1) * (0.9 + Math.random() * 0.2);
  s.connect(fl); fl.connect(v);
  if (x != null && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, (x / innerWidth) * 2 - 1)) * 0.6;
    v.connect(p); p.connect(out);
  } else v.connect(out);
  s.start(t); s.stop(t + s.buffer.duration / s.playbackRate.value + 0.02);
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
  // a physics body hitting something: a real recorded knock (see impact() below); tock() kept for old callers
  impact: (o) => impact(o || {}),
  tock(speed, size = 0.45) { impact({ speed, size, mat: 'wood' }); },
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
