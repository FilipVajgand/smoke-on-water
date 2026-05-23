precision highp float;

uniform sampler2D uImage;
uniform float uTime;
uniform float uSmoke;
uniform vec2 uViewport;
uniform vec2 uPulsePoint;
uniform vec2 uPulseDir;
uniform float uPulseStrength;
uniform float uPulseScale;
uniform float uSmoothness;
uniform float uGlowScale;
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
    p = p * 2.04 + 19.19;
    a *= 0.5;
  }
  return v;
}

float maskAt(vec2 uv) {
  return texture2D(uFluidMask, clamp(uv, vec2(0.0), vec2(1.0))).r;
}

float bloomMask(vec2 uv, vec2 radius) {
  float m = maskAt(uv) * 0.22;
  m += maskAt(uv + vec2(radius.x, 0.0)) * 0.10;
  m += maskAt(uv - vec2(radius.x, 0.0)) * 0.10;
  m += maskAt(uv + vec2(0.0, radius.y)) * 0.10;
  m += maskAt(uv - vec2(0.0, radius.y)) * 0.10;
  m += maskAt(uv + radius) * 0.08;
  m += maskAt(uv - radius) * 0.08;
  m += maskAt(uv + vec2(radius.x, -radius.y)) * 0.08;
  m += maskAt(uv + vec2(-radius.x, radius.y)) * 0.08;
  return m;
}

void main() {
  vec2 screenUv = vWorld / uViewport + 0.5;
  vec2 fluid = texture2D(uFluidVelocity, screenUv).xy;
  float rawMask = texture2D(uFluidMask, screenUv).r;
  float smoothness = clamp(uSmoothness, 0.0, 1.0);
  float ultraSmooth = smoothstep(1.0, 2.0, uSmoothness);
  float mask = smoothstep(0.02, 0.92, rawMask);
  float velocity = length(fluid);
  float edge = clamp(pow(max(abs(fluid.x), abs(fluid.y)) * 0.012, 1.45), 0.0, 1.0);
  float sourceEdge = clamp(pow(abs(fluid.x) * 0.01, 2.0), 0.0, 1.0);

  vec2 dir = normalize(fluid + vec2(0.0001));
  vec2 tangent = vec2(-dir.y, dir.x);
  float smokeFine = fbm(vUv * 30.0 + dir * 2.2 + tangent * 1.5 - uTime * 0.58);
  float smokeCoarse = fbm(vUv * 8.0 + dir * 0.95 + tangent * 0.42 - uTime * 0.2);
  float smokeUltra = fbm(vUv * 3.8 + dir * 0.32 + tangent * 0.18 - uTime * 0.08);
  float smoke = mix(mix(smokeFine, smokeCoarse, smoothness), smokeUltra, ultraSmooth);
  float fineSmoke = fbm(vUv * mix(mix(46.0, 18.0, smoothness), 9.0, ultraSmooth) - dir * 2.0 + tangent * 0.7 + uTime * 0.25);
  vec2 pulseDir = normalize(uPulseDir + vec2(0.0001));
  vec2 pulseTangent = vec2(-pulseDir.y, pulseDir.x);
  vec2 pulseStep = pulseDir * 20.0 / uViewport;
  float frontDrop = max(rawMask - maskAt(screenUv + pulseStep), 0.0);
  float forwardAura = bloomMask(screenUv - pulseStep, vec2(10.0, 10.0) / uViewport);
  vec2 pulseRel = vWorld - uPulsePoint;
  float pulseAhead = dot(pulseRel, pulseDir);
  float pulseSide = dot(pulseRel, pulseTangent);
  float pulseBody = smoothstep(-42.0, -6.0, pulseAhead) *
    smoothstep(92.0, 12.0, pulseAhead) *
    smoothstep(40.0, 0.0, abs(pulseSide));
  float pulseCrest = smoothstep(18.0, 0.0, abs(pulseAhead - 22.0 - smoke * 8.0)) *
    smoothstep(48.0, 0.0, abs(pulseSide));
  float blur = bloomMask(screenUv, vec2(12.0, 12.0) / uViewport);
  float wideBlur = bloomMask(screenUv, vec2(26.0, 26.0) / uViewport);
  float motion = smoothstep(0.05, 0.62, velocity * 0.01 + edge * 0.34);
  float sourceHot = smoothstep(0.012, 0.12, sourceEdge);
  float hotEdge = smoothstep(0.06, 0.42, edge) * (0.28 + mask * 0.42);
  float wave = smoothstep(0.035, 0.28, blur) * (0.24 + motion * 0.46);
  float wideWave = smoothstep(0.018, 0.18, wideBlur) * motion;
  float smokeBand = smoothstep(
    mix(mix(0.58, 0.25, smoothness), 0.12, ultraSmooth),
    mix(mix(0.72, 1.02, smoothness), 1.18, ultraSmooth),
    smoke + blur * mix(mix(0.2, 0.48, smoothness), 0.72, ultraSmooth) + motion * 0.08
  ) * wave * mix(mix(0.82, 1.34, smoothness), 1.68, ultraSmooth);
  float sparkle = smoothstep(0.9, 1.0, fineSmoke + hotEdge * 0.22) * hotEdge;
  float directionalFront = smoothstep(0.025, 0.2, frontDrop) * (0.25 + motion * 0.75);
  float directionalPulse = uPulseStrength * uPulseScale * (
    pulseCrest * 0.42 +
    pulseBody * 0.08 +
    smoothstep(0.035, 0.2, forwardAura) * 0.14 +
    directionalFront * 0.2
  );

  vec3 video = texture2D(uImage, vUv + dir * hotEdge * 0.004 + tangent * smoke * 0.003).rgb;
  vec3 frost = mix(vec3(0.12, 0.26, 0.72), vec3(0.58, 0.78, 1.0), 0.45 + smoke * 0.35);
  vec3 color = vec3(0.0);
  color += vec3(0.07, 0.2, 0.72) * wideWave * 0.14;
  color += mix(frost, video * 1.12 + vec3(0.08, 0.16, 0.26), 0.22) * smokeBand * mix(0.36, 0.52, ultraSmooth);
  color += vec3(0.44, 0.68, 1.0) * wave * 0.16;
  color += vec3(0.82, 0.92, 1.0) * hotEdge * 0.24;
  color += vec3(0.92, 0.97, 1.0) * sourceHot * 0.08;
  color += vec3(0.35, 0.58, 1.0) * sparkle * 0.16;
  color += vec3(0.58, 0.74, 0.96) * directionalPulse * 0.52;
  color += vec3(0.96, 0.98, 1.0) * pulseCrest * uPulseStrength * uPulseScale * 0.13;

  float alpha = clamp(
    wideWave * 0.09 +
    wave * 0.12 +
    smokeBand * mix(0.24, 0.42, ultraSmooth) +
    hotEdge * 0.28 +
    sourceHot * 0.06 +
    directionalPulse * 0.34,
    0.0,
    0.72
  ) * (0.52 + uSmoke * 0.42) * uGlowScale;

  gl_FragColor = vec4(color, alpha);
}
