export { makeFallbackImage };

function makeFallbackImage() {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 720;
  const context = canvas.getContext("2d");
  const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);

  gradient.addColorStop(0, "#f7d7b2");
  gradient.addColorStop(0.45, "#416d83");
  gradient.addColorStop(1, "#11131a");

  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgba(255,255,255,0.86)";
  context.font = "700 190px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("PEARL", canvas.width / 2, canvas.height / 2);

  return canvas.toDataURL("image/png");
}
