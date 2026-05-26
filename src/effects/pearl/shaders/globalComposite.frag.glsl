precision highp float;

varying vec2 vUv;

uniform sampler2D uScene;
uniform sampler2D uFluidVelocity;
uniform sampler2D uFluidMask;
uniform vec2 uResolution;
uniform vec3 uAccentColor;
uniform float uTime;
uniform float uContact;
uniform float uEnabled;
uniform float uPostFrost;
uniform float uPostRgb;
uniform float uPostBloom;
uniform float uPostStreaks;
uniform float uPostCorners;
uniform float uPostGrain;
uniform float uPostFluid;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

float saturate(float value) {
  return clamp(value, 0.0, 1.0);
}

vec3 saturate(vec3 value) {
  return clamp(value, vec3(0.0), vec3(1.0));
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float noise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);

  return mix(
    mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
    mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;

  for (int i = 0; i < 5; i += 1) {
    value += noise2(p) * amplitude;
    p = p * 2.02 + vec2(19.13, 11.71);
    amplitude *= 0.5;
  }

  return value;
}

vec2 rotateUv(vec2 uv, float angle) {
  float s = sin(angle);
  float c = cos(angle);
  return mat2(c, -s, s, c) * uv;
}

vec2 scaleFrom(vec2 uv, vec2 scale, vec2 origin) {
  return (uv - origin) / scale + origin;
}

vec3 rgb2hsv(vec3 c) {
  vec4 k = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, k.wz), vec4(c.gb, k.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 0.00001;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}

vec3 blendOverlay(vec3 base, vec3 blend) {
  vec3 lower = 2.0 * base * blend;
  vec3 upper = 1.0 - 2.0 * (1.0 - base) * (1.0 - blend);
  return mix(lower, upper, step(vec3(0.5), base));
}

float softLightChannel(float base, float blend) {
  return blend < 0.5
    ? 2.0 * base * blend + base * base * (1.0 - 2.0 * blend)
    : sqrt(max(base, 0.0)) * (2.0 * blend - 1.0) + 2.0 * base * (1.0 - blend);
}

vec3 blendSoftLight(vec3 base, vec3 blend) {
  return vec3(
    softLightChannel(base.r, blend.r),
    softLightChannel(base.g, blend.g),
    softLightChannel(base.b, blend.b)
  );
}

vec3 sampleRgb(vec2 uv, float angle, float amount) {
  vec2 direction = vec2(cos(angle), sin(angle));
  vec2 safeR = clamp(uv + direction * amount, 0.0, 1.0);
  vec2 safeG = clamp(uv, 0.0, 1.0);
  vec2 safeB = clamp(uv - direction * amount, 0.0, 1.0);

  return vec3(
    texture2D(uScene, safeR).r,
    texture2D(uScene, safeG).g,
    texture2D(uScene, safeB).b
  );
}

vec3 brightSample(vec2 uv) {
  vec3 sampleColor = texture2D(uScene, clamp(uv, 0.0, 1.0)).rgb;
  float bright = smoothstep(0.52, 0.98, dot(sampleColor, LUMA));
  return sampleColor * sampleColor * bright;
}

vec3 bloomApprox(vec2 uv) {
  vec2 px = 1.0 / max(uResolution, vec2(1.0));
  vec3 color = brightSample(uv) * 0.28;
  color += brightSample(uv + vec2(px.x * 3.0, 0.0)) * 0.12;
  color += brightSample(uv - vec2(px.x * 3.0, 0.0)) * 0.12;
  color += brightSample(uv + vec2(0.0, px.y * 3.0)) * 0.12;
  color += brightSample(uv - vec2(0.0, px.y * 3.0)) * 0.12;
  color += brightSample(uv + px * 7.0) * 0.08;
  color += brightSample(uv - px * 7.0) * 0.08;
  color += brightSample(uv + vec2(px.x * 12.0, -px.y * 12.0)) * 0.04;
  color += brightSample(uv + vec2(-px.x * 12.0, px.y * 12.0)) * 0.04;
  return color;
}

vec2 proceduralNormal(vec2 uv) {
  float stepSize = 0.006;
  float center = fbm(uv);
  float x = fbm(uv + vec2(stepSize, 0.0)) - center;
  float y = fbm(uv + vec2(0.0, stepSize)) - center;
  return vec2(x, y) / stepSize;
}

vec3 adjustContrast(vec3 color, float contrast, float brightness) {
  return (color - 0.5) * contrast + 0.5 + brightness;
}

void main() {
  vec4 base = texture2D(uScene, vUv);
  if (uEnabled < 0.5) {
    gl_FragColor = base;
    return;
  }

  float frostLayer = saturate(uPostFrost);
  float rgbLayer = saturate(uPostRgb);
  float bloomLayer = saturate(uPostBloom);
  float streakLayer = saturate(uPostStreaks);
  float cornerLayer = saturate(uPostCorners);
  float grainLayer = saturate(uPostGrain);
  float fluidLayer = saturate(uPostFluid);

  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec2 squareUv = scaleFrom(vUv, vec2(1.4, aspect), vec2(0.5));
  float centerDistance = length(squareUv - 0.5);
  float contact = saturate(uContact);

  vec2 contactUv = scaleFrom(
    vUv,
    vec2(1.0 + contact * (0.004 + 0.02 * smoothstep(0.85, 0.12, centerDistance))),
    vec2(0.5)
  );
  vec2 uv = mix(vUv, contactUv, frostLayer);

  vec2 fluid = texture2D(uFluidVelocity, vUv).xy;
  float rawMask = texture2D(uFluidMask, vUv).r;
  float fluidMask = smoothstep(0.0, 1.0, rawMask);
  float fluidPush = pow(abs(fluid.x) * 0.01, 2.0) * fluidLayer;
  float fluidPushY = pow(abs(fluid.y) * 0.01, 2.0) * fluidLayer;
  float fluidEdge = fluidPush * smoothstep(0.7, 0.0, abs(fluidMask - 0.5));
  float activeFluid = max(fluidEdge, smoothstep(0.08, 0.7, rawMask) * contact * 0.18 * fluidLayer);

  vec2 normalUv = squareUv * mix(2.2, 1.55, contact) + vec2(uTime * 0.014, -uTime * 0.01);
  vec2 normal = proceduralNormal(normalUv) * 0.018;
  float cornerFrost = smoothstep(0.72, 0.14, length(vUv - vec2(1.0))) +
    smoothstep(0.58, 0.0, length(vUv - vec2(0.0))) * 0.35;
  float frost = mix(cornerFrost * 0.018, 0.035 + activeFluid * 0.13, contact);
  frost *= 1.0 + sin(uTime - centerDistance * 30.0) * 0.28;
  uv += normal * frost * frostLayer;
  uv += normalize(fluid + vec2(0.0001)) * activeFluid * contact * 0.0018;

  float rgbAmount = (0.00016 + activeFluid * mix(0.0012, 0.0042, contact)) * rgbLayer;
  vec3 color = sampleRgb(uv, 2.094395, rgbAmount);
  vec3 gradedColor = adjustContrast(color, 1.03, 0.005);
  gradedColor *= mix(1.0, 0.86, pow(contact, 3.0));
  color = mix(color, gradedColor, cornerLayer);

  vec3 gradient = rgb2hsv(mix(vec3(0.5, 0.5, 1.0), uAccentColor, 0.18));
  gradient.x = fract(gradient.x + fbm(squareUv * 0.65 - uTime * 0.04 + contact * 0.2) * 0.065 + 0.88);
  gradient.y = mix(0.45, gradient.y, 0.42);
  gradient.z = mix(0.7, 1.0, gradient.z);
  gradient = hsv2rgb(gradient);

  vec3 bloom = bloomApprox(uv);
  color += pow(max(bloom, vec3(0.0)), vec3(1.55)) * mix(0.28, 0.38, activeFluid) * bloomLayer;

  float streakNoise = noise2(vec2(vUv.y * 170.0 + uTime * 0.65, vUv.x * 4.5));
  float fineScratch = smoothstep(0.88, 0.995, streakNoise) *
    smoothstep(0.18, 0.82, centerDistance + fbm(vUv * 4.0) * 0.12);
  float longStreak = smoothstep(0.72, 1.0, fbm(vec2(vUv.y * 35.0, vUv.x * 1.5 + uTime * 0.08))) *
    smoothstep(0.34, 0.9, centerDistance);
  color += pow(gradient, vec3(1.2)) * (fineScratch * 0.018 + longStreak * 0.014) * streakLayer;

  vec2 rotatedNoiseUv = rotateUv(squareUv - 0.5, 0.261799) + 0.5;
  float gradientNoise = 0.5 + fbm(rotatedNoiseUv * 1.08 + uTime * 0.03 + contact * 0.2) * 0.5;
  float cornerNoise = 1.06 * smoothstep(0.45, 1.0, centerDistance);
  color += gradient * (0.035 + pow(cornerNoise * gradientNoise, 2.0) * 0.13) * cornerLayer;

  float grain = hash12(vUv * uResolution + uTime * 58.0);
  color = mix(color, blendOverlay(color, vec3(grain)), 0.15 * grainLayer);
  color = pow(max(color, vec3(0.0)), vec3(1.0 + smoothstep(1.0, 0.2, contact) * 0.055 * max(cornerLayer, grainLayer)));

  vec3 touchColor = mix(vec3(1.0), gradient, smoothstep(0.0, 1.0, fluidPush) * 0.5);
  float touchPush = saturate(fluidPush + fluidPushY);
  color = mix(color, blendSoftLight(color, touchColor), touchPush * 0.28 * smoothstep(0.02, 0.6, rawMask) * fluidLayer);

  color *= 1.0 - smoothstep(0.5, 1.08, centerDistance) * 0.06 * cornerLayer;
  gl_FragColor = vec4(saturate(color), 1.0);
}
