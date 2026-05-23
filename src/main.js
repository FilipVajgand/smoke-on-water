import { bindControls } from "./app/controls.js";
import { DEFAULT_IMAGE, EFFECT_DEFAULTS } from "./app/defaults.js";
import { makeFallbackImage } from "./app/fallbackImage.js";
import { PearlBubbleEffect } from "./effects/pearl/PearlBubbleEffect.js";
import "./styles.css";

const effect = new PearlBubbleEffect(document.querySelector("#pearl-canvas"), {
  maxParticles: 65536,
  sampleStep: EFFECT_DEFAULTS.density,
  size: EFFECT_DEFAULTS.size,
  separation: EFFECT_DEFAULTS.separation,
  cursorArea: EFFECT_DEFAULTS.cursorArea,
  smoke: EFFECT_DEFAULTS.smoke,
  smoothness: EFFECT_DEFAULTS.smoothness,
  pulseScale: EFFECT_DEFAULTS.pulseScale,
  glowScale: EFFECT_DEFAULTS.glowScale,
  filterOverlay: EFFECT_DEFAULTS.filterOverlay,
  debug: false,
});

bindControls({
  controlsPanel: document.querySelector("#controls-panel"),
  controlsToggle: document.querySelector("#controls-toggle"),
  debugLabels: document.querySelector("#debug-labels"),
  defaults: EFFECT_DEFAULTS,
  effect,
});

effect.setImage(DEFAULT_IMAGE).catch(() => {
  effect.setImage(makeFallbackImage());
});
