precision highp float;

varying vec3 vColor;
varying vec4 vRandom;
varying float vMaskReveal;

uniform float uTime;
uniform float uPearlMaskReveal;
uniform float uEffectStyle;
uniform sampler2D uMatcap;

float blendSoftLight(float base, float blend) {
  return blend < 0.5
    ? (2.0 * base * blend + base * base * (1.0 - 2.0 * blend))
    : (sqrt(base) * (2.0 * blend - 1.0) + 2.0 * base * (1.0 - blend));
}

vec3 blendSoftLight(vec3 base, vec3 blend, float opacity) {
  vec3 color = vec3(
    blendSoftLight(base.r, blend.r),
    blendSoftLight(base.g, blend.g),
    blendSoftLight(base.b, blend.b)
  );
  return mix(base, color, opacity);
}

float blendOverlay(float base, float blend) {
  return base < 0.5 ? 2.0 * base * blend : 1.0 - 2.0 * (1.0 - base) * (1.0 - blend);
}

vec3 blendOverlay(vec3 base, vec3 blend, float opacity) {
  vec3 color = vec3(
    blendOverlay(base.r, blend.r),
    blendOverlay(base.g, blend.g),
    blendOverlay(base.b, blend.b)
  );
  return mix(base, color, opacity);
}

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}

vec2 rotateUv(vec2 uv, float angle) {
  vec2 p = uv - 0.5;
  float s = sin(angle);
  float c = cos(angle);
  return mat2(c, -s, s, c) * p + 0.5;
}

void main() {
  vec2 uv = vec2(gl_PointCoord.x, 1.0 - gl_PointCoord.y);
  vec2 p = uv * 2.0 - 1.0;
  float r2 = dot(p, p);
  if (r2 > 1.0) discard;

  float z = sqrt(1.0 - r2);
  vec3 normal = normalize(vec3(p, z));
  vec3 light = normalize(vec3(-0.45, 0.58, 0.82));
  vec3 view = vec3(0.0, 0.0, 1.0);

  float diffuse = max(dot(normal, light), 0.0);
  float rim = pow(1.0 - max(dot(normal, view), 0.0), 2.4);
  float highlight = pow(max(dot(reflect(-light, normal), view), 0.0), 58.0);
  float softSpot = smoothstep(0.23, 0.0, length(p - vec2(-0.32, 0.3)));
  float glass = smoothstep(1.0, 0.35, r2);

  vec3 proceduralMatcap = vec3(0.16, 0.2, 0.22) + vec3(0.62, 0.77, 0.82) * diffuse;
  proceduralMatcap += vec3(1.0, 0.93, 0.78) * highlight * 0.9;
  proceduralMatcap += vec3(0.42, 0.68, 1.0) * rim * 0.48;
  proceduralMatcap += vec3(1.0) * softSpot * 0.22;

  vec2 matcapUv = rotateUv(uv, sin(uTime + vRandom.z * 20.0) * 0.5 + 1.0);
  vec3 sourceMatcap = texture2D(uMatcap, matcapUv).rgb * 1.2;
  vec3 matcap = mix(proceduralMatcap, sourceMatcap, 0.82);

  vec3 pearl = blendSoftLight(vColor, matcap, 0.8);
  pearl = blendOverlay(pearl, matcap, 0.2);
  pearl += 0.05;
  pearl = rgb2hsv(pearl);
  pearl.y *= 1.4;
  pearl = hsv2rgb(pearl);
  pearl *= mix(0.82, 1.0, glass);
  float silkStyle = smoothstep(1.0, 2.0, uEffectStyle);
  pearl = mix(pearl, pearl * 0.72 + vec3(0.36, 0.43, 0.48), silkStyle * 0.58);

  float edge = smoothstep(1.0, 0.82, r2);
  float reveal = mix(1.0, vMaskReveal, uPearlMaskReveal);
  gl_FragColor = vec4(pearl, edge * mix(0.96, 0.82, silkStyle) * reveal);
}
