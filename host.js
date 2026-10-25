// The browser host for the Bevy build of the game (rust/app): it loads the wasm, passes in the buttons (keys and the
// on-screen pad), the finger on the screen and the sound card's requests for samples. Bevy draws into the page's
// canvas itself. Browsers without WebGL2 get the light build (lite/) instead.
import init, { press, touch, fast, at_title, sound_start, sound_fill } from './tempora.js';

const W = 320, H = 180;
const KEYS = { ArrowUp: 0, ArrowDown: 1, ArrowLeft: 2, ArrowRight: 3, KeyW: 0, KeyS: 1, KeyA: 2, KeyD: 3, KeyZ: 4, Space: 4, KeyJ: 4, KeyX: 5, Backspace: 5, Escape: 5, KeyK: 5, Enter: 6, ShiftLeft: 7, ShiftRight: 7 };
const UP = 0, DOWN = 1, LEFT = 2, RIGHT = 3, A = 4, B = 5, START = 6, SELECT = 7;

// The same light password gate as the main game (src/gate.ts): unlocking either unlocks both.
const GATE = '0543607d65abbb0de222730d0c26df5ec268dde404758071d9cc8403c1c3815b';
async function sha256(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function gate() {
  if (location.hostname === '127.0.0.1' || location.hostname === 'localhost' || localStorage.getItem('crystal-auth') === GATE) return Promise.resolve();
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#101018;z-index:10;font-family:-apple-system,system-ui,sans-serif';
    wrap.innerHTML = '<form style="display:flex;flex-direction:column;gap:12px;width:260px;text-align:center;color:#c8d2f0"><div style="font-size:22px;font-weight:700;color:#ffd23f">CRYSTAL</div><input type="password" autocomplete="current-password" placeholder="Password" style="font-size:18px;padding:12px;border-radius:10px;border:2px solid #3a4470;background:#1c2038;color:#fff;text-align:center"><button style="font-size:17px;padding:12px;border-radius:10px;border:0;background:#4f7cff;color:#fff;font-weight:700">Play</button><div class="err" style="color:#f08080;min-height:18px;font-size:14px"></div></form>';
    document.body.appendChild(wrap);
    const input = wrap.querySelector('input');
    wrap.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      if ((await sha256(input.value.trim())) === GATE) {
        localStorage.setItem('crystal-auth', GATE);
        wrap.remove();
        resolve();
      } else wrap.querySelector('.err').textContent = 'Wrong password';
    });
    input.focus();
  });
}

let ready = false;
const send = (k, down) => ready && press(k, down);

// If the game ever stops with an error, say so and offer a way back in, rather than leaving a frozen screen.
function crashed() {
  if (document.getElementById('crash')) return;
  const box = document.createElement('div');
  box.id = 'crash';
  box.style.cssText = 'position:fixed;inset:0;z-index:30;display:flex;flex-direction:column;gap:16px;align-items:center;justify-content:center;padding:24px;background:rgba(16,16,24,0.94);color:#c8d2f0;font:600 16px -apple-system,system-ui,sans-serif;text-align:center';
  const msg = document.createElement('div');
  msg.textContent = 'Something went wrong and the game stopped. Your last save is safe.';
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:12px';
  const button = (label, go) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'font:700 16px -apple-system,system-ui,sans-serif;padding:12px 18px;border-radius:10px;border:0;background:#4f7cff;color:#fff';
    b.onclick = go;
    row.appendChild(b);
  };
  button('Reload', () => location.reload());
  button('Light version', () => location.assign('lite/'));
  box.append(msg, row);
  document.body.appendChild(box);
}
addEventListener('error', (e) => e.error instanceof WebAssembly.RuntimeError && crashed());
addEventListener('unhandledrejection', (e) => e.reason instanceof WebAssembly.RuntimeError && crashed());

// ---------------------------------------------------------------- the on-screen pad (phones and tablets)
const isTouch = () => matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

function bindButton(el, k) {
  const down = (e) => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    el.classList.add('on');
    send(k, true);
    navigator.vibrate?.(8);
  };
  const up = (e) => {
    e.preventDefault();
    el.classList.remove('on');
    send(k, false);
  };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('lostpointercapture', up);
}

/** One finger on the cross: whichever arm it's over is held, and sliding to another arm switches. */
function bindDpad(el, lit) {
  let cur = null;
  const at = { [UP]: [50, 0], [DOWN]: [50, 100], [LEFT]: [0, 50], [RIGHT]: [100, 50] };
  const set = (d) => {
    if (d === cur) return;
    if (cur !== null) send(cur, false);
    cur = d;
    if (d !== null) {
      send(d, true);
      navigator.vibrate?.(6);
      lit.style.display = 'block';
      lit.style.left = at[d][0] + 'px';
      lit.style.top = at[d][1] + 'px';
    } else lit.style.display = 'none';
  };
  const move = (e) => {
    const r = el.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    if (Math.hypot(dx, dy) < 12) return set(null);
    set(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? RIGHT : LEFT) : dy > 0 ? DOWN : UP);
  };
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    move(e);
  });
  el.addEventListener('pointermove', (e) => el.hasPointerCapture(e.pointerId) && move(e));
  const end = () => set(null);
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('lostpointercapture', end);
}

const place = (id, x, y) => {
  const el = document.getElementById(id);
  el.style.left = Math.round(x) + 'px';
  el.style.top = Math.round(y) + 'px';
};

/** The screen and the controls for portrait or landscape, clear of the notch and the home bar. */
function layoutTouch() {
  const wrap = document.getElementById('wrap');
  const vw = window.innerWidth, vh = window.innerHeight;
  const safe = getComputedStyle(document.getElementById('safe'));
  const inset = (side) => parseFloat(safe[`padding${side}`]) || 0;
  const [top, right, bottom, left] = [inset('Top'), inset('Right'), inset('Bottom'), inset('Left')];
  let scale;
  if (vh > vw) {
    const y0 = Math.max(8, top);
    scale = Math.min(vw / W, ((vh - y0) * 0.55) / H);
    const cw = W * scale, ch = H * scale;
    Object.assign(wrap.style, { left: (vw - cw) / 2 + 'px', top: y0 + 'px', width: cw + 'px', height: ch + 'px' });
    const below = y0 + ch;
    // keep the controls together in the upper part of the free space (easy thumb reach, no dead gap)
    const cy = below + Math.min((vh - bottom - below) * 0.42, 210);
    place('dpad', 20, cy - 75);
    place('bA', vw - 20 - 68, cy - 62);
    place('bB', vw - 20 - 68 - 74, cy - 6);
    place('bSel', vw / 2 - 82, cy + 110);
    place('bSt', vw / 2 + 8, cy + 110);
    place('bFF', vw / 2 - 23, below + 14);
  } else {
    // leave gutters at the sides for the controls
    const gutter = 168;
    const x0 = Math.max(9, left), x1 = vw - Math.max(12, right);
    scale = Math.min((vw - gutter * 2) / W, vh / H);
    if (scale * W < vw * 0.45) scale = Math.min(vw / W, vh / H);
    const cw = W * scale, ch = H * scale;
    Object.assign(wrap.style, { left: (vw - cw) / 2 + 'px', top: (vh - ch) / 2 + 'px', width: cw + 'px', height: ch + 'px' });
    const midY = vh / 2;
    place('dpad', x0, midY - 60);
    place('bA', x1 - 66, midY - 50);
    place('bB', x1 - 66 - 74, midY + 10);
    place('bSel', x0 + 5, Math.max(14, top));
    place('bSt', x1 - 2 - 70, Math.max(14, top));
    place('bFF', x0 + 17, vh - Math.max(14, bottom) - 28);
  }
}

function initTouch() {
  if (!isTouch()) return;
  document.body.classList.add('touch');
  bindDpad(document.getElementById('dpad'), document.getElementById('lit'));
  bindButton(document.getElementById('bA'), A);
  bindButton(document.getElementById('bB'), B);
  bindButton(document.getElementById('bSt'), START);
  bindButton(document.getElementById('bSel'), SELECT);
  const ff = document.getElementById('bFF');
  ff.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const on = !ff.classList.contains('on');
    ff.classList.toggle('on', on);
    if (ready) fast(on);
  });
  addEventListener('resize', layoutTouch);
  addEventListener('orientationchange', () => setTimeout(layoutTouch, 200));
  layoutTouch();
  // no rubber-banding or double-tap zoom
  document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('dblclick', (e) => e.preventDefault());
}

// ---------------------------------------------------------------- offline play
function initOffline() {
  if (!('serviceWorker' in navigator) || location.hostname === '127.0.0.1' || location.hostname === 'localhost') return;
  const sw = navigator.serviceWorker;
  // a newer build took over: switch to it straight away if nobody's playing yet (otherwise on the next launch)
  const hadController = !!sw.controller;
  sw.addEventListener('controllerchange', () => hadController && ready && at_title() && location.reload());
  sw.register('./sw.js')
    .then((reg) => {
      // home-screen apps can sit suspended for days: look for a new build whenever the game comes back
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && reg.update().catch(() => {}));
      navigator.storage?.persist?.().catch(() => {});
    })
    .catch(() => {});
}

async function main() {
  // no WebGL2, no GPU effects: the light build draws the same game on a plain canvas
  if (!document.createElement('canvas').getContext('webgl2')) {
    location.replace('lite/' + location.search);
    return;
  }
  initOffline();
  await gate();
  const canvas = document.getElementById('screen');
  initTouch();
  // the buttons and the screen are wired up before the game starts, so nothing is missed
  addEventListener('keydown', (e) => {
    if (e.code === 'KeyF') {
      if (ready) fast(true);
      return;
    }
    const c = KEYS[e.code];
    if (c !== undefined) {
      send(c, true);
      e.preventDefault();
    }
  });
  addEventListener('keyup', (e) => {
    if (e.code === 'KeyF') {
      if (ready) fast(false);
      return;
    }
    const c = KEYS[e.code];
    if (c !== undefined) send(c, false);
  });
  canvas.style.touchAction = 'none';
  const toGame = (e) => {
    const r = canvas.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
  };
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    if (ready) touch(0, ...toGame(e));
  });
  canvas.addEventListener('pointermove', (e) => ready && touch(1, ...toGame(e)));
  canvas.addEventListener('pointerup', (e) => ready && touch(2, ...toGame(e)));
  canvas.addEventListener('pointercancel', () => ready && touch(2, -999, -999));
  addEventListener('blur', () => {
    if (!ready) return;
    for (let k = 0; k < 8; k++) press(k, false);
    fast(false);
    document.getElementById('bFF')?.classList.remove('on');
  });
  // sound: the game synthesises it; here we only hand its samples to the speakers. Browsers allow audio only after a
  // touch or a key, so it starts on the first one.
  let audio = null;
  const startAudio = () => {
    if (!ready) return;
    if (audio) {
      if (audio.state === 'suspended') audio.resume();
      return;
    }
    try {
      audio = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return;
    }
    const node = audio.createScriptProcessor(2048, 0, 1);
    node.onaudioprocess = (e) => e.outputBuffer.getChannelData(0).set(sound_fill(e.outputBuffer.length));
    node.connect(audio.destination);
    sound_start(audio.sampleRate);
    if (audio.state === 'suspended') audio.resume();
  };
  for (const ev of ['keydown', 'pointerdown', 'touchstart']) addEventListener(ev, startAudio, { capture: true, passive: true });
  // Bevy's event loop doesn't return the usual way (it may throw to hand control back to the browser): that's expected
  try {
    await init();
  } catch (e) {
    if (!String(e).includes('Using exceptions for control flow')) {
      document.getElementById('loading').innerHTML = 'The game could not start here. <a href="lite/" style="color:#8ab4ff;pointer-events:auto">Play the light version</a>';
      throw e;
    }
  }
  ready = true;
  document.getElementById('loading')?.remove();
}
main();
