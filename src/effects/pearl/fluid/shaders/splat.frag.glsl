precision highp float;

varying vec2 vUv;

uniform sampler2D uTarget;
uniform float aspectRatio;
uniform vec3 color;
uniform vec2 point;
uniform vec2 prevPoint;
uniform float radius;
uniform float canRender;
uniform float uAdd;

float blendScreen(float base, float blend) {
  return 1.0 - ((1.0 - base) * (1.0 - blend));
}

vec3 blendScreen(vec3 base, vec3 blend) {
  return vec3(
    blendScreen(base.r, blend.r),
    blendScreen(base.g, blend.g),
    blendScreen(base.b, blend.b)
  );
}

float segmentDistance(vec2 uv, vec2 pointA, vec2 pointB) {
  vec2 pa = uv - pointA;
  vec2 ba = pointB - pointA;
  pa.x *= aspectRatio;
  ba.x *= aspectRatio;
  float h = clamp(dot(pa, ba) / (dot(ba, ba) + 0.00001), 0.0, 1.0);
  return length(pa - ba * h);
}

float cubicOut(float t) {
  float f = t - 1.0;
  return f * f * f + 1.0;
}

void main() {
  float shape = 1.0 - cubicOut(clamp(segmentDistance(vUv, prevPoint, point) / radius, 0.0, 1.0));
  vec3 splat = max(shape, 0.0) * color;
  vec3 base = texture2D(uTarget, vUv).xyz * canRender;
  vec3 outColor = mix(blendScreen(base, splat), base + splat, uAdd);
  gl_FragColor = vec4(outColor, 1.0);
}
