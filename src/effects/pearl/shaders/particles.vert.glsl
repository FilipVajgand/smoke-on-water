attribute vec3 particleColor;
attribute vec4 randoms;

uniform float uTime;
uniform float uDpr;
uniform float uSize;
uniform float uEffectStyle;
uniform vec2 uViewport;
uniform sampler2D uPositionTexture;
uniform sampler2D uFluidVelocity;
uniform sampler2D uFluidMask;

varying vec3 vColor;
varying vec4 vRandom;
varying float vMaskReveal;

void main() {
  vec3 p = texture2D(uPositionTexture, position.xy).xyz;
  vec2 screenUv = p.xy / uViewport + 0.5;
  vec2 fluid = texture2D(uFluidVelocity, screenUv).xy;
  float rawMask = texture2D(uFluidMask, screenUv).r;
  float fluidEdge = pow(abs(fluid.x) * 0.01, 2.0);

  vColor = particleColor;
  vRandom = randoms;
  vMaskReveal = max(
    smoothstep(0.035, 0.38, rawMask),
    smoothstep(0.015, 0.12, fluidEdge)
  );

  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  float shimmer = 1.0 + sin(uTime * 3.0 + randoms.x * 40.0) * 0.08;
  float sizeRandom = mix(0.5, 1.5, randoms.x);
  float silkStyle = smoothstep(1.0, 2.0, uEffectStyle);
  gl_PointSize = uSize * uDpr * shimmer * sizeRandom * mix(1.0, 0.76, silkStyle) * (900.0 / length(mvPosition.xyz));
  gl_Position = projectionMatrix * mvPosition;
}
