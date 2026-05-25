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

varying vec2 vWorld;

float sourceFluidEdge(vec2 uv) {
  vec2 fluid = texture2D(uFluidVelocity, clamp(uv, vec2(0.0), vec2(1.0))).xy;
  float fluidMask = smoothstep(0.0, 1.0, texture2D(uFluidMask, clamp(uv, vec2(0.0), vec2(1.0))).r);
  float fluidPush = clamp(pow(length(fluid) * 0.0065, 1.55), 0.0, 1.0);
  float maskBand = smoothstep(0.68, 0.08, abs(fluidMask - 0.46));
  return fluidPush * maskBand;
}

void main() {
  vec2 screenUv = vWorld / uViewport + 0.5;
  vec2 fluid = texture2D(uFluidVelocity, screenUv).xy;
  vec2 flowDir = normalize(fluid + vec2(0.0001));
  vec2 pulseDir = normalize(uPulseDir + vec2(0.0001));
  vec2 pulseTangent = vec2(-pulseDir.y, pulseDir.x);

  float arc = sourceFluidEdge(screenUv);
  vec2 nearRadius = vec2(7.0) / uViewport;
  vec2 wideRadius = vec2(16.0) / uViewport;

  float nearBloom = arc * 0.22;
  nearBloom += sourceFluidEdge(screenUv + vec2(nearRadius.x, 0.0)) * 0.075;
  nearBloom += sourceFluidEdge(screenUv - vec2(nearRadius.x, 0.0)) * 0.075;
  nearBloom += sourceFluidEdge(screenUv + vec2(0.0, nearRadius.y)) * 0.075;
  nearBloom += sourceFluidEdge(screenUv - vec2(0.0, nearRadius.y)) * 0.075;
  nearBloom += sourceFluidEdge(screenUv + nearRadius) * 0.045;
  nearBloom += sourceFluidEdge(screenUv - nearRadius) * 0.045;
  nearBloom += sourceFluidEdge(screenUv + vec2(nearRadius.x, -nearRadius.y)) * 0.045;
  nearBloom += sourceFluidEdge(screenUv + vec2(-nearRadius.x, nearRadius.y)) * 0.045;

  float wideBloom = sourceFluidEdge(screenUv + vec2(wideRadius.x, 0.0)) * 0.035;
  wideBloom += sourceFluidEdge(screenUv - vec2(wideRadius.x, 0.0)) * 0.035;
  wideBloom += sourceFluidEdge(screenUv + vec2(0.0, wideRadius.y)) * 0.035;
  wideBloom += sourceFluidEdge(screenUv - vec2(0.0, wideRadius.y)) * 0.035;
  wideBloom += sourceFluidEdge(screenUv + wideRadius) * 0.022;
  wideBloom += sourceFluidEdge(screenUv - wideRadius) * 0.022;

  float facing = smoothstep(-0.15, 0.75, dot(flowDir, pulseDir));
  vec2 pulseRel = vWorld - uPulsePoint;
  float pulseAhead = dot(pulseRel, pulseDir);
  float pulseSide = dot(pulseRel, pulseTangent);
  float crest = smoothstep(30.0, 0.0, abs(pulseAhead - 16.0)) *
    smoothstep(46.0, 0.0, abs(pulseSide));
  float motion = smoothstep(0.025, 0.5, length(fluid) * 0.006 + arc * 0.52);
  float frontArc = (arc * 0.72 + nearBloom * 0.26 + wideBloom * 0.08) *
    mix(0.28, 0.86, facing) *
    mix(0.68, 0.98, crest * uPulseStrength * uPulseScale);

  vec3 color = vec3(0.5, 0.72, 0.95) * frontArc * 0.26;
  color += vec3(0.78, 0.9, 1.0) * arc * facing * motion * 0.12;
  color += vec3(0.22, 0.42, 0.8) * wideBloom * 0.035;

  float alpha = clamp(frontArc * 0.2 + arc * facing * 0.08, 0.0, 0.24) *
    (0.42 + uPulseStrength * uPulseScale * 0.16) *
    uGlowScale;

  gl_FragColor = vec4(color * uArcGlow, alpha * uArcGlow);
}
