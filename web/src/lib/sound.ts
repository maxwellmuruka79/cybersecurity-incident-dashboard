import type { Severity } from "../types";

// Alert sounds are synthesised with the Web Audio API: no audio files needed.
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    ctx = ctx ?? new AudioContext();
    if (ctx.state === "suspended") void ctx.resume(); // browsers require a prior click on the page
    return ctx;
  } catch {
    return null;
  }
}

function beep(c: AudioContext, freq: number, start: number, dur: number, gain: number) {
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(gain, start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g);
  g.connect(c.destination);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

export function playAlertSound(severity: Severity) {
  const c = audio();
  if (!c) return;
  const t = c.currentTime;
  if (severity === "critical") {
    beep(c, 880, t, 0.18, 0.2);
    beep(c, 660, t + 0.22, 0.18, 0.2);
    beep(c, 880, t + 0.44, 0.28, 0.2);
  } else if (severity === "high") {
    beep(c, 740, t, 0.2, 0.15);
    beep(c, 740, t + 0.25, 0.2, 0.15);
  } else {
    beep(c, 520, t, 0.15, 0.1);
  }
}