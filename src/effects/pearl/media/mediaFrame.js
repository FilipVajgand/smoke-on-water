export { getImageFrame, getMediaWidth, getMediaHeight };



function getImageFrame(image, width, height) {
  const maxW = width * 0.86;
  const maxH = height * 0.76;
  const imageWidth = getMediaWidth(image);
  const imageHeight = getMediaHeight(image);
  const scale = Math.min(maxW / imageWidth, maxH / imageHeight);

  return {
    width: Math.max(1, Math.floor(imageWidth * scale)),
    height: Math.max(1, Math.floor(imageHeight * scale)),
  };
}

function getMediaWidth(media) {
  return media.videoWidth || media.naturalWidth || media.width || 1;
}

function getMediaHeight(media) {
  return media.videoHeight || media.naturalHeight || media.height || 1;
}
