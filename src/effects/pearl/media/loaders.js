import * as THREE from "three";



export { loadJson, loadMedia, loadTexture };



function loadMedia(src) {
  return isVideoSource(src)
    ? loadVideo(src).then((element) => ({ element, isVideo: true }))
    : loadImage(src).then((element) => ({ element, isVideo: false }));
}

function isVideoSource(src) {
  return /\.(mp4|webm|mov)(?:[?#].*)?$/i.test(src);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function loadVideo(src) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.autoplay = true;
    video.preload = "auto";
    video.onloadeddata = () => {
      video.width = video.videoWidth;
      video.height = video.videoHeight;
      video.play().catch(() => {});
      resolve(video);
    };
    video.onerror = reject;
    video.src = src;
    video.load();
  });
}

async function loadTexture(src) {
  const image = await loadImage(src);
  const texture = new THREE.Texture(image);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

async function loadJson(src) {
  const response = await fetch(src);
  if (!response.ok) throw new Error(`Could not load ${src}`);
  return response.json();
}
