// Sound: tiny UI sounds made live with Web Audio, recorded knocks and 3D taps, plus one ambient background music loop
// (media/bgm.ogg, mp3 fallback).
// The page's own idea, applied to sound: every sound has a cost, so each one is short, quiet and warm.
// - One shared AudioContext. Sound is ON by default; a visitor's own "off" is saved in localStorage.
// - Browsers block audio until a real gesture, so the context unlocks on the first tap, click or key anywhere,
//   and that first interaction plays its own sound right away.
// - Low master volume, a soft limiter, a little random pitch on every sound, throttles and a voice cap so fast repeats never stack.
// - Muted while the tab is hidden. With reduced motion, the scroll-driven sounds are dropped.
// - Background music: one quiet, seamless ambient loop (pads, choir, chops, warm bass; no drums, no layers, no sweeps).
//   Loaded only after sound unlocks, kept well under the UI sounds, ducks a little when a UI sound plays, fades with the
//   wave button, pauses with the tab.
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
function unlock(e) {
  gesture = true; gestureT = performance.now();
  setTimeout(() => { gesture = false; }, 0);
  if (document.hidden) return;
  build();
  if (ctx && ctx.state !== 'running') { const p = ctx.resume(); if (p && p.then) p.then(music, () => {}); }
  else if (ctx && !mus) music();
  // the knock sounds: fetched once, after the hero intro (about 4 s in), or sooner on the first hit
  if (ctx && !impBufs && !impLoading && !impT) impT = setTimeout(() => { loadImpacts(); loadTaps(); loadLiquid(); }, Math.max(0, 4000 - performance.now()));
  // the 3D tap sounds: at once when the first tap lands on a 3D scene, so it can be heard
  if (ctx && !tapBufs && e && e.target && e.target.closest && e.target.closest('[data-view]')) loadTaps();
  // the hero button's liquid sounds: at once when the first tap lands on it
  if (ctx && !lqBufs && e && e.target && e.target.closest && e.target.closest('.pill--ink')) loadLiquid();
}
let impT = 0;
['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'].forEach((t) => document.addEventListener(t, unlock, { capture: true, passive: true }));
document.addEventListener('visibilitychange', () => {
  if (!ctx) return;
  if (document.hidden) ctx.suspend().catch(() => {});
  else ctx.resume().then(() => { if (!mus) music(); }, () => {});
});

// ---------- background music: one quiet ambient loop ----------
// One file (media/bgm.ogg, mp3 fallback): airy pads, a soft girl choir (bed and melody), vocal chops and a warm reese bass,
// mixed down offline into one seamless loop (70 BPM, 18 bars, 61.7 s). No drums, no section sweeps, no layers (Shifat:
// "Rm grooves drums" and "Keep 1 loop. No need layers"). It plays the same the whole time, with no scroll handler and no
// per-frame work. The bass harmonics and chops lift for small speakers are baked into the file, so a phone speaker still
// hears the bass line. The file starts with 50 ms of the loop's end and ends with 50 ms of its start, so the codec's
// edges sit outside the loop and the loop point is clean. Loaded only after sound unlocks (first tap) and after the hero
// intro, kept well under the UI sounds, ducks a little when a UI sound plays, fades with the wave button, pauses with the tab.
const MUSIC = 0.0195;          // quiet: well under the UI sounds (the file is normalized; same level as the old mix)
const PRE = 0.05;              // the loop starts 50 ms into the file
const LOOP = 2962286 / 48000;  // 18 bars at 70 BPM, as rendered
// ?audiodebug: a small readout of the music (loaded, decoded, playing, live level), to check on a real phone
const DEBUG = /[?&]audiodebug\b/.test(location.search);
const dbg = { st: 'waiting for first tap', kb: 0, dur: 0, ch: 0, ext: '', err: '' };
let mus = null, duckT = 0;
const musFade = (to, sec) => {
  if (!mus) return;
  const g = mus.gain.gain, t = ctx.currentTime;
  g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(to, t + sec);
};
let musWait = false;
function music() {
  if (!ctx || muted || document.hidden || ctx.state !== 'running') return;
  if (mus) { musFade(MUSIC, 1.6); return; }
  // the fetch and decode wait until the hero intro has landed, so they never compete with it on the main thread
  if (window.__introDone && !window.__introIsDone) { if (!musWait) { musWait = true; window.__introDone.then(() => { musWait = false; music(); }); } return; }
  mus = { gain: ctx.createGain(), duck: ctx.createGain(), ready: false };
  mus.gain.gain.value = 0; mus.gain.connect(mus.duck); mus.duck.connect(ctx.destination);
  const opus = !!document.createElement('audio').canPlayType('audio/ogg; codecs="opus"');
  const load = (ext) => {
    dbg.ext = ext; dbg.st = 'loading'; dbg.err = '';
    return fetch(`./media/bgm.${ext}`).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
      .then((b) => { dbg.kb = Math.round(b.byteLength / 1024); dbg.st = 'decoding'; return new Promise((res, rej) => ctx.decodeAudioData(b, res, (e) => rej(e || new Error('decode failed')))); })
      .then((buf) => { dbg.st = 'decoded'; dbg.dur = buf.duration; dbg.ch = buf.numberOfChannels; return buf; },
        (e) => { dbg.st = 'failed'; dbg.err = String((e && e.message) || e); throw e; });
  };
  let mp3 = !opus;
  (opus ? load('ogg').catch(() => { mp3 = true; return load('mp3'); }) : load('mp3')).then((buf) => {
    // some MP3 decoders add a little silence at the start: skip it
    let off = PRE;
    if (mp3) for (let i = 0, d0 = buf.getChannelData(0), lim = Math.min(d0.length, Math.floor(buf.sampleRate * 0.25)); i < lim; i++) {
      if (Math.abs(d0[i]) > 1e-4) { off = PRE + i / buf.sampleRate; break; }
    }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    src.loopStart = off; src.loopEnd = Math.min(off + LOOP, buf.duration);
    src.connect(mus.gain); src.start(ctx.currentTime + 0.05, off);
    if (DEBUG) { mus.an = ctx.createAnalyser(); mus.an.fftSize = 512; mus.gain.connect(mus.an); }
    dbg.st = 'playing'; mus.mp3 = mp3; mus.ready = true;
    if (!muted) musFade(MUSIC, 3);
  }).catch((e) => { dbg.st = 'failed'; dbg.err = String((e && e.message) || e); mus = null; });
}
if (DEBUG) {
  const box = document.createElement('pre'); box.id = 'audiodebug';
  box.style.cssText = 'position:fixed;left:6px;bottom:6px;z-index:2147483647;margin:0;padding:8px 10px;max-width:calc(100vw - 12px);' +
    'background:rgba(18,19,21,.88);color:#f5f3ef;font:11px/1.35 ui-monospace,Menlo,Consolas,monospace;border-radius:8px;pointer-events:none;white-space:pre';
  document.body.appendChild(box);
  const buf = new Float32Array(512);
  const level = (a) => { a.getFloatTimeDomainData(buf); let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i]; const r = Math.sqrt(s / buf.length); return r > 1e-6 ? (20 * Math.log10(r)).toFixed(0) + ' dB' : 'silent'; };
  const state = () => ({
    ctx: ctx ? ctx.state : 'none', sr: ctx ? ctx.sampleRate : 0, muted, ready: !!(mus && mus.ready),
    music: mus ? +mus.gain.gain.value.toFixed(4) : 0, codec: mus && mus.ready ? (mus.mp3 ? 'mp3' : 'opus') : '',
    track: { n: 'bgm', st: dbg.st, kb: dbg.kb, dur: +dbg.dur.toFixed(1), ch: dbg.ch, err: dbg.err, level: mus && mus.an ? level(mus.an) : '' },
  });
  window.__audioState = state;
  setInterval(() => {
    const s = state(), d = s.track;
    box.textContent = `audio ${s.ctx} ${s.sr} Hz ${s.codec}${s.muted ? ' MUTED' : ''}\nmusic ${s.music}\n` +
      `bgm ${d.st} ${d.kb ? d.kb + ' kb' : ''} ${d.dur ? d.dur + ' s' : ''} ${d.level}${d.err ? ' ' + d.err : ''}` +
      (s.ctx === 'none' ? '\ntap anywhere to start sound' : '');
  }, 250);
}
// a UI sound dips the music a little, then lets it back up
function duck() {
  if (!mus || !mus.ready || muted) return;
  const t = ctx.currentTime; if (t - duckT < 0.1) return; duckT = t;
  const g = mus.duck.gain; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(0.7, t + 0.05); g.setTargetAtTime(1, t + 0.15, 0.3);
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

// ---------- 3D taps: real recorded sounds, no synth ----------
// Touching a 3D scene (press, tap, grab, drag, let go) plays short recorded foley from Kenney "Impact Sounds"
// (CC0; see media/TAPS.md): soft felt thumps, light knuckle knocks and a soft cloth brush. Trimmed tight (70 to 150 ms),
// no reverb, low-passed at 5.5 kHz, quiet. One tiny sprite, media/taps.ogg (Opus, 12 KB) or taps.mp3 (27 KB), one sound
// every 0.4 s (17 sounds with the hover air push and the slide brush). Loaded on the first tap on a 3D scene, else after the hero intro with the knocks. If a 3D tap comes
// before it is ready, that one sound plays as soon as it lands (if within 250 ms). The UI sounds stay as they are.
// Pairs: press is a deeper felt thump, its tap a lighter knock; grab is a felt grip, its let-go a lighter soft brush.
// Each action picks one of 2 or 3 variants (never the same twice in a row), with a random +-3% pitch.
// Hover on a 3D scene: a gentle air push (soft cloth moving air, smoothed, pitched down, low-passed at 3 kHz, 240 to 260 ms,
// smooth fade in and out). Sliding across a 3D scene without a grab: a soft fingertip or cloth brush (cloth and soft leather,
// 80 ms), louder and brighter when faster. Both from Kenney "RPG Audio" (CC0), quieter than the taps, never ducking the music.
const TAP_SLOT = 0.4, TAP_DUR = [0.15, 0.15, 0.15, 0.091, 0.089, 0.09, 0.13, 0.13, 0.07, 0.071, 0.068, 0.253, 0.241, 0.259, 0.085, 0.08, 0.08];
const TAP_SET = { press: [0, 1, 2], tap: [3, 4, 5], grab: [6, 7], release: [8, 9, 10], drag: [8, 9, 10], hover: [11, 12, 13], brush: [14, 15, 16] };
const TAP_GAIN = { press: 0.055, tap: 0.045, grab: 0.045, release: 0.035, drag: 0.02, hover: 0.026, brush: 0.016 };
// how far before the found onset each sound is cut: the soft ones fade in slowly, so keep their whole fade-in
const TAP_PRE = (i) => (i >= 11 ? 0.014 : 0.002);
let tapBufs = null, tapLoading = false, tapWant = null;
const tapLast = {};
function loadTaps() {
  if (tapBufs || tapLoading || !ctx || muted) return;
  tapLoading = true;
  const opus = !!document.createElement('audio').canPlayType('audio/ogg; codecs="opus"');
  const get = (ext) => fetch(`./media/taps.${ext}`).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
    .then((b) => new Promise((res, rej) => ctx.decodeAudioData(b, res, (e) => rej(e || new Error('decode failed')))));
  (opus ? get('ogg').catch(() => get('mp3')) : get('mp3')).then((sp) => {
    const sr = sp.sampleRate, d = sp.getChannelData(0);
    tapBufs = TAP_DUR.map((dur, i) => {
      const s0 = Math.floor(i * TAP_SLOT * sr), s1 = Math.min(d.length, Math.floor((i * TAP_SLOT + 0.32) * sr));
      let pk = 0; for (let j = s0; j < s1; j++) pk = Math.max(pk, Math.abs(d[j]));
      let on = s0; while (on < s1 && Math.abs(d[on]) < pk * 0.04) on++;
      on = Math.max(s0, on - Math.floor(TAP_PRE(i) * sr));
      const n = Math.min(Math.floor((dur + TAP_PRE(i) + 0.006) * sr), d.length - on), b = ctx.createBuffer(1, n, sr);
      b.getChannelData(0).set(d.subarray(on, on + n));
      return b;
    });
    const w = tapWant; tapWant = null;
    if (w && performance.now() - w.t < 250) tap3(w.kind, w.o);
  }, () => { tapLoading = false; tapWant = null; });
}
function tap3(kind, { level = 1, rate = 1, x = null, lp = 0 } = {}) {
  if (!ready()) return;
  // hover and brush are only ambience: never queued, they just start the load
  if (!tapBufs && (kind === 'hover' || kind === 'brush')) { loadTaps(); return; }
  if (!tapBufs) { tapWant = { kind, o: { level, rate, x }, t: performance.now() }; loadTaps(); return; }
  const set = TAP_SET[kind]; let vi = set[Math.floor(Math.random() * set.length)];
  if (vi === tapLast[kind] && set.length > 1) vi = set[(set.indexOf(vi) + 1 + Math.floor(Math.random() * (set.length - 1))) % set.length];
  tapLast[kind] = vi;
  const s = ctx.createBufferSource(), v = ctx.createGain(), g = TAP_GAIN[kind] * level * (0.92 + Math.random() * 0.16);
  s.buffer = tapBufs[vi]; s.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * 0.03);
  v.gain.value = g;
  if (lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 0.5; f.frequency.value = lp; s.connect(f); f.connect(v); } else s.connect(v);
  if (x != null && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, (x / innerWidth) * 2 - 1)) * 0.5;
    v.connect(p); p.connect(out);
  } else v.connect(out);
  s.start(); s.stop(ctx.currentTime + s.buffer.duration / s.playbackRate.value + 0.02);
  if (g >= 0.045) duck();
}

// ---------- hero button "Read the idea": liquid sounds, real recorded water, no synth ----------
// Matches the ink: swell as the ink floods in from the pointer (gentle lapping water, quick rise, long fall, about 0.6 s
// against the 0.85 s flood), drain as it leaves (the same water, lower and darker, easing in and out, about 0.5 s against
// the 0.65 s drain), press as it squashes and ripples (a soft water drop, pitched down to a warm bloop, its own ripple
// tail kept), settle as it springs back (one tiny, softer drip). CC0 recordings from Freesound (see media/TAPS.md),
// low-passed (2.4 kHz swell, 1.7 kHz drain, 3 to 3.6 kHz drops), no reverb, quiet under the music, never ducking it.
// One small sprite, media/liquid.ogg (Opus, 27 KB) or liquid.mp3, one sound every 0.8 s. Loaded on the first tap on the
// button, else after the hero intro with the knocks. Each action picks one of 3 variants (never the same twice in a row),
// with a random +-3% pitch, panned with the pointer.
const LQ_SLOT = 0.8, LQ_DUR = [0.23, 0.27, 0.38, 0.17, 0.17, 0.132, 0.62, 0.6, 0.62, 0.52, 0.5, 0.52];
const LQ_SET = { press: [0, 1, 2], settle: [3, 4, 5], swell: [6, 7, 8], drain: [9, 10, 11] };
const LQ_GAIN = { press: 0.05, settle: 0.03, swell: 0.034, drain: 0.026 };
// the swell and drain fade in slowly, so cut well before the found onset (never before the slot)
const LQ_PRE = (i) => (i >= 6 ? 0.06 : 0.002);
let lqBufs = null, lqLoading = false, lqWant = null;
const lqLast = {};
function loadLiquid() {
  if (lqBufs || lqLoading || !ctx || muted) return;
  lqLoading = true;
  const opus = !!document.createElement('audio').canPlayType('audio/ogg; codecs="opus"');
  const get = (ext) => fetch(`./media/liquid.${ext}`).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
    .then((b) => new Promise((res, rej) => ctx.decodeAudioData(b, res, (e) => rej(e || new Error('decode failed')))));
  (opus ? get('ogg').catch(() => get('mp3')) : get('mp3')).then((sp) => {
    const sr = sp.sampleRate, d = sp.getChannelData(0);
    lqBufs = LQ_DUR.map((dur, i) => {
      const s0 = Math.floor(i * LQ_SLOT * sr), s1 = Math.min(d.length, Math.floor((i * LQ_SLOT + 0.75) * sr));
      let pk = 0; for (let j = s0; j < s1; j++) pk = Math.max(pk, Math.abs(d[j]));
      let on = s0; while (on < s1 && Math.abs(d[on]) < pk * 0.03) on++;
      on = Math.max(s0, on - Math.floor(LQ_PRE(i) * sr));
      const n = Math.min(Math.floor((dur + LQ_PRE(i) + 0.006) * sr), d.length - on), b = ctx.createBuffer(1, n, sr);
      b.getChannelData(0).set(d.subarray(on, on + n));
      return b;
    });
    const w = lqWant; lqWant = null;
    if (w && performance.now() - w.t < 250) liquid(w.kind, w.o);
  }, () => { lqLoading = false; lqWant = null; });
}
function liquid(kind, { level = 1, x = null } = {}) {
  if (!ready()) return;
  // only the press waits for the load (the first tap should be heard); the rest just start it
  if (!lqBufs) { if (kind === 'press') lqWant = { kind, o: { level, x }, t: performance.now() }; loadLiquid(); return; }
  const set = LQ_SET[kind]; let vi = set[Math.floor(Math.random() * set.length)];
  if (vi === lqLast[kind]) vi = set[(set.indexOf(vi) + 1 + Math.floor(Math.random() * (set.length - 1))) % set.length];
  lqLast[kind] = vi;
  const s = ctx.createBufferSource(), v = ctx.createGain();
  s.buffer = lqBufs[vi]; s.playbackRate.value = 1 + (Math.random() * 2 - 1) * 0.03;
  v.gain.value = LQ_GAIN[kind] * level * (0.92 + Math.random() * 0.16);
  s.connect(v);
  if (x != null && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, (x / innerWidth) * 2 - 1)) * 0.5;
    v.connect(p); p.connect(out);
  } else v.connect(out);
  s.start(); s.stop(ctx.currentTime + s.buffer.duration / s.playbackRate.value + 0.02);
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
  // the hero button's liquid sounds (see liquid()): same throttles as the old tick, thump and ripple
  inkIn(x = null, level = 1) { if (!ready() || !gate('inkIn', 120) || !take(0.6)) return; liquid('swell', { x, level }); },
  inkOut(x = null, level = 1) { if (!ready() || !gate('inkOut', 120) || !take(0.5)) return; liquid('drain', { x, level }); },
  plop(x = null) { if (!ready() || !gate('thump', 60) || !take(0.3)) return; liquid('press', { x }); },
  settle(x = null) { if (!ready() || !gate('ripple', 90) || !take(0.17)) return; liquid('settle', { x }); },
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
  // a 3D scene under the pointer: a gentle recorded air push (see tap3)
  hum(x = null) { if (!ready() || !gate('hum', 160) || !take(0.28)) return; tap3('hover', { x, level: 0.9 + Math.random() * 0.2 }); },
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
  // a 3D scene pressed: a soft felt thump; tapped: a lighter knuckle knock (real recordings, see tap3)
  squish(x = null) { if (!ready() || !gate('squish', 70) || !take(0.18)) return; tap3('press', { x }); },
  boop(x = null) { if (!ready() || !gate('boop', 70) || !take(0.14)) return; tap3('tap', { x, rate: 1.04 }); },
  // a 3D object grabbed: a felt grip; dragged: a faint cloth brush, louder when faster; let go: a light soft brush
  grab3(x = null) { if (!ready() || !gate('grab3', 80) || !take(0.16)) return; tap3('grab', { x }); },
  drag3(speed) { if (!ready() || !gate('drag3', 110) || !take(0.1)) return; const k = Math.min(1, speed / 30); tap3('drag', { level: 0.45 + 0.55 * k, rate: 1.04 + 0.14 * k }); },
  // a finger or pointer sliding across a 3D scene without a grab: a soft recorded brush, louder and brighter when faster
  brush3(speed, x = null) { if (!ready() || !gate('brush', 75) || !take(0.09)) return; const k = Math.min(1, speed / 30); tap3('brush', { x, level: 0.4 + 0.6 * k, rate: 0.97 + 0.1 * k, lp: 1800 + 2000 * k }); },
  release3(x = null) { if (!ready() || !gate('release3', 80) || !take(0.1)) return; tap3('release', { x, rate: 1.03 }); }
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
document.querySelectorAll('.pill, .chips span, .meter.fit, .band').forEach((el) => brushOn(el, el.classList.contains('band') ? 0.8 : 1));

// "Read the idea": liquid, like its ink. Mouse: a swell as the ink floods in, a softer drain as it leaves.
// Press: a water drop with its ripple tail (on touch the ink floods in too, so a quiet swell under it).
// Release: one tiny drip as the spring settles; on touch, a soft drain when the ink drains (0.32 s after the press at the
// earliest, as in ink-button.js). Keys: drop on Enter or Space, drip on release. A soft glide as the page scrolls.
document.querySelectorAll('.pill--ink').forEach((el) => {
  let down = false, downT = 0, touch = false, lx = null;
  const cx = () => { const r = el.getBoundingClientRect(); return r.left + r.width / 2; };
  hover(el, (e) => S.inkIn(e.clientX));
  el.addEventListener('pointerleave', (e) => { if (mouse(e)) S.inkOut(e.clientX); }, P);
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    down = true; downT = performance.now(); touch = !mouse(e); lx = e.clientX;
    S.plop(e.clientX); if (touch) S.inkIn(e.clientX, 0.5);
  }, P);
  el.addEventListener('pointermove', (e) => { if (down && touch) lx = e.clientX; }, P);
  const up = (e) => {
    if (!down) return; down = false;
    const x = e.type === 'pointercancel' || !e.clientX ? lx : e.clientX;
    setTimeout(() => S.settle(x), 90);
    if (touch) setTimeout(() => S.inkOut(x, 0.6), Math.max(120, 320 - (performance.now() - downT)));
  };
  addEventListener('pointerup', up, P); addEventListener('pointercancel', up, P);
  el.addEventListener('keydown', (e) => { if (!e.repeat && (e.key === 'Enter' || e.key === ' ')) S.plop(cx()); });
  el.addEventListener('keyup', (e) => { if (e.key === 'Enter' || e.key === ' ') setTimeout(() => S.settle(cx()), 90); });
  el.addEventListener('click', () => { if (!reduce) setTimeout(() => S.whoosh(0.6, 0.9), 160); });
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

// 3D scenes: a soft felt thump on press, a light knock on tap (recorded), a gentle air push on hover and a soft brush on a slide (recorded)
document.querySelectorAll('[data-view]').forEach((el) => {
  let sx = 0, sy = 0, st = 0;
  const start = (x, y) => { sx = x; sy = y; st = performance.now(); S.squish(x); };
  const end = (x, y) => { if (Math.hypot(x - sx, y - sy) < 8 && performance.now() - st < 450) S.boop(x); };
  el.addEventListener('pointerdown', (e) => { if (mouse(e) && e.button === 0) start(e.clientX, e.clientY); }, { passive: true });
  el.addEventListener('pointerup', (e) => { if (mouse(e)) end(e.clientX, e.clientY); }, { passive: true });
  el.addEventListener('touchstart', (e) => { const t = e.touches[0]; sx = t.clientX; sy = t.clientY; st = performance.now(); }, { passive: true });
  el.addEventListener('touchend', (e) => { const t = e.changedTouches[0]; if (Math.hypot(t.clientX - sx, t.clientY - sy) < 10 && performance.now() - st < 450) { const x = t.clientX; S.squish(x); setTimeout(() => S.boop(x), 40); } }, { passive: true });
  // hover: a gentle air push; grab a model: felt grip, drag: faint cloth brush, let go: light soft brush; slide across: soft brush (all recorded)
  hover(el, (e) => S.hum(e.clientX));
  let held = false, lx = 0, ly = 0, lt = 0;
  const view = () => (window.__views || []).find((v) => v.el === el);
  const mv = (x, y) => {
    const t = performance.now(), sp = Math.hypot(x - lx, y - ly) / Math.max(1, t - lt) * 16; lx = x; ly = y; lt = t;
    const v = view(), g = !!(v && v.inp.down && v.inp.grab);
    if (g && !held) { held = true; S.grab3(x); }
    if (g) { if (sp > 1.5) S.drag3(sp); } else if (sp > 1.5) S.brush3(sp, x);
  };
  const release = () => { if (held) { held = false; S.release3(lx); } };
  el.addEventListener('pointermove', (e) => { if (!mouse(e)) return; if (e.buttons & 1) mv(e.clientX, e.clientY); else { lx = e.clientX; ly = e.clientY; lt = performance.now(); } }, P);
  el.addEventListener('touchstart', (e) => { const t = e.touches[0]; if (t) { lx = t.clientX; ly = t.clientY; lt = performance.now(); } }, P);
  el.addEventListener('touchmove', (e) => { const t = e.touches[0]; if (t) mv(t.clientX, t.clientY); }, P);
  ['pointerup', 'pointerleave', 'touchend', 'touchcancel'].forEach((ev) => el.addEventListener(ev, release, P));
});

// meters: a tick on hover, and on touch press
document.querySelectorAll('.meter').forEach((el) => { hover(el, () => S.tick(0.7)); el.addEventListener('pointerdown', (e) => { if (!mouse(e)) S.tick(0.7); }, P); });
// cards and tiles: no sounds of their own. Every one holds a 3D scene, and its sounds are the card's sounds.
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
