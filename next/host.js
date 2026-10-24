// The browser host for the Bevy build of the game (rust/app): it loads the wasm, passes in the buttons, the finger
// on the screen and the sound card's requests for samples. Bevy draws into the page's canvas itself.
import init, { press, touch, sound_start, sound_fill } from './tempora.js';

const W = 320, H = 180;
const KEYS = { ArrowUp: 0, ArrowDown: 1, ArrowLeft: 2, ArrowRight: 3, KeyW: 0, KeyS: 1, KeyA: 2, KeyD: 3, KeyZ: 4, Space: 4, KeyJ: 4, KeyX: 5, Backspace: 5, Escape: 5, KeyK: 5, Enter: 6, ShiftLeft: 7, ShiftRight: 7 };

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

async function main() {
  await gate();
  const canvas = document.getElementById('screen');
  if ('ontouchstart' in window) document.body.classList.add('touch');
  // the buttons and the screen are wired up before the game starts, so nothing is missed
  addEventListener('keydown', (e) => {
    const c = KEYS[e.code];
    if (c !== undefined) {
      if (ready) press(c, true);
      e.preventDefault();
    }
  });
  addEventListener('keyup', (e) => {
    const c = KEYS[e.code];
    if (c !== undefined && ready) press(c, false);
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
  addEventListener('blur', () => { if (ready) for (let k = 0; k < 8; k++) press(k, false); });
  for (const b of document.querySelectorAll('#pad .btn')) {
    const k = Number(b.dataset.k);
    const on = (e) => { e.preventDefault(); b.classList.add('on'); if (ready) press(k, true); };
    const off = (e) => { e.preventDefault(); b.classList.remove('on'); if (ready) press(k, false); };
    b.addEventListener('touchstart', on, { passive: false });
    b.addEventListener('touchend', off, { passive: false });
    b.addEventListener('touchcancel', off, { passive: false });
  }
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
    if (!String(e).includes('Using exceptions for control flow')) throw e;
  }
  ready = true;
  document.getElementById('loading')?.remove();
}
let ready = false;
main();
