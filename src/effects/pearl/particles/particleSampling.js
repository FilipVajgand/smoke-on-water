import * as THREE from "three";
import { getImageFrame } from "../media/mediaFrame.js";

export { sampleImage, sampleSplineParticles };

function sampleImage(image, { width, height, step, maxParticles }) {
  const { width: drawW, height: drawH } = getImageFrame(image, width, height);

  const canvas = document.createElement("canvas");
  canvas.width = drawW;
  canvas.height = drawH;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0, drawW, drawH);

  const data = context.getImageData(0, 0, drawW, drawH).data;
  const points = [];
  const edgeMargin = step * 2.5;

  for (let y = edgeMargin; y < drawH - edgeMargin; y += step) {
    for (let x = edgeMargin; x < drawW - edgeMargin; x += step) {
      const px = (Math.floor(y) * drawW + Math.floor(x)) * 4;
      const alpha = data[px + 3];
      if (alpha < 20) continue;

      const red = data[px] / 255;
      const green = data[px + 1] / 255;
      const blue = data[px + 2] / 255;
      const light = red * 0.2126 + green * 0.7152 + blue * 0.0722;
      const grain = hash2(x, y, 11);
      if (light < 0.015 && grain > 0.3) continue;

      const keep = 0.58 + Math.min(0.18, light * 0.28);
      if (grain > keep) continue;

      const jitter = step * 0.42;
      points.push({
        x: x + (hash2(x, y, 23) - 0.5) * jitter,
        y: y + (hash2(x, y, 41) - 0.5) * jitter,
        red,
        green,
        blue,
      });
    }
  }

  const selected = pickEvenly(points, maxParticles);
  const count = selected.length;
  const targets = new Float32Array(count * 3);
  const bursts = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const randoms = new Float32Array(count * 4);
  const radius = Math.max(width, height) * 0.82;

  for (let i = 0; i < count; i += 1) {
    const point = selected[i];
    const i3 = i * 3;
    const i4 = i * 4;
    const rx = hash2(point.x, point.y, 101);
    const ry = hash2(point.x, point.y, 211);
    const rz = hash2(point.x, point.y, 307);
    const rw = hash2(point.x, point.y, 409);
    const angle = rx * Math.PI * 2;
    const spread = radius * (0.25 + Math.pow(ry, 0.55));

    targets[i3] = point.x - drawW / 2;
    targets[i3 + 1] = drawH / 2 - point.y;
    targets[i3 + 2] = (rz - 0.5) * 90;

    bursts[i3] = Math.cos(angle) * spread;
    bursts[i3 + 1] = Math.sin(angle) * spread;
    bursts[i3 + 2] = (rw - 0.5) * 760;

    colors[i3] = Math.max(point.red, 0.035);
    colors[i3 + 1] = Math.max(point.green, 0.035);
    colors[i3 + 2] = Math.max(point.blue, 0.04);

    randoms[i4] = rx;
    randoms[i4 + 1] = ry;
    randoms[i4 + 2] = rz;
    randoms[i4 + 3] = rw;
  }

  return { targets, bursts, colors, randoms };
}

function sampleSplineParticles(image, { width, height, maxParticles, splines }) {
  const { width: drawW, height: drawH } = getImageFrame(image, width, height);

  const canvas = document.createElement("canvas");
  canvas.width = drawW;
  canvas.height = drawH;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0, drawW, drawH);
  const data = context.getImageData(0, 0, drawW, drawH).data;

  const count = maxParticles;
  const targets = new Float32Array(count * 3);
  const bursts = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const randoms = new Float32Array(count * 4);
  const bounds = getSplineBounds(splines);

  for (let i = 0; i < count; i += 1) {
    const rx = hash2(i, splines.length, 101);
    const splineIndex = Math.round(rx * (splines.length - 1));
    const ry = hash2(i, splineIndex, 211);
    const rz = hash2(i, splineIndex, 307);
    const rw = hash2(i, splineIndex, 409);
    const travel = rw;
    const point = sampleSplinePoint(splines[splineIndex], travel % 1);
    const origin = normalize3(rx - 0.5, ry - 0.5, rz - 0.5);
    const thickness = (0.08 + Math.pow(hash2(point.x, point.y, 607), 2.15)) *
      (0.55 + rw * 0.9);
    const local = {
      x: point.x + origin.x * thickness,
      y: point.y + origin.y * thickness,
      z: point.z + origin.z * thickness,
    };
    const world = transformSplinePoint(local);
    const projected = projectSourceWorldPoint(world, drawW, drawH);
    const uvx = clamp((world.x + 7) / 14, 0, 1);
    const uvy = clamp((world.y + 5) / 10, 0, 1);
    const px = Math.floor(uvx * (drawW - 1));
    const py = Math.floor((1 - uvy) * (drawH - 1));
    const pi = (py * drawW + px) * 4;
    const shade = smoothstep(-10, 10, world.z);
    const i3 = i * 3;
    const i4 = i * 4;

    targets[i3] = projected.x;
    targets[i3 + 1] = projected.y;
    targets[i3 + 2] = world.z * 34;

    bursts[i3] = origin.x * drawW * 0.24;
    bursts[i3 + 1] = origin.y * drawH * 0.24;
    bursts[i3 + 2] = origin.z * 420;

    colors[i3] = Math.max((data[pi] / 255) * shade, 0.025);
    colors[i3 + 1] = Math.max((data[pi + 1] / 255) * shade, 0.025);
    colors[i3 + 2] = Math.max((data[pi + 2] / 255) * shade, 0.028);

    randoms[i4] = rx;
    randoms[i4 + 1] = ry;
    randoms[i4 + 2] = rz;
    randoms[i4 + 3] = rw;
  }

  return {
    targets,
    bursts,
    colors,
    randoms,
    splineSource: {
      splines,
      bounds,
      frame: { width: drawW, height: drawH },
    },
  };
}

function sampleSplinePoint(spline, travel) {
  const count = spline.length / 3;
  const t = travel * (count - 1);
  const index = Math.floor(t);
  const next = Math.min(count - 1, index + 1);
  const mix = t - index;
  const i0 = index * 3;
  const i1 = next * 3;

  return {
    x: THREE.MathUtils.lerp(spline[i0], spline[i1], mix),
    y: THREE.MathUtils.lerp(spline[i0 + 1], spline[i1 + 1], mix),
    z: THREE.MathUtils.lerp(spline[i0 + 2], spline[i1 + 2], mix),
  };
}

function transformSplinePoint(point) {
  return {
    x: point.z * 1.78,
    y: point.y * 1.54,
    z: -point.x * 0.5,
  };
}

function projectSourceWorldPoint(point, width, height) {
  const aspect = width / Math.max(height, 1);
  const distanceToCamera = Math.max(1, 22 - point.z);
  const perspective = 2.41421356237 / distanceToCamera;

  return {
    x: point.x * perspective / aspect * width * 0.5,
    y: point.y * perspective * height * 0.5,
  };
}

function getSplineBounds(splines) {
  const bounds = {
    minX: Infinity,
    minY: Infinity,
    minZ: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
    maxZ: -Infinity,
  };

  for (const spline of splines) {
    for (let i = 0; i < spline.length; i += 3) {
      const point = transformSplinePoint({
        x: spline[i],
        y: spline[i + 1],
        z: spline[i + 2],
      });
      bounds.minX = Math.min(bounds.minX, point.x);
      bounds.minY = Math.min(bounds.minY, point.y);
      bounds.minZ = Math.min(bounds.minZ, point.z);
      bounds.maxX = Math.max(bounds.maxX, point.x);
      bounds.maxY = Math.max(bounds.maxY, point.y);
      bounds.maxZ = Math.max(bounds.maxZ, point.z);
    }
  }

  return bounds;
}

function normalize3(x, y, z) {
  const length = Math.hypot(x, y, z) || 1;
  return { x: x / length, y: y / length, z: z / length };
}

function hash2(x, y, salt) {
  const n = Math.sin(x * 12.9898 + y * 78.233 + salt * 37.719) * 43758.5453;
  return n - Math.floor(n);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(min, max, value) {
  const x = clamp((value - min) / (max - min), 0, 1);
  return x * x * (3 - 2 * x);
}

function pickEvenly(points, maxParticles) {
  if (points.length <= maxParticles) return points;

  const selected = [];
  const stride = points.length / maxParticles;
  for (let i = 0; i < maxParticles; i += 1) {
    selected.push(points[Math.floor(i * stride)]);
  }

  return selected;
}
