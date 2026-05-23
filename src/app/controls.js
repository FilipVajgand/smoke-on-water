export { bindControls };

function bindControls({ controlsPanel, controlsToggle, debugLabels, defaults, effect }) {
  syncControls(defaults);

  document.querySelector("#density").addEventListener("input", (event) => {
    effect.setDensity(event.target.value);
  });

  document.querySelector("#size").addEventListener("input", (event) => {
    effect.setSize(event.target.value);
  });

  document.querySelector("#separation").addEventListener("input", (event) => {
    effect.setSeparation(event.target.value);
  });

  document.querySelector("#cursor-area").addEventListener("input", (event) => {
    effect.setCursorArea(event.target.value);
  });

  document.querySelector("#smoke").addEventListener("input", (event) => {
    effect.setSmoke(event.target.value);
  });

  document.querySelector("#smoothness").addEventListener("input", (event) => {
    effect.setSmoothness(event.target.value);
  });

  document.querySelector("#pulse-scale").addEventListener("input", (event) => {
    effect.setPulseScale(event.target.value);
  });

  document.querySelector("#glow-scale").addEventListener("input", (event) => {
    effect.setGlowScale(event.target.value);
  });

  document.querySelector("#filter-overlay").addEventListener("change", (event) => {
    effect.setFilterOverlay(event.target.checked);
  });

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
  document.querySelector("#smoke").value = defaults.smoke;
  document.querySelector("#smoothness").value = defaults.smoothness;
  document.querySelector("#pulse-scale").value = defaults.pulseScale;
  document.querySelector("#glow-scale").value = defaults.glowScale;
  document.querySelector("#filter-overlay").checked = defaults.filterOverlay;
  document.querySelector("#debug").checked = false;
}
