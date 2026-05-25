export { bindControls };

function bindControls({ controlsPanel, controlsToggle, debugLabels, defaults, effect }) {
  syncControls(defaults);

  bindRange("#density", effect.setDensity.bind(effect));
  bindRange("#size", effect.setSize.bind(effect));
  bindRange("#separation", effect.setSeparation.bind(effect));
  bindRange("#cursor-area", effect.setCursorArea.bind(effect));
  bindRange("#reveal-hold", effect.setRevealHold.bind(effect));
  bindRange("#reveal-depth", effect.setRevealDepth.bind(effect));
  bindRange("#smoke", effect.setSmoke.bind(effect));
  bindRange("#smoothness", effect.setSmoothness.bind(effect));
  bindRange("#pulse-scale", effect.setPulseScale.bind(effect));
  bindRange("#glow-scale", effect.setGlowScale.bind(effect));
  bindSelect("#effect-style", effect.setEffectStyle.bind(effect));
  bindToggle("#image-warp", effect.setImageWarp.bind(effect));
  bindToggle("#image-fade", effect.setImageFade.bind(effect));
  bindToggle("#arc-glow", effect.setArcGlow.bind(effect));
  bindToggle("#pearl-mask-reveal", effect.setPearlMaskReveal.bind(effect));
  bindToggle("#filter-overlay", effect.setFilterOverlay.bind(effect));

  document.querySelector("#debug").addEventListener("change", (event) => {
    effect.setDebug(event.target.checked);
    if (debugLabels) debugLabels.hidden = !event.target.checked;
  });

  controlsToggle.addEventListener("click", () => {
    const isHidden = controlsPanel.hidden;
    controlsPanel.hidden = !isHidden;
    controlsToggle.classList.toggle("is-closed", !isHidden);
    controlsToggle.setAttribute("aria-expanded", String(isHidden));
    controlsToggle.title = isHidden ? "Hide controls" : "Show controls";
  });

  document.querySelector("#image-file").addEventListener("change", async (event) => {
    const [file] = event.target.files;
    if (!file) return;

    const url = URL.createObjectURL(file);
    try {
      await effect.setImage(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  });
}

function syncControls(defaults) {
  document.querySelector("#density").value = defaults.density;
  document.querySelector("#size").value = defaults.size;
  document.querySelector("#separation").value = defaults.separation;
  document.querySelector("#cursor-area").value = defaults.cursorArea;
  document.querySelector("#effect-style").value = defaults.effectStyle;
  document.querySelector("#reveal-hold").value = defaults.revealHold;
  document.querySelector("#reveal-depth").value = defaults.revealDepth;
  document.querySelector("#smoke").value = defaults.smoke;
  document.querySelector("#smoothness").value = defaults.smoothness;
  document.querySelector("#image-warp").checked = defaults.imageWarp;
  document.querySelector("#image-fade").checked = defaults.imageFade;
  document.querySelector("#arc-glow").checked = defaults.arcGlow;
  document.querySelector("#pearl-mask-reveal").checked = defaults.pearlMaskReveal;
  document.querySelector("#filter-overlay").checked = defaults.filterOverlay;
  document.querySelector("#pulse-scale").value = defaults.pulseScale;
  document.querySelector("#glow-scale").value = defaults.glowScale;
  document.querySelector("#debug").checked = false;
}

function bindRange(selector, callback) {
  document.querySelector(selector).addEventListener("input", (event) => {
    callback(event.target.value);
  });
}

function bindSelect(selector, callback) {
  document.querySelector(selector).addEventListener("change", (event) => {
    callback(event.target.value);
  });
}

function bindToggle(selector, callback) {
  document.querySelector(selector).addEventListener("change", (event) => {
    callback(event.target.checked);
  });
}
