import * as THREE from "three";



export { makeParticleLookupPositions };



function makeParticleLookupPositions(count, textureSize) {
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count; i += 1) {
    const x = i % textureSize;
    const y = Math.floor(i / textureSize);
    const i3 = i * 3;
    positions[i3] = (x + 0.5) / textureSize;
    positions[i3 + 1] = (y + 0.5) / textureSize;
    positions[i3 + 2] = 0;
  }

  return positions;
}
