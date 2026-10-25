// The browser host for the Rust game (rust/game): it loads the wasm, feeds it the clock and the buttons, and shows
// the 320x180 frame it draws. Everything else happens in Rust.
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

// If the game ever stops with an error, say so and offer a way back in, rather than leaving a frozen screen.
function crashed() {
  if (document.getElementById('crash')) return;
  const box = document.createElement('div');
  box.id = 'crash';
  box.style.cssText = 'position:fixed;inset:0;z-index:30;display:flex;flex-direction:column;gap:16px;align-items:center;justify-content:center;padding:24px;background:rgba(16,16,24,0.94);color:#c8d2f0;font:600 16px -apple-system,system-ui,sans-serif;text-align:center';
  const msg = document.createElement('div');
  msg.textContent = 'Something went wrong and the game stopped. Your last save is safe.';
  const b = document.createElement('button');
  b.textContent = 'Reload';
  b.style.cssText = 'font:700 16px -apple-system,system-ui,sans-serif;padding:12px 18px;border-radius:10px;border:0;background:#4f7cff;color:#fff';
  b.onclick = () => location.reload();
  box.append(msg, b);
  document.body.appendChild(box);
}
addEventListener('error', (e) => e.error instanceof WebAssembly.RuntimeError && crashed());
addEventListener('unhandledrejection', (e) => e.reason instanceof WebAssembly.RuntimeError && crashed());

async function main() {
  await gate();
  const canvas = document.getElementById('screen');
  const ctx = canvas.getContext('2d');
  const dec = new TextDecoder(), enc = new TextEncoder();
  let mem, ex, pending = null;
  const str = (p, n) => dec.decode(new Uint8Array(mem.buffer, p, n));
  const env = {
    host_log: (p, n) => console.log(str(p, n)),
    host_storage_get: (kp, kn) => {
      const v = localStorage.getItem(str(kp, kn));
      if (v === null) return -1;
      pending = enc.encode(v);
      return pending.length;
    },
    host_storage_read: (dst) => {
      new Uint8Array(mem.buffer, dst, pending.length).set(pending);
      pending = null;
    },
    host_storage_set: (kp, kn, vp, vn) => localStorage.setItem(str(kp, kn), str(vp, vn)),
    host_random: () => Math.random(),
    host_time: () => Date.now(),
    host_tz: () => new Date().getTimezoneOffset(),
    host_download: (np, nn, tp, tn) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([str(tp, tn)], { type: 'application/json' }));
      a.download = str(np, nn);
      a.click();
    },
    host_prompt: (mp, mn, dp, dn) => {
      const v = window.prompt(str(mp, mn), str(dp, dn));
      if (v === null) return -1;
      pending = enc.encode(v);
      return pending.length;
    },
  };
  const res = await fetch('tempora.wasm');
  const { instance } = await WebAssembly.instantiate(await res.arrayBuffer(), { env });
  ex = instance.exports;
  mem = ex.memory;
  const q = enc.encode(location.search);
  const qp = ex.args_buffer(q.length);
  new Uint8Array(mem.buffer, qp, q.length).set(q);
  ex.init();
  window.__rust = ex;
  const loop = (t) => {
    try {
      ex.frame(t);
    } catch (e) {
      crashed();
      throw e;
    }
    const fb = ex.framebuffer();
    ctx.putImageData(new ImageData(new Uint8ClampedArray(mem.buffer, fb, W * H * 4), W, H), 0, 0);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  // sound: the game synthesises it (rust/game/src/audio.rs); here we only hand its samples to the speakers. Browsers
  // allow audio only after a touch or a key, so it starts on the first one.
  let audio = null;
  const startAudio = () => {
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
    node.onaudioprocess = (e) => {
      const out = e.outputBuffer.getChannelData(0);
      out.set(new Float32Array(mem.buffer, ex.audio_fill(out.length), out.length));
    };
    node.connect(audio.destination);
    ex.audio_start(audio.sampleRate);
    if (audio.state === 'suspended') audio.resume();
  };
  for (const ev of ['keydown', 'pointerdown', 'touchstart']) addEventListener(ev, startAudio, { capture: true, passive: true });
  addEventListener('keydown', (e) => {
    if (e.code === 'KeyF') return ex.fast(1);
    const c = KEYS[e.code];
    if (c !== undefined) {
      ex.key(c, 1);
      e.preventDefault();
    }
  });
  addEventListener('keyup', (e) => {
    if (e.code === 'KeyF') return ex.fast(0);
    const c = KEYS[e.code];
    if (c !== undefined) ex.key(c, 0);
  });
  // touching the screen itself: taps walk you somewhere or pick a menu item
  canvas.style.touchAction = 'none';
  const toGame = (e) => {
    const r = canvas.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
  };
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    ex.pointer(0, ...toGame(e));
  });
  canvas.addEventListener('pointermove', (e) => ex.pointer(1, ...toGame(e)));
  canvas.addEventListener('pointerup', (e) => ex.pointer(2, ...toGame(e)));
  canvas.addEventListener('pointercancel', (e) => ex.pointer(2, -999, -999));
  addEventListener('blur', () => { for (let k = 0; k < 8; k++) ex.key(k, 0); });
  // the touch pad
  if ('ontouchstart' in window) document.body.classList.add('touch');
  for (const b of document.querySelectorAll('#pad .btn')) {
    const k = Number(b.dataset.k);
    const on = (e) => { e.preventDefault(); b.classList.add('on'); ex.key(k, 1); };
    const off = (e) => { e.preventDefault(); b.classList.remove('on'); ex.key(k, 0); };
    b.addEventListener('touchstart', on, { passive: false });
    b.addEventListener('touchend', off, { passive: false });
    b.addEventListener('touchcancel', off, { passive: false });
  }
}
main();
