// The browser host for the Rust game (rust/game): it loads the wasm, feeds it the clock and the buttons, and shows
// the 320x180 frame it draws. Everything else happens in Rust.
const W = 320, H = 180;
const KEYS = { ArrowUp: 0, ArrowDown: 1, ArrowLeft: 2, ArrowRight: 3, KeyW: 0, KeyS: 1, KeyA: 2, KeyD: 3, KeyZ: 4, Space: 4, KeyX: 5, Backspace: 5, Enter: 6, ShiftRight: 7 };

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
    ex.frame(t);
    const fb = ex.framebuffer();
    ctx.putImageData(new ImageData(new Uint8ClampedArray(mem.buffer, fb, W * H * 4), W, H), 0, 0);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  addEventListener('keydown', (e) => {
    const c = KEYS[e.code];
    if (c !== undefined) {
      ex.key(c, 1);
      e.preventDefault();
    }
  });
  addEventListener('keyup', (e) => {
    const c = KEYS[e.code];
    if (c !== undefined) ex.key(c, 0);
  });
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
