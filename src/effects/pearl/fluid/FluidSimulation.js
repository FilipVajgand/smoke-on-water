import * as THREE from "three";
import fluidVertexShader from "./shaders/fullscreen.vert.glsl?raw";
import splatFragmentShader from "./shaders/splat.frag.glsl?raw";
import advectionFragmentShader from "./shaders/advection.frag.glsl?raw";
import curlFragmentShader from "./shaders/curl.frag.glsl?raw";
import vorticityFragmentShader from "./shaders/vorticity.frag.glsl?raw";
import divergenceFragmentShader from "./shaders/divergence.frag.glsl?raw";
import clearFragmentShader from "./shaders/clear.frag.glsl?raw";
import pressureFragmentShader from "./shaders/pressure.frag.glsl?raw";
import gradientSubtractFragmentShader from "./shaders/gradient-subtract.frag.glsl?raw";

export class FluidSimulation {
  constructor(renderer, options = {}) {
    this.renderer = renderer;
    this.width = options.width ?? 1;
    this.height = options.height ?? 1;
    this.simSize = options.simSize ?? 128;
    this.dyeSize = options.dyeSize ?? 512;
    this.config = {
      densityDissipation: options.densityDissipation ?? 0.97,
      velocityDissipation: options.velocityDissipation ?? 0.98,
      pressureDissipation: options.pressureDissipation ?? 0.8,
      pressureIterations: options.pressureIterations ?? 5,
      curl: options.curl ?? 30,
      splatRadius: options.splatRadius ?? 25,
    };

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);

    this.velocity = createDoubleTarget(this.simSize, this.simSize, THREE.LinearFilter);
    this.density = createDoubleTarget(this.dyeSize, this.dyeSize, THREE.LinearFilter);
    this.energy = createDoubleTarget(this.dyeSize, this.dyeSize, THREE.LinearFilter);
    this.pressure = createDoubleTarget(this.simSize, this.simSize, THREE.NearestFilter);
    this.divergence = createTarget(this.simSize, this.simSize, THREE.NearestFilter);
    this.curl = createTarget(this.simSize, this.simSize, THREE.NearestFilter);

    this.materials = this.createMaterials();
    this.lastSplatAt = 0;
    this.canRender = 0;
    this.tmpPoint = new THREE.Vector2();

    this.clearTarget(this.velocity.read);
    this.clearTarget(this.velocity.write);
    this.clearTarget(this.density.read);
    this.clearTarget(this.density.write);
    this.clearTarget(this.energy.read);
    this.clearTarget(this.energy.write);
    this.clearTarget(this.pressure.read);
    this.clearTarget(this.pressure.write);
    this.clearTarget(this.divergence);
    this.clearTarget(this.curl);
  }

  get velocityTexture() {
    return this.velocity.read.texture;
  }

  get maskTexture() {
    return this.density.read.texture;
  }

  get energyTexture() {
    return this.energy.read.texture;
  }

  setSize(width, height) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.materials.splat.uniforms.aspectRatio.value = this.width / this.height;
  }

  setDissipation({ densityDissipation, velocityDissipation }) {
    if (densityDissipation !== undefined) {
      this.config.densityDissipation = THREE.MathUtils.clamp(Number(densityDissipation), 0, 1);
    }
    if (velocityDissipation !== undefined) {
      this.config.velocityDissipation = THREE.MathUtils.clamp(Number(velocityDissipation), 0, 1);
    }
  }

  drawInput(x, y, dx, dy, color, radius = this.config.splatRadius, independent = false) {
    this.tmpPoint.set(x / this.width, 1 - y / this.height);
    const now = performance.now();
    const delta = now - this.lastSplatAt;
    this.lastSplatAt = now;

    const splat = this.materials.splat.uniforms;
    if (delta > 50 || independent) {
      splat.prevPoint.value.copy(this.tmpPoint);
    } else {
      splat.prevPoint.value.copy(splat.point.value);
    }

    splat.point.value.copy(this.tmpPoint);
    splat.radius.value = radius / 200;
    splat.aspectRatio.value = this.width / this.height;
    splat.canRender.value = this.canRender;

    splat.uTarget.value = this.velocity.read.texture;
    splat.color.value.set(dx, -dy, 1);
    splat.uAdd.value = 1;
    this.render(this.materials.splat, this.velocity.write);
    this.velocity.swap();

    splat.uTarget.value = this.density.read.texture;
    splat.color.value.set(color.r, color.g, color.b);
    splat.uAdd.value = 1;
    this.render(this.materials.splat, this.density.write);
    this.density.swap();

    this.canRender = 1;
  }

  drawEnergy(x, y, color, radius = this.config.splatRadius, independent = true) {
    this.tmpPoint.set(x / this.width, 1 - y / this.height);

    const splat = this.materials.splat.uniforms;
    if (independent) {
      splat.prevPoint.value.copy(this.tmpPoint);
    } else {
      splat.prevPoint.value.copy(splat.point.value);
    }

    splat.point.value.copy(this.tmpPoint);
    splat.radius.value = radius / 200;
    splat.aspectRatio.value = this.width / this.height;
    splat.canRender.value = this.canRender;
    splat.uTarget.value = this.energy.read.texture;
    splat.color.value.set(color.r, color.g, color.b);
    splat.uAdd.value = 1;
    this.render(this.materials.splat, this.energy.write);
    this.energy.swap();
  }

  drawEnergySegment(fromX, fromY, toX, toY, color, radius = this.config.splatRadius) {
    const splat = this.materials.splat.uniforms;
    splat.prevPoint.value.set(fromX / this.width, 1 - fromY / this.height);
    splat.point.value.set(toX / this.width, 1 - toY / this.height);
    splat.radius.value = radius / 200;
    splat.aspectRatio.value = this.width / this.height;
    splat.canRender.value = this.canRender;
    splat.uTarget.value = this.energy.read.texture;
    splat.color.value.set(color.r, color.g, color.b);
    splat.uAdd.value = 1;
    this.render(this.materials.splat, this.energy.write);
    this.energy.swap();
  }

  step(delta) {
    const dt = Math.min(1 / 30, Math.max(1 / 120, delta || 1 / 60));
    const hz = dt * 60;

    this.materials.curl.uniforms.uVelocity.value = this.velocity.read.texture;
    this.render(this.materials.curl, this.curl);

    this.materials.vorticity.uniforms.uVelocity.value = this.velocity.read.texture;
    this.materials.vorticity.uniforms.uCurl.value = this.curl.texture;
    this.materials.vorticity.uniforms.curl.value = this.config.curl;
    this.materials.vorticity.uniforms.dt.value = dt;
    this.render(this.materials.vorticity, this.velocity.write);
    this.velocity.swap();

    this.materials.divergence.uniforms.uVelocity.value = this.velocity.read.texture;
    this.render(this.materials.divergence, this.divergence);

    this.materials.clear.uniforms.uTexture.value = this.pressure.read.texture;
    this.materials.clear.uniforms.value.value = normalizedDecay(
      this.config.pressureDissipation,
      hz,
    );
    this.render(this.materials.clear, this.pressure.write);
    this.pressure.swap();

    this.materials.pressure.uniforms.uDivergence.value = this.divergence.texture;
    for (let i = 0; i < this.config.pressureIterations; i += 1) {
      this.materials.pressure.uniforms.uPressure.value = this.pressure.read.texture;
      this.render(this.materials.pressure, this.pressure.write);
      this.pressure.swap();
    }

    this.materials.gradientSubtract.uniforms.uPressure.value = this.pressure.read.texture;
    this.materials.gradientSubtract.uniforms.uVelocity.value = this.velocity.read.texture;
    this.render(this.materials.gradientSubtract, this.velocity.write);
    this.velocity.swap();

    this.materials.advection.uniforms.texelSize.value.set(
      1 / this.simSize,
      1 / this.simSize,
    );
    this.materials.advection.uniforms.uVelocity.value = this.velocity.read.texture;
    this.materials.advection.uniforms.uSource.value = this.velocity.read.texture;
    this.materials.advection.uniforms.dissipation.value = normalizedDecay(
      this.config.velocityDissipation,
      hz,
    );
    this.materials.advection.uniforms.dt.value = dt;
    this.render(this.materials.advection, this.velocity.write);
    this.velocity.swap();

    this.materials.advection.uniforms.texelSize.value.set(
      1 / this.dyeSize,
      1 / this.dyeSize,
    );
    this.materials.advection.uniforms.uVelocity.value = this.velocity.read.texture;
    this.materials.advection.uniforms.uSource.value = this.density.read.texture;
    this.materials.advection.uniforms.dissipation.value = normalizedDecay(
      this.config.densityDissipation,
      hz,
    );
    this.materials.advection.uniforms.dt.value = dt;
    this.render(this.materials.advection, this.density.write);
    this.density.swap();

    this.materials.advection.uniforms.uVelocity.value = this.velocity.read.texture;
    this.materials.advection.uniforms.uSource.value = this.energy.read.texture;
    this.materials.advection.uniforms.dissipation.value = normalizedDecay(0.8, hz);
    this.materials.advection.uniforms.dt.value = dt;
    this.render(this.materials.advection, this.energy.write);
    this.energy.swap();
  }

  createMaterials() {
    const simTexel = new THREE.Vector2(1 / this.simSize, 1 / this.simSize);

    return {
      splat: makeMaterial(splatFragmentShader, {
        uTarget: { value: null },
        aspectRatio: { value: this.width / this.height },
        color: { value: new THREE.Vector3() },
        point: { value: new THREE.Vector2() },
        prevPoint: { value: new THREE.Vector2() },
        radius: { value: this.config.splatRadius / 200 },
        canRender: { value: 0 },
        uAdd: { value: 1 },
      }),
      advection: makeMaterial(advectionFragmentShader, {
        texelSize: { value: simTexel.clone() },
        uVelocity: { value: null },
        uSource: { value: null },
        dt: { value: 1 / 60 },
        dissipation: { value: this.config.velocityDissipation },
      }),
      curl: makeMaterial(curlFragmentShader, {
        texelSize: { value: simTexel.clone() },
        uVelocity: { value: null },
      }),
      vorticity: makeMaterial(vorticityFragmentShader, {
        texelSize: { value: simTexel.clone() },
        uVelocity: { value: null },
        uCurl: { value: null },
        curl: { value: this.config.curl },
        dt: { value: 1 / 60 },
      }),
      divergence: makeMaterial(divergenceFragmentShader, {
        texelSize: { value: simTexel.clone() },
        uVelocity: { value: null },
      }),
      clear: makeMaterial(clearFragmentShader, {
        texelSize: { value: simTexel.clone() },
        uTexture: { value: null },
        value: { value: this.config.pressureDissipation },
      }),
      pressure: makeMaterial(pressureFragmentShader, {
        texelSize: { value: simTexel.clone() },
        uPressure: { value: null },
        uDivergence: { value: null },
      }),
      gradientSubtract: makeMaterial(gradientSubtractFragmentShader, {
        texelSize: { value: simTexel.clone() },
        uPressure: { value: null },
        uVelocity: { value: null },
      }),
    };
  }

  clearTarget(target) {
    const currentTarget = this.renderer.getRenderTarget();
    const currentClearColor = new THREE.Color();
    this.renderer.getClearColor(currentClearColor);
    const currentClearAlpha = this.renderer.getClearAlpha();

    this.renderer.setRenderTarget(target);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear(true, false, false);
    this.renderer.setRenderTarget(currentTarget);
    this.renderer.setClearColor(currentClearColor, currentClearAlpha);
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
}

function createTarget(width, height, filter) {
  const target = new THREE.WebGLRenderTarget(width, height, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: filter,
    magFilter: filter,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false,
  });

  target.texture.name = "FluidSimulationTarget";
  target.texture.wrapS = THREE.ClampToEdgeWrapping;
  target.texture.wrapT = THREE.ClampToEdgeWrapping;
  return target;
}

function createDoubleTarget(width, height, filter) {
  return {
    read: createTarget(width, height, filter),
    write: createTarget(width, height, filter),
    swap() {
      const temp = this.read;
      this.read = this.write;
      this.write = temp;
    },
  };
}

function makeMaterial(fragmentShader, uniforms) {
  return new THREE.ShaderMaterial({
    vertexShader: fluidVertexShader,
    fragmentShader,
    uniforms,
    depthTest: false,
    depthWrite: false,
  });
}

function normalizedDecay(value, hz) {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return Math.pow(value, hz);
}
