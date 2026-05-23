attribute vec3 particleColor;
attribute vec4 randoms;

uniform float uTime;
uniform float uDpr;
uniform float uSize;
uniform vec2 uViewport;
uniform vec2 uPulsePoint;
uniform vec2 uPulseDir;
uniform float uPulseStrength;
uniform float uPulseScale;
uniform float uSmoothness;
uniform sampler2D uPositionTexture;
uniform sampler2D uFluidVelocity;
uniform sampler2D uFluidMask;

varying vec3 vColor;
varying vec4 vRandom;
varying float vInfluence;

void main() {
  vec3 p = texture2D(uPositionTexture, position.xy).xyz;
  vec2 screenUv = p.xy / uViewport + 0.5;
  vec2 fluid = texture2D(uFluidVelocity, screenUv).xy;
  float rawFluidMask = texture2D(uFluidMask, screenUv).r;
  float fluidMask = smoothstep(0.015, 0.52, rawFluidMask);
  float fluidEdge = clamp(pow(abs(fluid.x) * 0.014, 2.0), 0.0, 1.0);
  vec2 pulseDir = normalize(uPulseDir + vec2(0.0001));
  vec2 pulseTangent = vec2(-pulseDir.y, pulseDir.x);
  vec2 pulseRel = p.xy - uPulsePoint;
  float pulseAhead = dot(pulseRel, pulseDir);
  float pulseSide = dot(pulseRel, pulseTangent);
  float pulseBody = smoothstep(-42.0, -6.0, pulseAhead) *
    smoothstep(92.0, 12.0, pulseAhead) *
    smoothstep(42.0, 0.0, abs(pulseSide));
  float pulseCrest = smoothstep(18.0, 0.0, abs(pulseAhead - 22.0)) *
    smoothstep(48.0, 0.0, abs(pulseSide));
  float pulseInfluence = uPulseStrength * uPulseScale * (pulseBody * 0.4 + pulseCrest * 0.64);
  float fluidInfluence = max(fluidEdge, fluidMask);

  vColor = particleColor;
  vRandom = randoms;
  vInfluence = max(fluidInfluence, pulseInfluence);

  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  float shimmer = 1.0 + sin(uTime * 3.0 + randoms.x * 40.0) * 0.08;
  float sizeRandom = mix(0.5, 1.5, randoms.x);
  gl_PointSize = uSize * uDpr * shimmer * sizeRandom * (900.0 / length(mvPosition.xyz));
  gl_Position = projectionMatrix * mvPosition;
}
