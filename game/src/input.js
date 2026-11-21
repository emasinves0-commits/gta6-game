// Keyboard and mouse state. `down` is held keys, `pressed` is keys hit this frame.

export function createInput(canvas) {
  const input = {
    down: new Set(),
    pressed: new Set(),
    mouseX: 0,
    mouseY: 0,
    mouseDown: false,
    mouseClicked: false,
    onFirstGesture: null,
  };
  // Keys the browser would otherwise scroll or focus-shift on; we swallow them while playing.
  const BLOCKED = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab']);
  window.addEventListener('keydown', (e) => {
    if (BLOCKED.has(e.code)) e.preventDefault();
    if (!e.repeat) input.pressed.add(e.code);
    input.down.add(e.code);
    input.gesture();
  });
  window.addEventListener('keyup', (e) => input.down.delete(e.code));
  window.addEventListener('blur', () => { input.down.clear(); input.mouseDown = false; });
  canvas.addEventListener('mousemove', (e) => { input.mouseX = e.offsetX; input.mouseY = e.offsetY; });
  canvas.addEventListener('mousedown', (e) => {
    input.mouseX = e.offsetX; input.mouseY = e.offsetY;
    if (e.button === 0) { input.mouseDown = true; input.mouseClicked = true; }
    input.gesture();
  });
  window.addEventListener('mouseup', () => { input.mouseDown = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  input.gesture = () => { if (input.onFirstGesture) { const f = input.onFirstGesture; input.onFirstGesture = null; f(); } };
  input.isDown = (...codes) => codes.some((c) => input.down.has(c));
  input.wasPressed = (...codes) => codes.some((c) => input.pressed.has(c));
  input.endFrame = () => { input.pressed.clear(); input.mouseClicked = false; };
  return input;
}

// Stand-in input with nothing pressed (title-screen demos and headless tests).
export function createIdleInput() {
  return {
    down: new Set(), pressed: new Set(), mouseX: 0, mouseY: 0, mouseDown: false, mouseClicked: false,
    isDown: () => false, wasPressed: () => false, endFrame() {},
  };
}
