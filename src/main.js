import { bindControls } from "./app/controls.js";
import { DEFAULT_IMAGE, EFFECT_DEFAULTS } from "./app/defaults.js";
import { makeFallbackImage } from "./app/fallbackImage.js";
import { PearlBubbleEffect } from "./effects/pearl/PearlBubbleEffect.js";
import "./styles.css";

const effect = new PearlBubbleEffect(document.querySelector("#pearl-canvas"), {
  maxParticles: EFFECT_DEFAULTS.maxParticles,
  sampleStep: EFFECT_DEFAULTS.density,
  size: EFFECT_DEFAULTS.size,
  pearlTint: EFFECT_DEFAULTS.pearlTint,
  separation: EFFECT_DEFAULTS.separation,
  cursorArea: EFFECT_DEFAULTS.cursorArea,
  effectStyle: EFFECT_DEFAULTS.effectStyle,
  imageWarp: EFFECT_DEFAULTS.imageWarp,
  imageFade: EFFECT_DEFAULTS.imageFade,
  revealHold: EFFECT_DEFAULTS.revealHold,
  revealDepth: EFFECT_DEFAULTS.revealDepth,
  smoke: EFFECT_DEFAULTS.smoke,
  smoothness: EFFECT_DEFAULTS.smoothness,
  arcGlow: EFFECT_DEFAULTS.arcGlow,
  pearlMaskReveal: EFFECT_DEFAULTS.pearlMaskReveal,
  pulseScale: EFFECT_DEFAULTS.pulseScale,
  glowScale: EFFECT_DEFAULTS.glowScale,
  glowOpacity: EFFECT_DEFAULTS.glowOpacity,
  glowColor: EFFECT_DEFAULTS.glowColor,
  filterOverlay: EFFECT_DEFAULTS.filterOverlay,
  globalComposite: EFFECT_DEFAULTS.globalComposite,
  globalCompositeLayers: EFFECT_DEFAULTS.globalCompositeLayers,
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
