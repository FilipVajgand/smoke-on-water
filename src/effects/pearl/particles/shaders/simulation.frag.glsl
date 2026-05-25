precision highp float;

uniform sampler2D uPosition;
uniform sampler2D uTarget;
uniform sampler2D uRandom;
uniform sampler2D uSpline;
uniform sampler2D uFluidVelocity;
uniform sampler2D uFluidMask;
uniform vec2 uViewport;
uniform vec2 uFrameSize;
uniform vec3 uSplineBoundsMin;
uniform vec3 uSplineBoundsSize;
uniform float uHz;
uniform float uTime;
uniform float uRelax;
uniform float uMouseStrength;
uniform float uFlowToScreen;
uniform float uSeparation;
uniform float uUseSpline;
uniform float uSplineTexSize;
uniform float uPerSpline;
uniform float uSplineCount;
uniform float uTimeMultiplier;
uniform vec2 uSplineSpeed;

varying vec2 vUv;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float range(float value, float oldMin, float oldMax, float newMin, float newMax) {
  return (value - oldMin) * (newMax - newMin) / (oldMax - oldMin) + newMin;
}

float crange(float value, float oldMin, float oldMax, float newMin, float newMax) {
  return clamp(range(value, oldMin, oldMax, newMin, newMax), min(newMin, newMax), max(newMin, newMax));
}

float sround(float value) {
  return floor(value + 0.5);
}

float splinenoise(vec3 v) {
  float t = v.z * 0.3;
  v.y *= 0.8;
  float noise = 0.0;
  float s = 0.5;
  noise += range(
    sin(v.x * 0.9 / s + t * 10.0) +
    sin(v.x * 2.4 / s + t * 15.0) +
    sin(v.x * -3.5 / s + t * 4.0) +
    sin(v.x * -2.5 / s + t * 7.1),
    -1.0,
    1.0,
    -0.3,
    0.3
  );
  noise += range(
    sin(v.y * -0.3 / s + t * 18.0) +
    sin(v.y * 1.6 / s + t * 18.0) +
    sin(v.y * 2.6 / s + t * 8.0) +
    sin(v.y * -2.6 / s + t * 4.5),
    -1.0,
    1.0,
    -0.3,
    0.3
  );
  return noise;
}

vec3 curlLike(vec3 p) {
  return vec3(
    sin(p.y * 1.7 + p.z * 2.3),
    sin(p.z * 1.9 - p.x * 2.1),
    sin(p.x * 1.5 + p.y * 2.7)
  );
}

vec2 getSplineLookupUV(float index, float travel) {
  float pixel = uPerSpline * (index + travel);
  return vec2(mod(pixel, uSplineTexSize), floor(pixel / uSplineTexSize)) / uSplineTexSize;
}

vec3 sampleSplineRaw(float index, float travel) {
  float stepSize = 1.0 / uPerSpline;
  float next = travel + stepSize;
  vec2 uv0 = vec2(0.0);
  vec2 uv1 = vec2(1.0);

  if (next <= 1.0) {
    uv0 = getSplineLookupUV(index, travel);
    uv1 = getSplineLookupUV(index, next);
  } else {
    uv0 = getSplineLookupUV(index, 1.0);
    uv1 = getSplineLookupUV(index, travel - stepSize);
  }

  vec3 current = texture2D(uSpline, uv0).xyz;
  vec3 nextPoint = texture2D(uSpline, uv1).xyz;
  float interpolate = mod(travel, stepSize) * uPerSpline;
  return mix(current, nextPoint, interpolate);
}

vec3 transformSplinePoint(vec3 point) {
  return vec3(point.z * 1.78, point.y * 1.54, -point.x * 0.5);
}

vec3 projectSplinePoint(vec3 rawPoint) {
  vec3 world = transformSplinePoint(rawPoint);
  float aspect = uFrameSize.x / max(uFrameSize.y, 1.0);
  float distanceToCamera = max(1.0, 22.0 - world.z);
  float perspective = 2.41421356237 / distanceToCamera;
  vec2 ndc = vec2(world.x * perspective / aspect, world.y * perspective);
  return vec3(ndc * uFrameSize * 0.5, world.z * 34.0);
}

vec3 getSplineTarget(vec4 randoms) {
  float splineIndex = sround(crange(randoms.x, 0.0, 1.0, 0.0, uSplineCount - 1.0));
  float speedNoise = hash(vec2(randoms.x * 13.17, randoms.y * 71.91));
  float speed = mix(uSplineSpeed.x, uSplineSpeed.y, speedNoise);
  float travel = fract(randoms.w + uTime * 60.0 * 0.001 * uTimeMultiplier * speed);
  vec3 raw = sampleSplineRaw(splineIndex, travel);
  vec3 origin = normalize(randoms.xyz * 2.0 - 1.0);

  float gamma = sin(crange(splinenoise(origin * 2.0), -1.0, 1.0, 0.0, 1.0) * 1.57079632679);
  float fizzy = pow(gamma, 3.0);
  float radius = 0.5 * fizzy;
  radius *= crange(splinenoise(raw + uTime), -1.0, 1.0, 0.0, 2.0);
  raw += origin * radius;
  raw += curlLike(raw * 0.2 + uTime * 0.2) * 0.05 * uHz;

  return projectSplinePoint(raw);
}

void main() {
  vec4 current = texture2D(uPosition, vUv);
  vec3 pos = current.xyz;
  vec4 randoms = texture2D(uRandom, vUv);
  vec3 staticTarget = texture2D(uTarget, vUv).xyz;
  vec3 splineTarget = getSplineTarget(randoms);
  vec3 target = mix(staticTarget, splineTarget, uUseSpline);

  float relax = 1.0 - pow(1.0 - uRelax, uHz);
  pos += (target - pos) * relax;

  vec2 screenUv = pos.xy / uViewport + 0.5;
  vec2 fluid = texture2D(uFluidVelocity, screenUv).xy;
  float rawMask = texture2D(uFluidMask, screenUv).r;

  float mask = smoothstep(0.02, 0.85, rawMask);
  float speed = length(fluid);
  vec2 flowDir = normalize(fluid + vec2(0.0001));
  vec2 directionalFlow = flowDir * smoothstep(0.03, 0.72, speed * 0.007) * mask;
  vec2 fluidFlow = fluid * 0.0001 * uMouseStrength * rawMask;
  pos.xy += (fluidFlow + directionalFlow * uFlowToScreen) * uHz;

  gl_FragColor = vec4(pos, current.w);
}
