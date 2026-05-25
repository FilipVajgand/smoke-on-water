precision highp float;

uniform vec2 uViewport;
uniform vec2 uPulsePoint;
uniform vec2 uPulseDir;
uniform float uPulseStrength;
uniform float uPulseScale;
uniform float uGlowScale;
uniform float uArcGlow;
uniform sampler2D uFluidVelocity;
uniform sampler2D uFluidMask;

varying vec2 vUv;
varying vec2 vWorld;

float sourceFluidEdge(vec2 uv) {
  vec2 fluid = texture2D(uFluidVelocity, clamp(uv, vec2(0.0), vec2(1.0))).xy;
  float fluidMask = smoothstep(0.0, 1.0, texture2D(uFluidMask, clamp(uv, vec2(0.0), vec2(1.0))).r);
  float fluidPush = pow(abs(fluid.x) * 0.01, 2.0);
  return fluidPush * smoothstep(0.7, 0.0, abs(fluidMask - 0.5));
}

void main() {
  vec2 screenUv = vWorld / uViewport + 0.5;
  vec2 fluid = texture2D(uFluidVelocity, screenUv).xy;
  float mask = smoothstep(0.0, 1.0, texture2D(uFluidMask, screenUv).r);
  vec2 flowDir = normalize(fluid + vec2(0.0001));
  vec2 pulseDir = normalize(uPulseDir + vec2(0.0001));
  vec2 pulseTangent = vec2(-pulseDir.y, pulseDir.x);

  float arc = sourceFluidEdge(screenUv);
  vec2 nearRadius = vec2(10.0) / uViewport;
  vec2 wideRadius = vec2(22.0) / uViewport;

  float nearBloom = arc * 0.28;
  nearBloom += sourceFluidEdge(screenUv + vec2(nearRadius.x, 0.0)) * 0.12;
  nearBloom += sourceFluidEdge(screenUv - vec2(nearRadius.x, 0.0)) * 0.12;
  nearBloom += sourceFluidEdge(screenUv + vec2(0.0, nearRadius.y)) * 0.12;
  nearBloom += sourceFluidEdge(screenUv - vec2(0.0, nearRadius.y)) * 0.12;
  nearBloom += sourceFluidEdge(screenUv + nearRadius) * 0.08;
  nearBloom += sourceFluidEdge(screenUv - nearRadius) * 0.08;
  nearBloom += sourceFluidEdge(screenUv + vec2(nearRadius.x, -nearRadius.y)) * 0.08;
  nearBloom += sourceFluidEdge(screenUv + vec2(-nearRadius.x, nearRadius.y)) * 0.08;

  float wideBloom = sourceFluidEdge(screenUv + vec2(wideRadius.x, 0.0)) * 0.08;
  wideBloom += sourceFluidEdge(screenUv - vec2(wideRadius.x, 0.0)) * 0.08;
  wideBloom += sourceFluidEdge(screenUv + vec2(0.0, wideRadius.y)) * 0.08;
  wideBloom += sourceFluidEdge(screenUv - vec2(0.0, wideRadius.y)) * 0.08;
  wideBloom += sourceFluidEdge(screenUv + wideRadius) * 0.06;
  wideBloom += sourceFluidEdge(screenUv - wideRadius) * 0.06;

  float facing = smoothstep(-0.15, 0.75, dot(flowDir, pulseDir));
  vec2 pulseRel = vWorld - uPulsePoint;
  float pulseAhead = dot(pulseRel, pulseDir);
  float pulseSide = dot(pulseRel, pulseTangent);
  float crest = smoothstep(38.0, 0.0, abs(pulseAhead - 18.0)) *
    smoothstep(62.0, 0.0, abs(pulseSide));
  float motion = smoothstep(0.02, 0.65, length(fluid) * 0.01 + arc * 0.6);
  float frontArc = (arc * 0.9 + nearBloom * 0.42 + wideBloom * 0.22) *
    mix(0.36, 1.0, facing) *
    mix(0.72, 1.16, crest * uPulseStrength * uPulseScale);

  vec3 color = vec3(0.48, 0.68, 1.0) * frontArc * 0.44;
  color += vec3(0.92, 0.97, 1.0) * arc * facing * motion * 0.24;
  color += vec3(0.18, 0.34, 0.9) * wideBloom * 0.12;

  float alpha = clamp(frontArc * 0.34 + arc * facing * 0.18, 0.0, 0.45) *
    (0.58 + uPulseStrength * uPulseScale * 0.22) *
    uGlowScale;

  gl_FragColor = vec4(color * uArcGlow, alpha * uArcGlow);
}
