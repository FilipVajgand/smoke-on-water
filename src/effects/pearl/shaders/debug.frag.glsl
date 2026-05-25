precision highp float;

uniform sampler2D uVelocity;
uniform sampler2D uMask;
uniform sampler2D uEnergy;
uniform float uMode;
uniform float uOpacity;

varying vec2 vUv;

void main() {
  vec2 velocity = texture2D(uVelocity, vUv).xy;
  float mask = texture2D(uMask, vUv).r;
  vec3 energy = texture2D(uEnergy, vUv).rgb;
  float edge = clamp(pow(abs(velocity.x) * 0.01, 2.0), 0.0, 1.0);
  float reveal = edge;

  vec3 color = vec3(mask);
  if (uMode > 0.5 && uMode < 1.5) {
    color = vec3(velocity * 0.015 + 0.5, clamp(length(velocity) * 0.01, 0.0, 1.0));
  } else if (uMode > 1.5) {
    color = mix(vec3(0.02, 0.03, 0.04), vec3(0.08, 0.45, 0.95), clamp(length(energy), 0.0, 1.0));
    color += energy * 0.72 + vec3(edge * 0.16, mask * 0.05, mask * 0.12);
  }

  gl_FragColor = vec4(color, uOpacity);
}
