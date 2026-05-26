precision highp float;

uniform vec2 uViewport;
uniform float uTime;
uniform vec2 uPulsePoint;
uniform vec2 uPulseDir;
uniform float uPulseStrength;
uniform float uPulseScale;
uniform float uGlowScale;
uniform float uGlowOpacity;
uniform vec3 uGlowColor;
uniform float uArcGlow;
uniform sampler2D uFluidVelocity;
uniform sampler2D uFluidMask;
uniform sampler2D uFluidEnergy;

varying vec2 vWorld;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

vec3 sampleEnergy(vec2 uv) {
  return texture2D(uFluidEnergy, clamp(uv, vec2(0.0), vec2(1.0))).rgb;
}

void main() {
  vec2 screenUv = vWorld / uViewport + 0.5;
  vec2 fluid = texture2D(uFluidVelocity, screenUv).xy;
  float mask = texture2D(uFluidMask, screenUv).r;

  vec2 px = 1.0 / uViewport;
  float maskLeft = texture2D(uFluidMask, screenUv - vec2(px.x * 2.0, 0.0)).r;
  float maskRight = texture2D(uFluidMask, screenUv + vec2(px.x * 2.0, 0.0)).r;
  float maskDown = texture2D(uFluidMask, screenUv - vec2(0.0, px.y * 2.0)).r;
  float maskUp = texture2D(uFluidMask, screenUv + vec2(0.0, px.y * 2.0)).r;
  vec2 maskGradient = vec2(maskRight - maskLeft, maskUp - maskDown);
  float trailEdge = smoothstep(0.02, 0.16, length(maskGradient) * 2.6);
  float maskContain = smoothstep(0.045, 0.24, mask);
  float trailInterior = smoothstep(0.14, 0.68, mask) * (1.0 - trailEdge * 0.82);
  float centerLine = sqrt(smoothstep(0.1, 0.64, trailInterior));
  float centerToEdge = mix(0.16, 1.0, centerLine);

  vec2 wide = px * 12.0;
  vec2 wider = px * 24.0;
  vec3 core = sampleEnergy(screenUv);
  vec3 halo = core * 0.42;
  halo += sampleEnergy(screenUv + vec2(wide.x, 0.0)) * 0.18;
  halo += sampleEnergy(screenUv - vec2(wide.x, 0.0)) * 0.18;
  halo += sampleEnergy(screenUv + vec2(0.0, wide.y)) * 0.18;
  halo += sampleEnergy(screenUv - vec2(0.0, wide.y)) * 0.18;
  halo += sampleEnergy(screenUv + wide) * 0.1;
  halo += sampleEnergy(screenUv - wide) * 0.1;
  halo += sampleEnergy(screenUv + vec2(wider.x, 0.0)) * 0.07;
  halo += sampleEnergy(screenUv - vec2(wider.x, 0.0)) * 0.07;
  halo += sampleEnergy(screenUv + vec2(0.0, wider.y)) * 0.07;
  halo += sampleEnergy(screenUv - vec2(0.0, wider.y)) * 0.07;

  float rawCore = length(core);
  float dissolveNoise = noise(screenUv * uViewport * 0.16 + fluid * 0.0015 - uTime * 1.35);
  float centerDissolve = smoothstep(0.018 + dissolveNoise * 0.014, 0.11, rawCore);
  float hotDissolve = smoothstep(0.08 + dissolveNoise * 0.03, 0.28, rawCore);
  float edgeSuppress = maskContain * centerToEdge * (1.0 - trailEdge * 0.78);
  float coreAmount = pow(clamp(rawCore * 1.05, 0.0, 1.85), 0.62) * centerDissolve * edgeSuppress;
  float haloAmount = pow(clamp(length(halo) * 0.1, 0.0, 1.0), 2.1) *
    centerDissolve * mix(0.12, 1.0, centerLine) * edgeSuppress;
  float reveal = smoothstep(0.04, 0.42, mask);
  float motion = smoothstep(0.02, 0.42, length(fluid) * 0.006);
  float flow = max(reveal, motion * 0.18) * maskContain * centerToEdge;
  float shimmer = mix(0.88, 1.08, noise(screenUv * uViewport * 0.08 + fluid * 0.002 + uTime * 0.8));
  vec2 pulseDir = normalize(uPulseDir + vec2(0.0001));
  vec2 pulseTangent = vec2(-pulseDir.y, pulseDir.x);
  vec2 pulseRel = vWorld - uPulsePoint;
  float pulseForward = dot(pulseRel, pulseDir);
  float pulseSide = dot(pulseRel, pulseTangent);
  float pulseOuter = smoothstep(58.0, 8.0, length(vec2((pulseForward + 4.0) * 0.92, pulseSide * 1.12)));
  float pulseInner = smoothstep(34.0, 8.0, length(vec2((pulseForward + 22.0) * 1.08, pulseSide * 1.38)));
  float frontArc = clamp(pulseOuter - pulseInner * 0.74, 0.0, 1.0);
  frontArc *= smoothstep(-46.0, -6.0, pulseForward) * smoothstep(26.0, -3.0, pulseForward);
  float pulseActivation = uPulseStrength * uPulseScale;
  frontArc *= pulseActivation * maskContain * (1.0 - trailEdge * 0.35) * mix(0.2, 1.0, centerLine);
  frontArc = smoothstep(0.08, 0.58, frontArc);

  float hot = pow(clamp(coreAmount, 0.0, 1.0), 0.52) * hotDissolve;
  float sparkleNoise = noise(screenUv * uViewport * 0.32 + fluid * 0.001 + uTime * 4.2);
  float sparkle = smoothstep(0.72, 1.0, sparkleNoise + hot * 0.38) * hot;
  float glowControl = uGlowScale * uGlowOpacity * uArcGlow;
  vec3 glowTint = max(uGlowColor, vec3(0.0));
  vec3 coolGlow = mix(glowTint, vec3(0.58, 0.94, 1.0), 0.22);
  vec3 hotGlow = mix(glowTint, vec3(1.0), 0.68);
  vec3 color = glowTint * haloAmount * 0.04;
  color += mix(glowTint, coolGlow, 0.45) * coreAmount * 2.15;
  color += coolGlow * hot * 1.45;
  color += hotGlow * pow(hot, 1.55) * 0.62;
  color += mix(coolGlow, vec3(1.0), 0.36) * sparkle * 1.85;
  color *= shimmer * glowControl;

  float alpha = (haloAmount * 0.01 + coreAmount * 0.46 + hot * 0.44 + sparkle * 0.22) *
    flow * glowControl;
  float punch = smoothstep(0.06, 0.32, hot + coreAmount * 0.35);
  color *= flow * mix(0.5, 1.1, punch);
  color += mix(coolGlow, vec3(0.72, 0.95, 1.0), 0.42) * pow(punch, 2.4) * 0.46 * flow * glowControl;
  color += coolGlow * frontArc * glowControl * 0.62;
  color += hotGlow * pow(frontArc, 1.35) * glowControl * 1.28;
  float finalAlpha = clamp(alpha + punch * 0.28 * flow * glowControl + frontArc * glowControl * 0.26, 0.0, 1.0);
  gl_FragColor = vec4(color * 1.18, finalAlpha);
}
