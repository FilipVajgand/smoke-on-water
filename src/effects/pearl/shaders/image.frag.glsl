precision highp float;

uniform sampler2D uImage;
uniform vec2 uViewport;
uniform float uImageWarp;
uniform float uImageFade;
uniform sampler2D uFluidVelocity;

varying vec2 vUv;
varying vec2 vWorld;

vec2 scaleUv(vec2 uv, vec2 scale) {
  return (uv - 0.5) / scale + 0.5;
}

float roundedBox(vec2 p, vec2 c, float r) {
  return length(max(abs(p - c), 0.0)) - r;
}

void main() {
  vec2 screenUv = vWorld / uViewport + 0.5;
  vec2 fluid = texture2D(uFluidVelocity, screenUv).xy;
  float fluidEdge = pow(abs(fluid.x) * 0.01, 2.0);

  vec2 uv = vUv;

  float rounded = roundedBox(uv, scaleUv(uv, vec2(0.55, 0.6)), 0.505);
  if (rounded > 0.0) discard;

  uv += fluidEdge * 0.1 * uImageWarp;

  vec3 color = texture2D(uImage, uv).rgb * 0.8;
  color *= mix(1.0, 1.6, smoothstep(0.2, 1.0, length(uv - 0.5)));

  float alpha = mix(1.0, smoothstep(0.5, 0.0, fluidEdge), uImageFade);

  gl_FragColor = vec4(color * 0.8, alpha * 0.9);
}
