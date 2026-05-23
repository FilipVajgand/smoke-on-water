import * as THREE from "three";
import vertexShader from "./shaders/fullscreen.vert.glsl?raw";
import copyFragmentShader from "./shaders/copy.frag.glsl?raw";
import simulationFragmentShader from "./shaders/simulation.frag.glsl?raw";

export class GpuParticlePositionSimulation {
  constructor(renderer, options = {}) {
    this.renderer = renderer;
    this.relax = options.relax ?? 0.07;
    this.mouseStrength = options.mouseStrength ?? 10;
    this.flowToScreen = options.flowToScreen ?? 18;
    this.separation = options.separation ?? 72;
    this.size = 1;

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);

    this.copyMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader: copyFragmentShader,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uTexture: { value: null },
      },
    });

    this.simulationMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader: simulationFragmentShader,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uPosition: { value: null },
        uTarget: { value: null },
        uRandom: { value: null },
        uSpline: { value: makeSolidFloatTexture() },
        uFluidVelocity: { value: null },
        uFluidMask: { value: null },
        uViewport: { value: new THREE.Vector2(1, 1) },
        uFrameSize: { value: new THREE.Vector2(1, 1) },
        uSplineBoundsMin: { value: new THREE.Vector3() },
        uSplineBoundsSize: { value: new THREE.Vector3(1, 1, 1) },
        uHz: { value: 1 },
        uTime: { value: 0 },
        uRelax: { value: this.relax },
        uMouseStrength: { value: this.mouseStrength },
        uFlowToScreen: { value: this.flowToScreen },
        uSeparation: { value: this.separation },
        uUseSpline: { value: 0 },
        uSplineTexSize: { value: 1 },
        uPerSpline: { value: 1 },
        uSplineCount: { value: 1 },
        uTimeMultiplier: { value: 0.17 },
        uSplineSpeed: { value: new THREE.Vector2(0.82, 1.21) },
      },
    });
  }

  get texture() {
    return this.position?.read.texture ?? null;
  }

  setSeparation(value) {
    this.separation = Number(value);
    this.simulationMaterial.uniforms.uSeparation.value = this.separation;
  }

  setRelax(value) {
    this.relax = Number(value);
    this.simulationMaterial.uniforms.uRelax.value = this.relax;
  }

  setMouseStrength(value) {
    this.mouseStrength = Number(value);
    this.simulationMaterial.uniforms.uMouseStrength.value = this.mouseStrength;
  }

  setFlowToScreen(value) {
    this.flowToScreen = Number(value);
    this.simulationMaterial.uniforms.uFlowToScreen.value = this.flowToScreen;
  }

  reset(particles) {
    this.disposeTargets();

    const count = particles.targets.length / 3;
    this.size = Math.ceil(Math.sqrt(count));
    const length = this.size * this.size;
    const positionData = new Float32Array(length * 4);
    const targetData = new Float32Array(length * 4);
    const randomData = new Float32Array(length * 4);

    for (let i = 0; i < length; i += 1) {
      const i3 = i * 3;
      const i4 = i * 4;
      if (i < count) {
        positionData[i4] = particles.targets[i3];
        positionData[i4 + 1] = particles.targets[i3 + 1];
        positionData[i4 + 2] = particles.targets[i3 + 2];
        positionData[i4 + 3] = 1;

        targetData[i4] = particles.targets[i3];
        targetData[i4 + 1] = particles.targets[i3 + 1];
        targetData[i4 + 2] = particles.targets[i3 + 2];
        targetData[i4 + 3] = 1;

        randomData[i4] = particles.randoms[i4] ?? 0;
        randomData[i4 + 1] = particles.randoms[i4 + 1] ?? 0;
        randomData[i4 + 2] = particles.randoms[i4 + 2] ?? 0;
        randomData[i4 + 3] = particles.randoms[i4 + 3] ?? 0;
      }
    }

    this.initialTexture = makeDataTexture(positionData, this.size);
    this.targetTexture = makeDataTexture(targetData, this.size);
    this.randomTexture = makeDataTexture(randomData, this.size);
    this.setSplineData(particles.splineSource);
    this.position = {
      read: createTarget(this.size, this.size),
      write: createTarget(this.size, this.size),
      swap() {
        const temp = this.read;
        this.read = this.write;
        this.write = temp;
      },
    };

    this.copyInitialTexture();
  }

  step(delta, { fluidVelocity, fluidMask, viewport, time }) {
    if (!this.position) return;

    const uniforms = this.simulationMaterial.uniforms;
    uniforms.uPosition.value = this.position.read.texture;
    uniforms.uTarget.value = this.targetTexture;
    uniforms.uRandom.value = this.randomTexture;
    uniforms.uSpline.value = this.splineTexture ?? uniforms.uSpline.value;
    uniforms.uFluidVelocity.value = fluidVelocity;
    uniforms.uFluidMask.value = fluidMask;
    uniforms.uViewport.value.copy(viewport);
    uniforms.uHz.value = Math.min(2, Math.max(0.5, (delta || 1 / 60) * 60));
    uniforms.uTime.value = time;
    uniforms.uRelax.value = this.relax;
    uniforms.uMouseStrength.value = this.mouseStrength;
    uniforms.uFlowToScreen.value = this.flowToScreen;
    uniforms.uSeparation.value = this.separation;
    uniforms.uUseSpline.value = this.splineTexture ? 1 : 0;

    this.render(this.simulationMaterial, this.position.write);
    this.position.swap();
  }

  setSplineData(splineSource) {
    if (this.splineTexture) this.splineTexture.dispose();
    this.splineTexture = null;

    const uniforms = this.simulationMaterial.uniforms;
    uniforms.uUseSpline.value = 0;
    if (!splineSource) return;

    const { texture, textureSize, perSpline, count, bounds, frame } = makeSplineTexture(splineSource);
    this.splineTexture = texture;
    uniforms.uSpline.value = texture;
    uniforms.uSplineTexSize.value = textureSize;
    uniforms.uPerSpline.value = perSpline;
    uniforms.uSplineCount.value = count;
    uniforms.uFrameSize.value.set(frame.width, frame.height);
    uniforms.uSplineBoundsMin.value.set(bounds.minX, bounds.minY, bounds.minZ);
    uniforms.uSplineBoundsSize.value.set(
      bounds.maxX - bounds.minX || 1,
      bounds.maxY - bounds.minY || 1,
      bounds.maxZ - bounds.minZ || 1,
    );
    uniforms.uUseSpline.value = 1;
  }

  copyInitialTexture() {
    this.copyMaterial.uniforms.uTexture.value = this.initialTexture;
    this.render(this.copyMaterial, this.position.read);
    this.render(this.copyMaterial, this.position.write);
  }

  render(material, target) {
    const currentTarget = this.renderer.getRenderTarget();
    const currentAutoClear = this.renderer.autoClear;
    this.quad.material = material;
    this.renderer.autoClear = false;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(currentTarget);
    this.renderer.autoClear = currentAutoClear;
  }

  disposeTargets() {
    if (this.initialTexture) this.initialTexture.dispose();
    if (this.targetTexture) this.targetTexture.dispose();
    if (this.randomTexture) this.randomTexture.dispose();
    if (this.splineTexture) this.splineTexture.dispose();
    if (this.position) {
      this.position.read.dispose();
      this.position.write.dispose();
    }
    this.initialTexture = null;
    this.targetTexture = null;
    this.randomTexture = null;
    this.splineTexture = null;
    this.position = null;
  }

  dispose() {
    this.disposeTargets();
    this.copyMaterial.dispose();
    this.simulationMaterial.dispose();
    this.quad.geometry.dispose();
  }
}

function makeDataTexture(data, size) {
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.FloatType);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function makeSolidFloatTexture() {
  return makeDataTexture(new Float32Array([0, 0, 0, 1]), 1);
}

function makeSplineTexture({ splines, bounds, frame }) {
  const count = splines.length;
  const perSpline = splines[0]?.length / 3 || 1;
  const floatCount = count * (splines[0]?.length || 3);
  const textureSize = getSourceTextureSize(floatCount);
  const data = new Float32Array(textureSize * textureSize * 4);

  for (let splineIndex = 0; splineIndex < count; splineIndex += 1) {
    const spline = splines[splineIndex];
    for (let pointIndex = 0; pointIndex < perSpline; pointIndex += 1) {
      const sourceIndex = pointIndex * 3;
      const pixel = splineIndex * perSpline + pointIndex;
      const targetIndex = pixel * 4;
      data[targetIndex] = spline[sourceIndex] ?? 0;
      data[targetIndex + 1] = spline[sourceIndex + 1] ?? 0;
      data[targetIndex + 2] = spline[sourceIndex + 2] ?? 0;
      data[targetIndex + 3] = 1;
    }
  }

  return {
    texture: makeDataTexture(data, textureSize),
    textureSize,
    perSpline,
    count,
    bounds,
    frame,
  };
}

function getSourceTextureSize(floatCount) {
  const sizes = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096];
  return sizes.find((size) => size * size >= floatCount) ?? sizes[sizes.length - 1];
}

function createTarget(width, height) {
  const target = new THREE.WebGLRenderTarget(width, height, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false,
  });

  target.texture.name = "GpuParticlePosition";
  target.texture.wrapS = THREE.ClampToEdgeWrapping;
  target.texture.wrapT = THREE.ClampToEdgeWrapping;
  return target;
}
