// Keyboard + mouse state. Edge-triggered keys are consumed with pressed(); held keys read from keys.
export function createInput(canvas) {
  const keys = new Set();
  const edge = new Set();
  const input = { keys, mouse: { x: 640, y: 360, down: false, right: false, wheel: 0 }, locked: false };
  const norm = (e) => (e.code.startsWith('Key') ? e.code.slice(3).toLowerCase() : e.code.startsWith('Digit') ? e.code.slice(5) : e.code.toLowerCase());
  window.addEventListener('keydown', (e) => {
    const k = norm(e);
    if (['space', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'tab'].includes(k)) e.preventDefault();
    if (!keys.has(k)) edge.add(k);
    keys.add(k);
  });
  window.addEventListener('keyup', (e) => keys.delete(norm(e)));
  window.addEventListener('blur', () => { keys.clear(); input.mouse.down = false; });
  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    input.mouse.x = ((e.clientX - r.left) / r.width) * 1280;
    input.mouse.y = ((e.clientY - r.top) / r.height) * 720;
  });
  canvas.addEventListener('mousedown', (e) => { if (e.button === 0) input.mouse.down = true; if (e.button === 2) input.mouse.right = true; });
  window.addEventListener('mouseup', (e) => { if (e.button === 0) input.mouse.down = false; if (e.button === 2) input.mouse.right = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => { input.mouse.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
  input.pressed = (k) => edge.delete(k);
  input.down = (k) => keys.has(k);
  input.clearEdges = () => edge.clear();
  return input;
}
