precision highp float;

uniform sampler2D uImage;
uniform float uTime;
uniform float uSmoke;
uniform vec2 uFrameSize;
uniform vec2 uViewport;
uniform float uSmoothness;
uniform float uGlowScale;
uniform float uGlowOpacity;
uniform vec3 uGlowColor;
uniform float uArcGlow;
uniform float uEffectStyle;
uniform float uImageWarp;
uniform float uImageFade;
uniform float uRevealDepth;
uniform float uFilterOverlay;
uniform sampler2D uFluidVelocity;
uniform sampler2D uFluidMask;
uniform sampler2D uFluidEnergy;

varying vec2 vUv;
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

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += noise(p) * a;
    p = p * 2.03 + 17.17;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 screenUv = vWorld / uViewport + 0.5;
  vec2 fluid = texture2D(uFluidVelocity, screenUv).xy;
  float rawFluidMask = texture2D(uFluidMask, screenUv).r;
  vec3 rawEnergy = texture2D(uFluidEnergy, screenUv).rgb;
  float smoothness = clamp(uSmoothness, 0.0, 1.0);
  float ultraSmooth = smoothstep(1.0, 2.0, uSmoothness);
  float megaSmooth = smoothstep(2.0, 4.0, uSmoothness);
  float maxSmooth = smoothstep(4.0, 8.0, uSmoothness);
  float styleAmount = clamp(uEffectStyle, 0.0, 2.0);
  float energyStyle = clamp(styleAmount, 0.0, 1.0);
  float silkStyle = smoothstep(1.0, 2.0, styleAmount);
  float softFluidStyle = max(energyStyle * 0.74, silkStyle);
  vec2 blurStep = vec2(mix(1.25, 9.5, softFluidStyle)) / uViewport;
  float blurredFluidMask = rawFluidMask * 0.2;
  blurredFluidMask += texture2D(uFluidMask, screenUv + vec2(blurStep.x, 0.0)).r * 0.11;
  blurredFluidMask += texture2D(uFluidMask, screenUv - vec2(blurStep.x, 0.0)).r * 0.11;
  blurredFluidMask += texture2D(uFluidMask, screenUv + vec2(0.0, blurStep.y)).r * 0.11;
  blurredFluidMask += texture2D(uFluidMask, screenUv - vec2(0.0, blurStep.y)).r * 0.11;
  blurredFluidMask += texture2D(uFluidMask, screenUv + blurStep).r * 0.09;
  blurredFluidMask += texture2D(uFluidMask, screenUv - blurStep).r * 0.09;
  blurredFluidMask += texture2D(uFluidMask, screenUv + vec2(blurStep.x, -blurStep.y)).r * 0.09;
  blurredFluidMask += texture2D(uFluidMask, screenUv + vec2(-blurStep.x, blurStep.y)).r * 0.09;
  vec2 blurredFluid = fluid * 0.26;
  blurredFluid += texture2D(uFluidVelocity, screenUv + vec2(blurStep.x, 0.0)).xy * 0.13;
  blurredFluid += texture2D(uFluidVelocity, screenUv - vec2(blurStep.x, 0.0)).xy * 0.13;
  blurredFluid += texture2D(uFluidVelocity, screenUv + vec2(0.0, blurStep.y)).xy * 0.13;
  blurredFluid += texture2D(uFluidVelocity, screenUv - vec2(0.0, blurStep.y)).xy * 0.13;
  blurredFluid += texture2D(uFluidVelocity, screenUv + blurStep).xy * 0.055;
  blurredFluid += texture2D(uFluidVelocity, screenUv - blurStep).xy * 0.055;
  blurredFluid += texture2D(uFluidVelocity, screenUv + vec2(blurStep.x, -blurStep.y)).xy * 0.055;
  blurredFluid += texture2D(uFluidVelocity, screenUv + vec2(-blurStep.x, blurStep.y)).xy * 0.055;
  rawFluidMask = mix(rawFluidMask, blurredFluidMask, max(energyStyle * 0.52, silkStyle * 0.94));
  fluid = mix(fluid, blurredFluid, max(energyStyle * 0.34, silkStyle * 0.78));
  float path = smoothstep(0.12, 0.82, rawFluidMask);
  float smoothPath = smoothstep(0.02, mix(mix(mix(0.86, 0.42, smoothness), 0.3, megaSmooth), 0.18, maxSmooth), rawFluidMask);
  float energyPath = smoothstep(0.04, 0.68, rawFluidMask);
  float silkPath = smoothstep(0.04, 0.64, rawFluidMask);
  path = mix(path, energyPath, energyStyle * 0.68);
  smoothPath = mix(smoothPath, energyPath, energyStyle * 0.7);
  path = mix(path, silkPath, silkStyle * 0.78);
  smoothPath = mix(smoothPath, silkPath, silkStyle * 0.82);
  float fluidEdge = clamp(pow(abs(fluid.x) * 0.014, 2.0), 0.0, 1.0);
  float directionalPulse = 0.0;
  float reveal = max(fluidEdge, directionalPulse * 0.78);
  float smokeReveal = max(reveal, smoothPath * mix(smoothness * 0.22, 0.36, ultraSmooth));
  smokeReveal = mix(smokeReveal, max(reveal, smoothPath * 0.42), energyStyle * 0.72);
  smokeReveal = mix(smokeReveal, max(reveal * 0.72, smoothPath * 0.62), silkStyle * 0.88);

  vec2 dir = normalize(fluid + vec2(0.0001));
  vec2 tangent = vec2(-dir.y, dir.x);
  float liquidFine = fbm(vUv * 24.0 + tangent * mix(1.6, 0.24, silkStyle) + dir * uTime * mix(0.36, 0.055, silkStyle));
  float liquidCoarse = fbm(vUv * 7.5 + tangent * mix(0.52, 0.13, silkStyle) + dir * uTime * mix(0.12, 0.032, silkStyle));
  float liquidUltra = fbm(vUv * 3.0 + tangent * mix(0.24, 0.08, silkStyle) + dir * uTime * mix(0.055, 0.018, silkStyle) + smoothPath);
  float liquidMega = fbm(vUv * 1.45 + tangent * mix(0.12, 0.05, silkStyle) + dir * uTime * mix(0.025, 0.01, silkStyle) + smoothPath * 0.35);
  float liquidMax = fbm(vUv * 0.72 + tangent * 0.04 + dir * uTime * 0.006 + smoothPath * 0.18);
  float smokeFine = fbm(vUv * 32.0 + dir * mix(2.1, 0.24, silkStyle) - uTime * mix(0.58, 0.055, silkStyle) + path);
  float smokeCoarse = fbm(vUv * 8.0 + dir * mix(0.9, 0.16, silkStyle) - uTime * mix(0.24, 0.035, silkStyle) + smoothPath);
  float smokeUltra = fbm(vUv * 3.6 + dir * mix(0.36, 0.09, silkStyle) - uTime * mix(0.09, 0.018, silkStyle) + smoothPath * 0.7);
  float smokeMega = fbm(vUv * 1.7 + dir * 0.08 - uTime * 0.01 + smoothPath * 0.36);
  float smokeMax = fbm(vUv * 0.82 + dir * 0.025 - uTime * 0.004 + smoothPath * 0.18);
  float liquid = mix(mix(mix(mix(liquidFine, liquidCoarse, smoothness), liquidUltra, ultraSmooth), liquidMega, megaSmooth), liquidMax, maxSmooth);
  float smoke = mix(mix(mix(mix(smokeFine, smokeCoarse, smoothness), smokeUltra, ultraSmooth), smokeMega, megaSmooth), smokeMax, maxSmooth);
  liquid = mix(liquid, liquidMega * 0.48 + liquidMax * 0.52, energyStyle * 0.68);
  smoke = mix(smoke, smokeMega * 0.35 + smokeMax * 0.65, energyStyle * 0.78);
  liquid = mix(liquid, liquidMax * 0.72 + liquidMega * 0.28, silkStyle * 0.86);
  smoke = mix(smoke, smokeMax * 0.92 + smokeMega * 0.08, silkStyle * 0.94);
  float swirl = sin(
    dot(vWorld, tangent) * mix(mix(mix(mix(0.08, 0.026, smoothness), 0.011, ultraSmooth), 0.006, megaSmooth), 0.003, maxSmooth) * mix(1.0, 0.35, silkStyle) -
    uTime * mix(mix(4.2, 2.2, megaSmooth), 1.15, maxSmooth) * mix(1.0, 0.42, silkStyle) +
    liquid * mix(mix(mix(5.2, 2.4, ultraSmooth), 1.45, megaSmooth), 0.82, maxSmooth) * mix(1.0, 0.38, silkStyle)
  );

  float liquidAmount = mix(mix(mix(mix(1.28, 0.42, smoothness), 0.18, ultraSmooth), 0.1, megaSmooth), 0.055, maxSmooth) *
    mix(1.0, 0.62, energyStyle) *
    mix(1.0, 0.48, silkStyle);
  float pathMask = max(path, smoothPath * mix(mix(mix(smoothness, 1.22, ultraSmooth), 1.38, megaSmooth), 1.48, maxSmooth));
  vec2 offset = vec2(fluidEdge * mix(mix(mix(mix(0.12, 0.055, smoothness), 0.025, ultraSmooth), 0.016, megaSmooth), 0.01, maxSmooth));
  offset += dir * pathMask * 0.003 * uSmoke * liquidAmount * mix(1.0, 0.42, energyStyle) * mix(1.0, 0.2, silkStyle);
  offset += tangent * swirl * 0.0025 * pathMask * uSmoke * liquidAmount * mix(1.0, 0.18, energyStyle) * mix(1.0, 0.08, silkStyle);
  offset *= uImageWarp;

  vec2 imageUv = vUv + offset;
  vec3 color = texture2D(uImage, imageUv).rgb * 1.08;
  float chromaMask = max(path, directionalPulse * 0.75) * uImageWarp * mix(1.0, 0.54, energyStyle) * mix(1.0, 0.52, silkStyle);
  vec3 chromaA = texture2D(uImage, imageUv + tangent * 0.0035 * chromaMask).rgb;
  vec3 chromaB = texture2D(uImage, imageUv - tangent * 0.0035 * chromaMask).rgb;
  color.r = mix(color.r, chromaA.r, chromaMask * 0.22);
  color.b = mix(color.b, chromaB.b, chromaMask * 0.22);

  float styleSmoke = mix(1.0, 0.035, energyStyle) * mix(1.0, 0.04, silkStyle);
  float smokeInput = smoke + pathMask * mix(mix(0.08, 0.42, smoothness), 0.62, ultraSmooth) + directionalPulse * mix(0.28, 0.42, ultraSmooth);
  float smokeShape = smoothstep(
    mix(mix(mix(mix(0.68, 0.24, smoothness), 0.12, ultraSmooth), 0.08, megaSmooth), 0.05, maxSmooth),
    mix(mix(mix(mix(0.78, 1.04, smoothness), 1.16, ultraSmooth), 1.24, megaSmooth), 1.28, maxSmooth),
    smokeInput
  ) * pathMask * uSmoke * mix(1.0, 0.55, maxSmooth) * styleSmoke;
  float hotSmoke = smoothstep(
    mix(mix(mix(mix(0.72, 0.44, smoothness), 0.34, ultraSmooth), 0.28, megaSmooth), 0.22, maxSmooth),
    mix(mix(mix(mix(0.84, 0.94, smoothness), 1.02, ultraSmooth), 1.08, megaSmooth), 1.12, maxSmooth),
    liquid + fluidEdge * 0.5 + directionalPulse * 0.34
  ) * pathMask * uSmoke * mix(1.0, 0.68, maxSmooth) * mix(1.0, 0.32, energyStyle) * mix(1.0, 0.12, silkStyle);
  vec3 haze = vec3(0.08, 0.085, 0.09) * smokeShape * mix(mix(mix(mix(0.08, 0.16, smoothness), 0.22, ultraSmooth), 0.28, megaSmooth), 0.18, maxSmooth);
  color *= mix(1.0, 1.18, smoothstep(0.2, 1.0, length(vUv - 0.5)));
  color = mix(color, color * 0.96 + haze, smokeReveal * 0.08 * uSmoke * mix(1.0, 0.22, energyStyle) * mix(1.0, 0.14, silkStyle));
  color += haze * mix(0.36, 0.025, energyStyle) * mix(1.0, 0.12, silkStyle) +
    vec3(0.012, 0.013, 0.014) * liquid * pathMask * uSmoke * mix(0.45, 0.06, energyStyle) * mix(1.0, 0.1, silkStyle);
  color += vec3(0.86, 0.9, 0.94) * hotSmoke * 0.006;
  color *= 1.0 + clamp(fluidEdge * 0.2, 0.0, 0.2);

  float glow = smoothstep(0.018, 0.18, smokeReveal) * (0.25 + path * 0.55);
  float glowControl = uGlowScale * uGlowOpacity;
  vec3 glowTint = max(uGlowColor, vec3(0.0));
  vec3 coolGlow = mix(glowTint, vec3(0.72, 0.96, 1.0), 0.24);
  vec3 hotGlow = mix(glowTint, vec3(1.0), 0.64);
  color += mix(vec3(0.9, 0.93, 0.96), coolGlow, 0.7) * glow * 0.004 * glowControl;
  vec2 glowStep = vec2(2.0) / uViewport;
  float maskLeft = texture2D(uFluidMask, screenUv - vec2(glowStep.x, 0.0)).r;
  float maskRight = texture2D(uFluidMask, screenUv + vec2(glowStep.x, 0.0)).r;
  float maskDown = texture2D(uFluidMask, screenUv - vec2(0.0, glowStep.y)).r;
  float maskUp = texture2D(uFluidMask, screenUv + vec2(0.0, glowStep.y)).r;
  vec2 maskGradient = vec2(maskRight - maskLeft, maskUp - maskDown);
  float flowSpeed = smoothstep(0.024, 0.56, length(fluid) * 0.006);
  float transientFlow = pow(flowSpeed, 1.18);
  float flowEdge = smoothstep(0.012, 0.18, length(maskGradient) * 2.4);
  float energyMaskContain = smoothstep(0.045, 0.24, rawFluidMask);
  float trailInterior = smoothstep(0.14, 0.68, rawFluidMask) * (1.0 - flowEdge * 0.78);
  vec3 energySample = rawEnergy;
  energySample += texture2D(uFluidEnergy, screenUv + vec2(glowStep.x, 0.0)).rgb * 0.36;
  energySample += texture2D(uFluidEnergy, screenUv - vec2(glowStep.x, 0.0)).rgb * 0.36;
  energySample += texture2D(uFluidEnergy, screenUv + vec2(0.0, glowStep.y)).rgb * 0.36;
  energySample += texture2D(uFluidEnergy, screenUv - vec2(0.0, glowStep.y)).rgb * 0.36;
  vec2 energyGlowStep = vec2(8.0) / uViewport;
  vec3 energyGlowSample = rawEnergy * 0.56;
  energyGlowSample += texture2D(uFluidEnergy, screenUv + vec2(energyGlowStep.x, 0.0)).rgb * 0.22;
  energyGlowSample += texture2D(uFluidEnergy, screenUv - vec2(energyGlowStep.x, 0.0)).rgb * 0.22;
  energyGlowSample += texture2D(uFluidEnergy, screenUv + vec2(0.0, energyGlowStep.y)).rgb * 0.22;
  energyGlowSample += texture2D(uFluidEnergy, screenUv - vec2(0.0, energyGlowStep.y)).rgb * 0.22;
  energyGlowSample += texture2D(uFluidEnergy, screenUv + energyGlowStep).rgb * 0.12;
  energyGlowSample += texture2D(uFluidEnergy, screenUv - energyGlowStep).rgb * 0.12;
  energyGlowSample += texture2D(uFluidEnergy, screenUv + vec2(energyGlowStep.x, -energyGlowStep.y)).rgb * 0.12;
  energyGlowSample += texture2D(uFluidEnergy, screenUv + vec2(-energyGlowStep.x, energyGlowStep.y)).rgb * 0.12;
  float rawEnergyAmount = length(rawEnergy);
  float energyNoise = noise(screenUv * uViewport * 0.14 + fluid * 0.0012 - uTime * 1.25);
  float energyDissolve = smoothstep(0.018 + energyNoise * 0.014, 0.11, rawEnergyAmount);
  float energyCenter = smoothstep(0.08 + energyNoise * 0.03, 0.28, rawEnergyAmount);
  float energyGate = energyDissolve * energyMaskContain * (1.0 - flowEdge * 0.56);
  float energyAmount = pow(clamp(length(energySample) * 0.58, 0.0, 2.1), 0.92) * energyGate * uArcGlow;
  float energyGlowAmount = pow(clamp(length(energyGlowSample) * 0.14, 0.0, 1.0), 1.45) * energyGate * uArcGlow;
  float energyCore = pow(clamp(rawEnergyAmount * 0.96, 0.0, 1.0), 0.52) * energyCenter * energyMaskContain * (1.0 - flowEdge * 0.42) * uArcGlow;
  float energyBody = energyAmount * smoothstep(0.018, 0.42, smokeReveal) * mix(1.0, 0.5, silkStyle);
  float energyFlow = energyAmount * (0.36 + transientFlow * 0.22);
  float energyHot = pow(clamp(energyCore, 0.0, 1.0), 0.62);
  float energyVein = smoothstep(0.2, 0.95, liquid + pathMask * 0.3) * energyBody;
  color += glowTint * energyGlowAmount * glowControl * 0.035;
  color += mix(glowTint, vec3(0.08, 0.3, 0.38), 0.16) * energyBody * glowControl * 0.035;
  color += coolGlow * energyVein * glowControl * 0.025;
  color += mix(glowTint, coolGlow, 0.45) * energyAmount * glowControl * 0.055;
  color += coolGlow * energyFlow * glowControl * 0.06;
  color += mix(coolGlow, vec3(1.0), 0.26) * energyCore * glowControl * 0.16;
  color += hotGlow * energyHot * glowControl * 0.18;
  float energyTrail = smoothstep(0.08, 0.76, rawFluidMask) *
    (0.38 + smoothstep(0.005, 0.13, fluidEdge) * 0.45);
  color += mix(coolGlow, vec3(0.88, 0.94, 1.0), 0.45) * energyTrail * energyAmount * 0.052 * energyStyle * mix(1.0, 1.12, silkStyle) * glowControl;
  color = mix(color, color * 1.04 + vec3(0.08, 0.095, 0.105), smoothPath * silkStyle * 0.22);

  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  vec3 graded = mix(vec3(luma), color, 0.76) * vec3(0.98, 0.99, 1.0) + vec3(0.008, 0.009, 0.01);
  float vignette = smoothstep(0.18, 0.86, length(vUv - 0.5));
  graded = mix(graded, graded * 0.86 + vec3(0.02, 0.03, 0.04), vignette * 0.44);
  color = mix(color, graded, uFilterOverlay * 0.64);

  float revealTexture = mix(0.62, 1.0, smoke);
  float sourceEdgeFade = smoothstep(0.0, mix(0.5, 0.72, energyStyle), fluidEdge) *
    mix(1.0, 0.78, energyStyle) *
    mix(1.0, 0.7, silkStyle);
  float wakeTexture = smoothstep(0.42, 0.96, liquid + pathMask * 0.28);
  float wakeFade = smoothstep(0.34, 0.92, rawFluidMask) * wakeTexture * mix(0.36, 0.14, energyStyle) * mix(1.0, 0.16, silkStyle);
  float edgeDissolveNoise = fbm(vUv * 18.0 + dir * 0.22 + rawFluidMask * 0.8 - uTime * 0.05);
  float noisyRevealInterior = smoothstep(0.24, 0.86, rawFluidMask + (edgeDissolveNoise - 0.5) * 0.64);
  float revealInterior = max(trailInterior, noisyRevealInterior * 0.76);
  sourceEdgeFade *= mix(1.0, revealInterior, energyStyle * 0.88);
  wakeFade *= mix(1.0, revealInterior, energyStyle * 0.72);
  float baseFadeMask = max(sourceEdgeFade, wakeFade);
  float silkRevealFade = max(
    smoothstep(0.018, 0.18, rawFluidMask) * 0.58,
    smoothstep(0.0, 0.14, fluidEdge) * 0.58
  );
  silkRevealFade = max(silkRevealFade, directionalPulse * 0.28);
  float fadeMask = mix(baseFadeMask, max(baseFadeMask, silkRevealFade), silkStyle) * revealTexture;
  float alpha = clamp(1.0 - fadeMask * uRevealDepth * uImageFade, 0.0, 1.0);
  alpha = mix(alpha, max(alpha, 0.18), silkStyle);
  alpha = max(alpha, (energyBody * 0.025 + energyGlowAmount * 0.015 + energyHot * 0.055 + energyCore * 0.04) * glowControl);
  gl_FragColor = vec4(color, alpha);
}
