// Quantized Phantom Phase input. Pure functions, no DOM, no clock.
// Sticky edges and tap-for-center are applied by the sim, which holds slot
// until a new command arrives. This module only classifies a gesture.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PHANTOM_INPUT = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const CMD = { NONE: 0, TOP: 1, RIGHT: 2, BOTTOM: 3, LEFT: 4, CENTER: 5 };
  const TAP_DIST = 22;
  const TAP_MS = 280;
  const SWIPE_DIST = 28;
  const STICK_DEAD = 0.55;
  const STICK_RELEASE = 0.28;

  function commandFromKey(code) {
    switch (code) {
      case 'ArrowUp':
      case 'KeyW':
        return CMD.TOP;
      case 'ArrowRight':
      case 'KeyD':
        return CMD.RIGHT;
      case 'ArrowDown':
      case 'KeyS':
        return CMD.BOTTOM;
      case 'ArrowLeft':
      case 'KeyA':
        return CMD.LEFT;
      case 'Space':
      case 'KeyC':
      case 'ShiftLeft':
      case 'ShiftRight':
        return CMD.CENTER;
      default:
        return CMD.NONE;
    }
  }

  // Screen y grows downward. Travel under the swipe threshold is a center tap
  // when the touch is short. A longer hold with no swipe is ignored.
  function commandFromSwipe(dx, dy, dist, elapsedMs) {
    if (dist >= SWIPE_DIST) {
      if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? CMD.RIGHT : CMD.LEFT;
      return dy > 0 ? CMD.BOTTOM : CMD.TOP;
    }
    if (elapsedMs <= TAP_MS) return CMD.CENTER;
    return CMD.NONE;
  }

  function freshPad() {
    return { buttons: [], xLatch: 0, yLatch: 0 };
  }

  function axisLatch(value, latch, negativeCmd, positiveCmd) {
    const mag = Math.abs(value);
    if (latch) {
      if (mag < STICK_RELEASE) return { latch: 0, command: CMD.NONE, consumed: false };
      return { latch, command: CMD.NONE, consumed: true };
    }
    if (value > STICK_DEAD) return { latch: 1, command: positiveCmd, consumed: true };
    if (value < -STICK_DEAD) return { latch: -1, command: negativeCmd, consumed: true };
    return { latch: 0, command: CMD.NONE, consumed: false };
  }

  function stickCommand(prev, axes) {
    const x = Number(axes && axes[0]) || 0;
    const y = Number(axes && axes[1]) || 0;
    const xMag = Math.abs(x);
    const yMag = Math.abs(y);
    let xLatch = prev.xLatch || 0;
    let yLatch = prev.yLatch || 0;
    let command = CMD.NONE;
    if (xMag >= yMag) {
      const flick = axisLatch(x, xLatch, CMD.LEFT, CMD.RIGHT);
      xLatch = flick.latch;
      command = flick.command;
      const cross = axisLatch(y, yLatch, CMD.TOP, CMD.BOTTOM);
      yLatch = cross.latch;
      if (command) {
        // A diagonal still consumes the other axis so it cannot fire next poll.
        if (!yLatch && Math.abs(y) > STICK_DEAD) yLatch = y > 0 ? 1 : -1;
      }
    } else {
      const flick = axisLatch(y, yLatch, CMD.TOP, CMD.BOTTOM);
      yLatch = flick.latch;
      command = flick.command;
      const cross = axisLatch(x, xLatch, CMD.LEFT, CMD.RIGHT);
      xLatch = cross.latch;
      if (command && !xLatch && Math.abs(x) > STICK_DEAD) xLatch = x > 0 ? 1 : -1;
    }
    return { command, xLatch, yLatch };
  }

  function buttonDown(buttons, index) {
    const button = buttons && buttons[index];
    if (!button) return false;
    if (typeof button === 'boolean') return button;
    return !!button.pressed;
  }

  // D-pad rising edges and the south / A button. The stick is the fallback.
  function pollGamepad(prev, pad) {
    const prior = prev || freshPad();
    const buttons = (pad && pad.buttons) || [];
    const axes = (pad && pad.axes) || [0, 0];
    const was = prior.buttons || [];
    const rising = (index) => buttonDown(buttons, index) && !was[index];
    let command = CMD.NONE;
    if (rising(12)) command = CMD.TOP;
    else if (rising(15)) command = CMD.RIGHT;
    else if (rising(13)) command = CMD.BOTTOM;
    else if (rising(14)) command = CMD.LEFT;
    else if (rising(0)) command = CMD.CENTER;
    const stick = stickCommand(prior, axes);
    if (!command) command = stick.command;
    const nextButtons = [];
    for (let i = 0; i < 16; i++) nextButtons[i] = buttonDown(buttons, i);
    return {
      command,
      state: { buttons: nextButtons, xLatch: stick.xLatch, yLatch: stick.yLatch },
    };
  }

  return {
    CMD, TAP_DIST, TAP_MS, SWIPE_DIST,
    commandFromKey, commandFromSwipe, pollGamepad, freshPad,
  };
});
