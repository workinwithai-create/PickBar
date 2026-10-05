/* PickBar — anacrusis desk. Audio clock scheduler. FluidR3 pinned SHA. */
const CDN = "https://cdn.jsdelivr.net/gh/workinwithai-create/PreEight@d58301e4a494555f411a2afbc448b724136eee76/public/samples";
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.12;
const TAIL_SEC = 0.45;
const SR = 48000;

const KEYS = ["C","C#","D","Eb","E","F","F#","G","Ab","A","Bb","B"];
const NAMES = ["C","C#","D","Eb","E","F","F#","G","Ab","A","Bb","B"];
const CHAIRS = ["piano","upright","nylon","trumpet","violin","kit"];

const RECIPES = [
  { id:"bass-five", name:"Bass 5", blurb:"Upright root on 1. Fifth on the and of 4 into the next root." },
  { id:"walk-up", name:"Walk up", blurb:"5–6–7 on the last three eighths. Lands on the next root." },
  { id:"nylon-lick", name:"Nylon lick", blurb:"Nylon two-eighth pickup. Not a riff section — a door." },
  { id:"flam", name:"Flam", blurb:"Snare flam on the e of 4. Kick stays on the one." },
  { id:"grace", name:"Grace", blurb:"Piano grace into the next root on the last 16th." },
  { id:"hat-open", name:"Hat open", blurb:"Closed hats die. Open hat (crash stand-in is not used) on the and of 4." },
  { id:"brass-door", name:"Brass door", blurb:"Trumpet on the last eighth, then yields." },
  { id:"violin-lead", name:"Violin lead", blurb:"Violin holds the 2 of the next chord across the last half-bar." },
  { id:"tom-fill", name:"Tom fill", blurb:"Low, mid, high tom on the last three 16ths. Named toms, not pitched hats." },
  { id:"rest-door", name:"Rest door", blurb:"Air until the last 16th. One upright note, then the one." }
];

const GROOVES = [
  { id:"amber", name:"Amber Walk", bpm:98, chords:"Am F C G" },
  { id:"porch", name:"Porch Climb", bpm:86, chords:"C G Am F" },
  { id:"carbon", name:"Carbon Verse", bpm:104, chords:"Dm Bb F C" },
  { id:"fold", name:"Fold Radio", bpm:92, chords:"Em C G D" },
  { id:"stair", name:"Stair House", bpm:112, chords:"Am Dm G C" }
];

const FILES = [
  ["piano","C2","piano/C2.mp3"],["piano","C3","piano/C3.mp3"],["piano","C4","piano/C4.mp3"],["piano","C5","piano/C5.mp3"],
  ["piano","E2","piano/E2.mp3"],["piano","E3","piano/E3.mp3"],["piano","E4","piano/E4.mp3"],["piano","G2","piano/G2.mp3"],
  ["piano","G3","piano/G3.mp3"],["piano","G4","piano/G4.mp3"],["piano","A2","piano/A2.mp3"],["piano","A3","piano/A3.mp3"],["piano","A4","piano/A4.mp3"],
  ["upright","E1","bass/E1.mp3"],["upright","G1","bass/G1.mp3"],["upright","A1","bass/A1.mp3"],["upright","Bb1","bass/Bb1.mp3"],
  ["upright","C2","bass/C2.mp3"],["upright","E2","bass/E2.mp3"],["upright","G2","bass/G2.mp3"],["upright","A2","bass/A2.mp3"],
  ["nylon","E2","guitar/E2.mp3"],["nylon","A2","guitar/A2.mp3"],["nylon","B2","guitar/B2.mp3"],["nylon","D3","guitar/D3.mp3"],
  ["nylon","E3","guitar/E3.mp3"],["nylon","G3","guitar/G3.mp3"],["nylon","A3","guitar/A3.mp3"],["nylon","B3","guitar/B3.mp3"],
  ["nylon","D4","guitar/D4.mp3"],["nylon","E4","guitar/E4.mp3"],["nylon","G4","guitar/G4.mp3"],["nylon","A4","guitar/A4.mp3"],
  ["trumpet","G3","trumpet/G3.mp3"],["trumpet","A3","trumpet/A3.mp3"],["trumpet","C4","trumpet/C4.mp3"],["trumpet","E4","trumpet/E4.mp3"],
  ["trumpet","G4","trumpet/G4.mp3"],["trumpet","A4","trumpet/A4.mp3"],["trumpet","C5","trumpet/C5.mp3"],["trumpet","E5","trumpet/E5.mp3"],
  ["violin","G3","violin/G3.mp3"],["violin","A3","violin/A3.mp3"],["violin","C4","violin/C4.mp3"],["violin","E4","violin/E4.mp3"],
  ["violin","G4","violin/G4.mp3"],["violin","A4","violin/A4.mp3"],["violin","C5","violin/C5.mp3"],["violin","E5","violin/E5.mp3"],
  ["kit","kick","drums/kick.mp3"],["kit","snare","drums/snare.mp3"],["kit","hihat","drums/hihat.mp3"],
  ["kit","crash","drums/crash.mp3"],["kit","tom1","drums/tom1.mp3"],["kit","tom2","drums/tom2.mp3"],["kit","tom3","drums/tom3.mp3"]
];

const state = {
  bpm: 98, key: "A", chords: "Am F C G", bars: 8,
  groove: "amber", recipe: "bass-five", side: "B",
  mute: { piano:false, upright:false, nylon:false, trumpet:false, violin:false, kit:false },
  unlocked: false
};

let ctx = null, master = null, chairGain = {}, limiter = null;
let buffers = {}, raw = {}, missing = [];
let nextStepTime = 0, step = 0, timerId = null, rafId = null;
let active = [];
let startedAt = 0, playing = false;
const midiEvents = [];

function $(id){ return document.getElementById(id); }

function loadState(){
  try {
    const s = JSON.parse(localStorage.getItem("pickbar-state") || "{}");
    Object.assign(state, s);
    state.mute = Object.assign({ piano:false, upright:false, nylon:false, trumpet:false, violin:false, kit:false }, s.mute || {});
  } catch (e) { /* keep defaults */ }
}
function saveState(){ localStorage.setItem("pickbar-state", JSON.stringify(state)); }

function pc(name){
  const n = name.replace("b","b");
  const map = { C:0,"C#":1,Db:1,D:2,"D#":3,Eb:3,E:4,F:5,"F#":6,Gb:6,G:7,"G#":8,Ab:8,A:9,"A#":10,Bb:10,B:11 };
  return map[n];
}
function midiOf(name, oct){ return (oct+1)*12 + pc(name); }
function nameOf(m){ return NAMES[((m%12)+12)%12] + (Math.floor(m/12)-1); }

function parseChord(sym){
  const m = String(sym).trim().match(/^([A-G](?:#|b)?)(m|min|maj)?/);
  if (!m) return null;
  const root = pc(m[1]);
  const minor = m[2] === "m" || m[2] === "min";
  const third = minor ? 3 : 4;
  return { sym: sym.trim(), root, tones: [root, (root+third)%12, (root+7)%12] };
}
function progression(){
  const parts = state.chords.split(/\s+/).filter(Boolean).slice(0,4);
  const parsed = parts.map(parseChord).filter(Boolean);
  if (parsed.length < 1) return [parseChord("Am"), parseChord("F"), parseChord("C"), parseChord("G")];
  while (parsed.length < 4) parsed.push(parsed[parsed.length-1]);
  return parsed;
}
function chordAt(bar){
  const p = progression();
  return p[bar % p.length];
}
function keyOffset(){
  return pc(state.key) - 9; /* grooves written around A; user key wins */
}
function transpose(midi){ return midi + keyOffset(); }

function closest(voice, midi){
  const pool = FILES.filter(f => f[0] === voice && f[1] !== "kick");
  let best = null, bestAbs = 99;
  for (const f of pool){
    const note = f[1];
    const oct = parseInt(note.slice(-1), 10);
    const nm = note.slice(0, -1);
    const sm = midiOf(nm, oct);
    const d = midi - sm;
    if (Math.abs(d) < bestAbs){ bestAbs = Math.abs(d); best = { key: voice+":"+f[1], semi: d, sampleMidi: sm }; }
  }
  if (!best || bestAbs > 4) return null;
  return best;
}

function ensureAudio(){
  if (!ctx){
    ctx = new AudioContext();
    limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.12;
    master = ctx.createGain();
    master.gain.value = 0.8;
    CHAIRS.forEach(c => {
      const g = ctx.createGain();
      g.gain.value = c === "kit" ? 0.7 : 0.45;
      g.connect(master);
      chairGain[c] = g;
    });
    master.connect(limiter);
    limiter.connect(ctx.destination);
  }
  if (ctx.state !== "running") ctx.resume();
}

async function loadSamples(){
  missing = [];
  let n = 0;
  $("status").textContent = "Seating chairs 0/" + FILES.length;
  for (const [voice, note, path] of FILES){
    const url = CDN + "/" + path;
    const key = voice + ":" + note;
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(r.status);
      const ab = await r.arrayBuffer();
      raw[key] = ab;
      const dec = await ctx.decodeAudioData(ab.slice(0));
      buffers[key] = dec;
    } catch (e) {
      missing.push(voice + " (" + note + ")");
    }
    n++;
    $("status").textContent = "Seating chairs " + n + "/" + FILES.length;
  }
  const voices = [...new Set(missing.map(s => s.split(" ")[0]))];
  if (missing.length){
    $("status").textContent = "Missing instruments: " + voices.join(", ") + ". Not playing with a hole.";
    return false;
  }
  $("status").textContent = "Chairs seated · FluidR3 pinned " + CDN.split("@")[1].slice(0,7);
  return true;
}

function track(src){
  active.push(src);
  src.onended = () => { active = active.filter(s => s !== src); };
}

function playHit(context, voice, drum, when, gain, dur){
  if (state.mute[voice]) return;
  const key = voice + ":" + drum;
  const buf = context === ctx ? buffers[key] : null;
  const node = makeSource(context, key, buf, 1);
  if (!node) return;
  const g = context.createGain();
  const peak = gain;
  g.gain.setValueAtTime(0.0001, when);
  g.gain.linearRampToValueAtTime(peak, when + 0.004);
  g.gain.linearRampToValueAtTime(0.0001, when + Math.max(0.02, dur));
  node.connect(g);
  const dest = context === ctx ? chairGain[voice] : context._chairs[voice];
  g.connect(dest);
  node.start(when);
  node.stop(when + dur + 0.02);
  if (context === ctx) track(node);
}

function makeSource(context, key, liveBuf, rate){
  let buf = liveBuf;
  if (context !== ctx){
    buf = context._decoded[key];
    if (!buf) return null;
  }
  if (!buf) return null;
  const src = context.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  return src;
}

function playNote(context, voice, midi, when, gain, dur, swell){
  if (state.mute[voice]) return;
  const hit = closest(voice, midi);
  if (!hit) return;
  const rate = Math.pow(2, hit.semi / 12);
  const buf = context === ctx ? buffers[hit.key] : null;
  const slice = Math.min(dur, 0.32);
  const repeats = voice === "violin" && dur > 0.34 ? Math.ceil(dur / 0.28) : 1;
  for (let i = 0; i < repeats; i++){
    const t = when + i * 0.28;
    if (t >= when + dur) break;
    const node = makeSource(context, hit.key, buf, rate);
    if (!node) continue;
    const g = context.createGain();
    const attack = swell ? Math.min(0.18, dur * 0.4) : 0.008;
    const rel = 0.02;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    const end = Math.min(when + dur, t + 0.3);
    g.gain.linearRampToValueAtTime(0.0001, end + rel);
    node.connect(g);
    const dest = context === ctx ? chairGain[voice] : context._chairs[voice];
    g.connect(dest);
    node.start(t);
    node.stop(end + rel + 0.01);
    if (context === ctx) track(node);
  }
}

function eventsFor(stepIndex, side){
  const bar = Math.floor(stepIndex / 16);
  const six = stepIndex % 16;
  const ch = chordAt(bar);
  const next = chordAt(bar + 1);
  const root = transpose(60 + ch.root);
  const nextRoot = transpose(60 + next.root);
  const recipe = state.recipe;
  const ev = [];
  const wantPickup = side === "B";
  if (six === 0){
    ev.push({ chair:"piano", midi: root - 12, dur: 0.9, gain: 0.28 });
    ev.push({ chair:"piano", midi: root, dur: 0.7, gain: 0.22 });
    ev.push({ chair:"piano", midi: root + ch.tones[1] - ch.root, dur: 0.7, gain: 0.18 });
    ev.push({ chair:"nylon", midi: root, dur: 0.45, gain: 0.2 });
    ev.push({ chair:"upright", midi: root - 24, dur: 0.4, gain: 0.34 });
    ev.push({ chair:"kit", drum:"kick", dur: 0.18, gain: 0.55 });
  }
  if (six === 4 || six === 8 || six === 12){
    ev.push({ chair:"kit", drum:"hihat", dur: 0.08, gain: 0.22 });
  }
  if (six === 8){
    ev.push({ chair:"kit", drum:"snare", dur: 0.16, gain: 0.32 });
    ev.push({ chair:"upright", midi: root - 24, dur: 0.28, gain: 0.26 });
  }
  if (!wantPickup) return ev;
  if (recipe === "bass-five" && six === 14){
    ev.push({ chair:"upright", midi: nextRoot - 24 + 7, dur: 0.18, gain: 0.36 });
  }
  if (recipe === "walk-up" && (six === 12 || six === 14 || six === 15)){
    const walk = [7, 9, 11];
    const idx = six === 12 ? 0 : six === 14 ? 1 : 2;
    ev.push({ chair:"upright", midi: nextRoot - 24 + walk[idx] - 12, dur: 0.16, gain: 0.34 });
  }
  if (recipe === "nylon-lick" && (six === 14 || six === 15)){
    ev.push({ chair:"nylon", midi: (six === 14 ? nextRoot - 2 : nextRoot), dur: 0.14, gain: 0.26 });
  }
  if (recipe === "flam" && six === 15){
    ev.push({ chair:"kit", drum:"snare", dur: 0.08, gain: 0.28 });
    ev.push({ chair:"kit", drum:"snare", dur: 0.1, gain: 0.4 });
  }
  if (recipe === "grace" && six === 15){
    ev.push({ chair:"piano", midi: nextRoot - 1, dur: 0.08, gain: 0.2 });
  }
  if (recipe === "hat-open" && six === 14){
    ev.push({ chair:"kit", drum:"hihat", dur: 0.2, gain: 0.34 });
  }
  if (recipe === "brass-door" && six === 14){
    ev.push({ chair:"trumpet", midi: nextRoot, dur: 0.22, gain: 0.3 });
  }
  if (recipe === "violin-lead" && six === 8){
    ev.push({ chair:"violin", midi: nextRoot + 2, dur: 2.2, gain: 0.22, swell: true });
  }
  if (recipe === "tom-fill" && six >= 13){
    const toms = ["tom3","tom2","tom1"];
    ev.push({ chair:"kit", drum: toms[six - 13], dur: 0.16, gain: 0.4 });
  }
  if (recipe === "rest-door" && six === 15){
    ev.push({ chair:"upright", midi: nextRoot - 24 + 7, dur: 0.12, gain: 0.3 });
  }
  return ev;
}

function scheduleStep(stepIndex, when, context, side, collect){
  const evs = eventsFor(stepIndex, side);
  const stepDur = 60 / state.bpm / 4;
  evs.forEach(ev => {
    if (ev.drum) playHit(context, "kit", ev.drum, when, ev.gain, ev.dur);
    else playNote(context, ev.chair, ev.midi, when, ev.gain, Math.max(ev.dur, stepDur * 0.8), !!ev.swell);
    if (collect) collect.push({ step: stepIndex, when, ev });
  });
}

function scheduler(){
  if (!playing || !ctx) return;
  while (nextStepTime < ctx.currentTime + SCHEDULE_AHEAD){
    scheduleStep(step, nextStepTime, ctx, state.side);
    const stepDur = 60 / state.bpm / 4;
    nextStepTime += stepDur;
    step = (step + 1) % (state.bars * 16);
  }
}

function stopAll(){
  playing = false;
  if (timerId) clearInterval(timerId);
  timerId = null;
  active.forEach(s => { try { s.stop(); } catch (e) {} });
  active = [];
  if (rafId) cancelAnimationFrame(rafId);
  $("playhead").style.width = "0%";
}

function start(side){
  if (missing.length) return;
  ensureAudio();
  stopAll();
  state.side = side;
  saveState();
  playing = true;
  nextStepTime = ctx.currentTime + 0.1;
  step = 0;
  startedAt = nextStepTime;
  timerId = setInterval(scheduler, LOOKAHEAD_MS);
  const tick = () => {
    if (!playing) return;
    const elapsed = ctx.currentTime - startedAt;
    const loop = state.bars * 4 * 60 / state.bpm;
    const pos = ((elapsed % loop) + loop) % loop;
    $("playhead").style.width = (pos / loop * 100) + "%";
    const bar = Math.floor(pos / (loop / state.bars));
    document.querySelectorAll(".bar").forEach((el, i) => el.classList.toggle("now", i === bar));
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
  paint();
}

function punchText(){
  const rec = RECIPES.find(r => r.id === state.recipe);
  const lines = [
    "PickBar · " + rec.name,
    rec.blurb,
    "BPM " + state.bpm + " · key " + state.key + " · " + state.chords + " · " + state.bars + " bars",
    "A is the cold one. B writes the pickup on the and-of-4 into the next chord.",
    "Drop the WAV on bar 1. The one of your song is already the downbeat. The pickup is the last beat of each bar.",
    "Not OpenEight (the record's first eight). Not LiftTwo (FX lift). Not TagFour (after the last chorus)."
  ];
  return lines.join("\n");
}
function paint(){
  $("punch").textContent = punchText();
  const grid = $("bargrid");
  grid.style.gridTemplateColumns = "repeat(" + Math.min(state.bars, 8) + ",1fr)";
  grid.innerHTML = "";
  for (let i = 0; i < state.bars; i++){
    const d = document.createElement("div");
    d.className = "bar";
    d.textContent = (i+1) + " " + chordAt(i).sym + (state.side === "B" ? " · pick" : " · cold");
    grid.appendChild(d);
  }
}

function encodeWav24(left, right){
  const n = left.length;
  const block = 6;
  const buf = new ArrayBuffer(44 + n * block);
  const v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o+i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + n * block, true); w(8, "WAVE");
  w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
  v.setUint32(24, SR, true); v.setUint32(28, SR * block, true); v.setUint16(32, block, true); v.setUint16(34, 24, true);
  w(36, "data"); v.setUint32(40, n * block, true);
  let o = 44, peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  const scale = peak > 0.891 ? 0.891 / peak : 1;
  for (let i = 0; i < n; i++){
    for (const ch of [left, right]){
      let s = Math.max(-1, Math.min(1, ch[i] * scale));
      let q = Math.round(s * 8388607);
      if (q < 0) q += 0x1000000;
      v.setUint8(o, q & 255); v.setUint8(o+1, (q >> 8) & 255); v.setUint8(o+2, (q >> 16) & 255);
      o += 3;
    }
  }
  return new Blob([buf], { type: "audio/wav" });
}

async function decodeInto(offline){
  offline._decoded = {};
  offline._chairs = {};
  const lim = offline.createDynamicsCompressor();
  lim.threshold.value = -8; lim.knee.value = 6; lim.ratio.value = 12; lim.attack.value = 0.003; lim.release.value = 0.12;
  const bus = offline.createGain(); bus.gain.value = 0.8; bus.connect(lim); lim.connect(offline.destination);
  for (const c of CHAIRS){
    const g = offline.createGain();
    g.gain.value = c === "kit" ? 0.7 : 0.45;
    g.connect(bus);
    offline._chairs[c] = g;
  }
  for (const key of Object.keys(raw)){
    offline._decoded[key] = await offline.decodeAudioData(raw[key].slice(0));
  }
}

async function renderWav(withTail){
  if (!state.unlocked){ $("licenseStatus").textContent = "Export locked — paste a Lemon Squeezy key"; return; }
  if (missing.length) return;
  const bars = state.bars;
  const length = Math.round(bars * 4 * 60 / state.bpm * SR);
  const tail = Math.round(TAIL_SEC * SR);
  const offline = new OfflineAudioContext(2, length + tail, SR);
  await decodeInto(offline);
  let t = 0;
  const stepDur = 60 / state.bpm / 4;
  for (let i = 0; i < bars * 16; i++){
    scheduleStep(i, t, offline, state.side);
    t += stepDur;
  }
  const rendered = await offline.startRendering();
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  const L = rendered.getChannelData(0);
  const R = rendered.getChannelData(1);
  for (let i = 0; i < length; i++){ left[i] = L[i]; right[i] = R[i]; }
  for (let i = 0; i < tail && i < length; i++){ left[i] += L[length + i] || 0; right[i] += R[length + i] || 0; }
  const blob = encodeWav24(left, right);
  download(blob, fileBase() + (withTail ? "-with-tail" : "") + ".wav");
  if (withTail){
    const fullL = rendered.getChannelData(0).slice(0, length + tail);
    const fullR = rendered.getChannelData(1).slice(0, length + tail);
    download(encodeWav24(fullL, fullR), fileBase() + "-with-tail.wav");
  }
}

function fileBase(){
  const rec = state.recipe;
  const key = state.key.replace("#","s");
  return "pickbar-" + rec + "-" + state.bpm + "bpm-" + key;
}

function download(blob, name){
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
}

function writeMidi(){
  if (!state.unlocked){ $("licenseStatus").textContent = "Export locked — paste a Lemon Squeezy key"; return; }
  const eventsByChair = {};
  CHAIRS.forEach(c => eventsByChair[c] = []);
  const stepDur = 60 / state.bpm / 4;
  const ppq = 480;
  const ticksPerStep = ppq / 4;
  for (let i = 0; i < state.bars * 16; i++){
    eventsFor(i, state.side).forEach(ev => {
      const tick = i * ticksPerStep;
      const dur = Math.max(1, Math.round((ev.dur / stepDur) * ticksPerStep));
      if (ev.drum){
        const map = { kick:36, snare:38, hihat:42, crash:49, tom1:50, tom2:47, tom3:45 };
        eventsByChair.kit.push({ tick, note: map[ev.drum] || 36, dur, vel: Math.round(ev.gain * 110) });
      } else if (!state.mute[ev.chair]) {
        eventsByChair[ev.chair].push({ tick, note: ev.midi, dur, vel: Math.round(ev.gain * 110) });
      }
    });
  }
  const tracks = CHAIRS.map(c => midiTrack(eventsByChair[c], c === "kit"));
  const bytes = midiFile(tracks);
  download(new Blob([new Uint8Array(bytes)], { type: "audio/midi" }), fileBase() + ".mid");
}

function vlq(n){
  const out = [];
  let v = n;
  out.push(v & 0x7f); v >>= 7;
  while (v){ out.push((v & 0x7f) | 0x80); v >>= 7; }
  return out.reverse();
}
function midiTrack(notes, drums){
  const ev = [];
  notes.sort((a,b) => a.tick - b.tick);
  let last = 0;
  notes.forEach(n => {
    ev.push({ t: n.tick, d: [0x90, n.note, Math.max(1, Math.min(127, n.vel))] });
    ev.push({ t: n.tick + n.dur, d: [0x80, n.note, 0] });
  });
  ev.sort((a,b) => a.t - b.t || a.d[0] - b.d[0]);
  const bytes = [];
  const push = (arr) => arr.forEach(b => bytes.push(b));
  push([0x00, 0xFF, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08]);
  const us = Math.round(60000000 / state.bpm);
  push([0x00, 0xFF, 0x51, 0x03, (us>>16)&255, (us>>8)&255, us&255]);
  if (drums) push([0x00, 0xFF, 0x03, 0x03, 0x6b, 0x69, 0x74]);
  ev.forEach(e => {
    push(vlq(e.t - last)); last = e.t; push(e.d);
  });
  push([0x00, 0xFF, 0x2F, 0x00]);
  return bytes;
}
function midiFile(tracks){
  const out = [0x4d,0x54,0x68,0x64,0x00,0x00,0x00,0x06,0x00,0x01, (tracks.length>>8)&255, tracks.length&255, 0x01, 0xE0];
  tracks.forEach(tr => {
    out.push(0x4d,0x54,0x72,0x6b, (tr.length>>24)&255, (tr.length>>16)&255, (tr.length>>8)&255, tr.length&255);
    tr.forEach(b => out.push(b));
  });
  return out;
}

async function unlock(){
  const key = $("license").value.trim();
  if (!key){ $("licenseStatus").textContent = "Paste a license key"; return; }
  $("licenseStatus").textContent = "Checking Lemon Squeezy…";
  try {
    const r = await fetch("https://api.lemonsqueezy.com/v1/licenses/validate", {
      method: "POST",
      headers: { "Accept": "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ license_key: key })
    });
    const data = await r.json();
    if (data && data.valid){
      state.unlocked = true; saveState();
      $("licenseStatus").textContent = "Unlocked · " + (data.meta && data.meta.product_name || "license");
      return;
    }
    $("licenseStatus").textContent = "Key not valid for export";
  } catch (e) {
    $("licenseStatus").textContent = "License host unreachable. Export stays locked.";
  }
}

function bind(){
  if (!$("key").options.length){
    KEYS.forEach(k => {
      const o = document.createElement("option");
      o.value = k; o.textContent = k;
      $("key").appendChild(o);
    });
  }
  $("key").value = state.key;
  $("bpm").value = state.bpm;
  $("chords").value = state.chords;
  $("bars").value = String(state.bars);
  $("grooves").innerHTML = "";
  GROOVES.forEach(g => {
    const b = document.createElement("button");
    b.textContent = g.name;
    b.className = state.groove === g.id ? "on" : "";
    b.onclick = () => {
      state.groove = g.id; state.bpm = g.bpm; state.chords = g.chords;
      $("bpm").value = g.bpm; $("chords").value = g.chords;
      saveState(); paint(); bind();
    };
    $("grooves").appendChild(b);
  });
  $("recipes").innerHTML = "";
  RECIPES.forEach(r => {
    const b = document.createElement("button");
    b.textContent = r.name;
    b.className = state.recipe === r.id ? "on" : "";
    b.onclick = () => { state.recipe = r.id; saveState(); paint(); bind(); };
    $("recipes").appendChild(b);
  });
  $("mutes").innerHTML = "";
  CHAIRS.forEach(c => {
    const b = document.createElement("button");
    b.textContent = (state.mute[c] ? "Mute " : "") + c;
    b.className = state.mute[c] ? "on" : "";
    b.onclick = () => { state.mute[c] = !state.mute[c]; saveState(); bind(); };
    $("mutes").appendChild(b);
  });
  paint();
}

let booted = false;
async function boot(){
  ensureAudio();
  if (!booted){
    booted = true;
    $("status").textContent = "Seating chairs…";
    await loadSamples();
  }
}

loadState();
if (state.unlocked) $("licenseStatus").textContent = "Unlocked on this browser";
["bpm","key","chords","bars"].forEach(id => {
  $(id).onchange = () => {
    state.bpm = Math.max(60, Math.min(180, parseInt($("bpm").value, 10) || 98));
    state.key = $("key").value;
    state.chords = $("chords").value;
    state.bars = parseInt($("bars").value, 10);
    saveState(); paint();
  };
});
$("playA").onclick = async () => { await boot(); start("A"); };
$("playB").onclick = async () => { await boot(); start("B"); };
$("stop").onclick = stopAll;
$("wav").onclick = () => renderWav(false);
$("wavTail").onclick = () => renderWav(true);
$("mid").onclick = writeMidi;
$("copy").onclick = () => navigator.clipboard.writeText(punchText());
$("unlock").onclick = unlock;
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") stopAll();
});
bind();
$("status").textContent = "Tap A or B to start audio";
