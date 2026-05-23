precision highp float;

uniform sampler2D uImage;
uniform float uTime;
uniform float uSmoke;
uniform vec2 uFrameSize;
uniform vec2 uViewport;
uniform vec2 uPulsePoint;
uniform vec2 uPulseDir;
uniform float uPulseStrength;
uniform float uPulseScale;
uniform float uSmoothness;
uniform float uGlowScale;
uniform float uFilterOverlay;
uniform sampler2D uFluidVelocity;
uniform sampler2D uFluidMask;

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

vec2 scaleUv(vec2 uv, vec2 scale) {
  return (uv - 0.5) / scale + 0.5;
}

float roundedBox(vec2 p, vec2 c, float r) {
  return length(max(abs(p - c), 0.0)) - r;
}

void main() {
  vec2 screenUv = vWorld / uViewport + 0.5;
  vec2 fluid = texture2D(uFluidVelocity, screenUv).xy;
  float rawFluidMask = texture2D(uFluidMask, screenUv).r;
  float smoothness = clamp(uSmoothness, 0.0, 1.0);
  float ultraSmooth = smoothstep(1.0, 2.0, uSmoothness);
  float path = smoothstep(0.12, 0.82, rawFluidMask);
  float smoothPath = smoothstep(0.02, mix(0.86, 0.42, smoothness), rawFluidMask);
  float fluidEdge = clamp(pow(abs(fluid.x) * 0.014, 2.0), 0.0, 1.0);
  vec2 pulseDir = normalize(uPulseDir + vec2(0.0001));
  vec2 pulseTangent = vec2(-pulseDir.y, pulseDir.x);
  vec2 pulseRel = vWorld - uPulsePoint;
  float pulseAhead = dot(pulseRel, pulseDir);
  float pulseSide = dot(pulseRel, pulseTangent);
  float pulseBody = smoothstep(-42.0, -6.0, pulseAhead) *
    smoothstep(92.0, 12.0, pulseAhead) *
    smoothstep(42.0, 0.0, abs(pulseSide));
  float pulseCrest = smoothstep(18.0, 0.0, abs(pulseAhead - 22.0)) *
    smoothstep(48.0, 0.0, abs(pulseSide));
  float directionalPulse = uPulseStrength * uPulseScale * (pulseBody * 0.32 + pulseCrest * 0.5);
  float reveal = max(fluidEdge, directionalPulse * 0.78);
  float smokeReveal = max(reveal, smoothPath * mix(smoothness * 0.22, 0.36, ultraSmooth));

  float rounded = roundedBox(vUv, scaleUv(vUv, vec2(0.55, 0.6)), 0.505);
  if (rounded > 0.0) discard;

  vec2 dir = normalize(fluid + vec2(0.0001));
  vec2 tangent = vec2(-dir.y, dir.x);
  float liquidFine = fbm(vUv * 24.0 + tangent * 1.6 + dir * uTime * 0.36);
  float liquidCoarse = fbm(vUv * 7.5 + tangent * 0.52 + dir * uTime * 0.12);
  float liquidUltra = fbm(vUv * 3.0 + tangent * 0.24 + dir * uTime * 0.055 + smoothPath);
  float smokeFine = fbm(vUv * 32.0 + dir * 2.1 - uTime * 0.58 + path);
  float smokeCoarse = fbm(vUv * 8.0 + dir * 0.9 - uTime * 0.24 + smoothPath);
  float smokeUltra = fbm(vUv * 3.6 + dir * 0.36 - uTime * 0.09 + smoothPath * 0.7);
  float liquid = mix(mix(liquidFine, liquidCoarse, smoothness), liquidUltra, ultraSmooth);
  float smoke = mix(mix(smokeFine, smokeCoarse, smoothness), smokeUltra, ultraSmooth);
  float swirl = sin(dot(vWorld, tangent) * mix(mix(0.08, 0.026, smoothness), 0.011, ultraSmooth) - uTime * 4.2 + liquid * mix(5.2, 2.4, ultraSmooth));

  float liquidAmount = mix(mix(1.28, 0.42, smoothness), 0.18, ultraSmooth);
  float pathMask = max(path, smoothPath * mix(smoothness, 1.22, ultraSmooth));
  vec2 offset = vec2(fluidEdge * mix(mix(0.12, 0.055, smoothness), 0.025, ultraSmooth));
  offset += dir * pathMask * 0.003 * uSmoke * liquidAmount;
  offset += tangent * swirl * 0.0025 * pathMask * uSmoke * liquidAmount;
  offset += pulseDir * directionalPulse * mix(mix(0.0085, 0.0042, smoothness), 0.0026, ultraSmooth);
  offset += pulseTangent * swirl * directionalPulse * 0.0018 * liquidAmount;

  vec3 color = texture2D(uImage, vUv + offset).rgb * 1.08;
  float chromaMask = max(path, directionalPulse * 0.75);
  vec3 chromaA = texture2D(uImage, vUv + offset + tangent * 0.0035 * chromaMask).rgb;
  vec3 chromaB = texture2D(uImage, vUv + offset - tangent * 0.0035 * chromaMask).rgb;
  color.r = mix(color.r, chromaA.r, chromaMask * 0.22);
  color.b = mix(color.b, chromaB.b, chromaMask * 0.22);

  float smokeInput = smoke + pathMask * mix(mix(0.08, 0.42, smoothness), 0.62, ultraSmooth) + directionalPulse * mix(0.28, 0.42, ultraSmooth);
  float smokeShape = smoothstep(
    mix(mix(0.68, 0.24, smoothness), 0.12, ultraSmooth),
    mix(mix(0.78, 1.04, smoothness), 1.16, ultraSmooth),
    smokeInput
  ) * pathMask * uSmoke;
  float hotSmoke = smoothstep(
    mix(mix(0.72, 0.44, smoothness), 0.34, ultraSmooth),
    mix(mix(0.84, 0.94, smoothness), 1.02, ultraSmooth),
    liquid + fluidEdge * 0.5 + directionalPulse * 0.34
  ) * pathMask * uSmoke;
  vec3 haze = vec3(0.42, 0.5, 0.52) * smokeShape * mix(mix(0.1, 0.22, smoothness), 0.32, ultraSmooth);
  color *= mix(1.0, 1.18, smoothstep(0.2, 1.0, length(vUv - 0.5)));
  color = mix(color, color * 0.9 + haze, smokeReveal * 0.22);
  color += haze + vec3(0.018, 0.024, 0.026) * liquid * pathMask * uSmoke;
  color += vec3(0.72, 0.86, 1.0) * hotSmoke * 0.055;
  color *= 1.0 + clamp(fluidEdge * 0.2, 0.0, 0.2);

  float glow = smoothstep(0.018, 0.18, smokeReveal) * (0.25 + path * 0.55);
  color += vec3(0.22, 0.48, 0.92) * glow * 0.32 * uGlowScale;
  color += vec3(0.5, 0.68, 0.92) * directionalPulse * 0.14 * uGlowScale;
  color += vec3(0.94, 0.98, 1.0) * pulseCrest * uPulseStrength * uPulseScale * 0.08 * uGlowScale;

  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  vec3 graded = mix(vec3(luma), color, 0.68) * vec3(0.92, 0.98, 1.06) + vec3(0.018, 0.028, 0.036);
  float vignette = smoothstep(0.18, 0.86, length(vUv - 0.5));
  graded = mix(graded, graded * 0.86 + vec3(0.02, 0.03, 0.04), vignette * 0.44);
  color = mix(color, graded, uFilterOverlay * 0.64);

  float alpha = smoothstep(0.5, 0.0, reveal);
  gl_FragColor = vec4(color, alpha);
}
