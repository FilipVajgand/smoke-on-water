varying vec2 vUv;
varying vec2 vWorld;

void main() {
  vUv = uv;
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorld = worldPosition.xy;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
