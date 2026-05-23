import * as THREE from "three";
import { FluidSimulation } from "./fluid/FluidSimulation.js";
import { GpuParticlePositionSimulation } from "./particles/GpuParticlePositionSimulation.js";
import { getImageFrame } from "./media/mediaFrame.js";
import { loadJson, loadMedia, loadTexture } from "./media/loaders.js";
import { makeParticleLookupPositions } from "./particles/particleLookup.js";
import { sampleImage, sampleSplineParticles } from "./particles/particleSampling.js";
import { makePositionFallbackTexture, makeSolidTexture } from "./utils/textures.js";
import vertexShader from "./shaders/particles.vert.glsl?raw";
import fragmentShader from "./shaders/particles.frag.glsl?raw";
import imageVertexShader from "./shaders/image.vert.glsl?raw";
import imageFragmentShader from "./shaders/image.frag.glsl?raw";
import glowFragmentShader from "./shaders/glow.frag.glsl?raw";
import debugVertexShader from "./shaders/debug.vert.glsl?raw";
import debugFragmentShader from "./shaders/debug.frag.glsl?raw";

export class PearlBubbleEffect {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.sampleStep = options.sampleStep ?? 8;
    this.maxParticles = options.maxParticles ?? 32000;
    this.splineUrl = options.splineUrl ?? "/splines_anim4-SPLINES.json";
    this.useSpline = options.useSpline ?? true;
    this.cursorArea = options.cursorArea ?? 1;
    this.width = 1;
    this.height = 1;
    this.frame = { width: 1, height: 1 };
    this.debug = Boolean(options.debug);
    this.hasPointer = false;
    this.screenMouse = new THREE.Vector2(0, 0);
    this.fluidMouse = new THREE.Vector2(0, 0);
    this.lastFluidMouse = new THREE.Vector2(0, 0);
    this.hasFluidMouse = false;
    this.pulsePoint = new THREE.Vector2(99999, 99999);
    this.pulseDir = new THREE.Vector2(1, 0);
    this.pulseStrength = 0;
    this.smoothness = THREE.MathUtils.clamp(options.smoothness ?? 0.62, 0, 2);
    this.pulseScale = THREE.MathUtils.clamp(options.pulseScale ?? 1, 0, 2);
    this.glowScale = THREE.MathUtils.clamp(options.glowScale ?? 0.92, 0, 2);
    this.filterOverlay = options.filterOverlay ?? true;
    this.lastFrameAt = performance.now();
    this.baseDynamics = {
      relax: 0.07,
      mouseStrength: 6,
      flowToScreen: 4,
      separation: options.separation ?? 140,
    };

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: false,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setClearColor(0x050507, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.fluid = new FluidSimulation(this.renderer, {
      width: this.width,
      height: this.height,
      simSize: 256,
      dyeSize: 512,
      densityDissipation: 0.97,
      velocityDissipation: 0.98,
      pressureDissipation: 0.8,
      pressureIterations: 5,
      curl: 30,
      splatRadius: 5,
    });
    this.particleSimulation = new GpuParticlePositionSimulation(this.renderer, {
      relax: this.baseDynamics.relax,
      mouseStrength: this.baseDynamics.mouseStrength,
      flowToScreen: this.baseDynamics.flowToScreen,
      separation: this.baseDynamics.separation,
    });

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 2000);
    this.camera.position.z = 900;

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NormalBlending,
      uniforms: {
        uTime: { value: 0 },
        uDpr: { value: 1 },
        uSize: { value: options.size ?? 9 },
        uViewport: { value: new THREE.Vector2(1, 1) },
        uPulsePoint: { value: this.pulsePoint.clone() },
        uPulseDir: { value: this.pulseDir.clone() },
        uPulseStrength: { value: 0 },
        uPulseScale: { value: this.pulseScale },
        uSmoothness: { value: this.smoothness },
        uPositionTexture: { value: makePositionFallbackTexture() },
        uFluidVelocity: { value: this.fluid.velocityTexture },
        uFluidMask: { value: this.fluid.maskTexture },
        uMatcap: { value: makeSolidTexture(0xd6e5e7) },
      },
    });

    this.imageMaterial = new THREE.ShaderMaterial({
      vertexShader: imageVertexShader,
      fragmentShader: imageFragmentShader,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uImage: { value: null },
        uTime: { value: 0 },
        uSmoke: { value: options.smoke ?? 0.75 },
        uFrameSize: { value: new THREE.Vector2(1, 1) },
        uViewport: { value: new THREE.Vector2(1, 1) },
        uPulsePoint: { value: this.pulsePoint.clone() },
        uPulseDir: { value: this.pulseDir.clone() },
        uPulseStrength: { value: 0 },
        uPulseScale: { value: this.pulseScale },
        uSmoothness: { value: this.smoothness },
        uGlowScale: { value: this.glowScale },
        uFilterOverlay: { value: this.filterOverlay ? 1 : 0 },
        uFluidVelocity: { value: this.fluid.velocityTexture },
        uFluidMask: { value: this.fluid.maskTexture },
      },
    });

    this.glowMaterial = new THREE.ShaderMaterial({
      vertexShader: imageVertexShader,
      fragmentShader: glowFragmentShader,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uImage: { value: null },
        uTime: { value: 0 },
        uSmoke: { value: options.smoke ?? 0.75 },
        uViewport: { value: new THREE.Vector2(1, 1) },
        uPulsePoint: { value: this.pulsePoint.clone() },
        uPulseDir: { value: this.pulseDir.clone() },
        uPulseStrength: { value: 0 },
        uPulseScale: { value: this.pulseScale },
        uSmoothness: { value: this.smoothness },
        uGlowScale: { value: this.glowScale },
        uFluidVelocity: { value: this.fluid.velocityTexture },
        uFluidMask: { value: this.fluid.maskTexture },
      },
    });

    this.debugGroup = new THREE.Group();
    this.debugGroup.visible = this.debug;
    this.debugGroup.renderOrder = 10;
    this.scene.add(this.debugGroup);
    this.debugMaterials = [];
    this.createDebugOverlay();
    this.applyParticleDynamics();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.bindPointer();
    this.resize();
    this.loadSplines();
    this.setMatcap(
      options.matcap ?? "/matcap3.png",
    );
    this.animate();
  }

  async setImage(src) {
    const media = await loadMedia(src);
    this.image = media.element;
    if (this.texture) this.texture.dispose();
    this.texture = media.isVideo
      ? new THREE.VideoTexture(this.image)
      : new THREE.Texture(this.image);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.needsUpdate = true;
    this.imageMaterial.uniforms.uImage.value = this.texture;
    this.glowMaterial.uniforms.uImage.value = this.texture;
    this.rebuild();
  }

  async setMatcap(src) {
    try {
      const texture = await loadTexture(src);
      if (this.matcapTexture) this.matcapTexture.dispose();
      this.matcapTexture = texture;
      this.material.uniforms.uMatcap.value = texture;
    } catch {
      // Keep the procedural fallback if the optional matcap asset is unavailable.
    }
  }

  async loadSplines() {
    try {
      this.splines = await loadJson(this.splineUrl);
      if (this.image) this.rebuild();
    } catch {
      this.splines = null;
    }
  }

  setDensity(value) {
    this.sampleStep = Number(value);
    if (this.image) this.rebuild();
  }

  setSize(value) {
    this.material.uniforms.uSize.value = Number(value);
  }

  setSeparation(value) {
    this.baseDynamics.separation = Number(value);
    this.applyParticleDynamics();
  }

  setCursorArea(value) {
    this.cursorArea = THREE.MathUtils.clamp(Number(value), 0.01, 3);
  }

  setSmoke(value) {
    const smoke = Number(value);
    this.imageMaterial.uniforms.uSmoke.value = smoke;
    this.glowMaterial.uniforms.uSmoke.value = smoke;
  }

  setSmoothness(value) {
    this.smoothness = THREE.MathUtils.clamp(Number(value), 0, 2);
    this.material.uniforms.uSmoothness.value = this.smoothness;
    this.imageMaterial.uniforms.uSmoothness.value = this.smoothness;
    this.glowMaterial.uniforms.uSmoothness.value = this.smoothness;
  }

  setPulseScale(value) {
    this.pulseScale = THREE.MathUtils.clamp(Number(value), 0, 2);
    this.material.uniforms.uPulseScale.value = this.pulseScale;
    this.imageMaterial.uniforms.uPulseScale.value = this.pulseScale;
    this.glowMaterial.uniforms.uPulseScale.value = this.pulseScale;
  }

  setGlowScale(value) {
    this.glowScale = THREE.MathUtils.clamp(Number(value), 0, 2);
    this.imageMaterial.uniforms.uGlowScale.value = this.glowScale;
    this.glowMaterial.uniforms.uGlowScale.value = this.glowScale;
  }

  setFilterOverlay(value) {
    this.filterOverlay = Boolean(value);
    this.imageMaterial.uniforms.uFilterOverlay.value = this.filterOverlay ? 1 : 0;
  }

  setDebug(value) {
    this.debug = Boolean(value);
    this.debugGroup.visible = this.debug;
  }

  applyParticleDynamics() {
    this.particleSimulation.setSeparation(this.baseDynamics.separation);
    this.particleSimulation.setRelax(this.baseDynamics.relax);
    this.particleSimulation.setMouseStrength(this.baseDynamics.mouseStrength);
    this.particleSimulation.setFlowToScreen(this.baseDynamics.flowToScreen);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, Math.floor(rect.width));
    this.height = Math.max(1, Math.floor(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(this.width, this.height, false);
    this.material.uniforms.uDpr.value = dpr;
    this.material.uniforms.uViewport.value.set(this.width, this.height);
    this.imageMaterial.uniforms.uViewport.value.set(this.width, this.height);
    this.glowMaterial.uniforms.uViewport.value.set(this.width, this.height);
    this.fluid.setSize(this.width, this.height);

    this.camera.left = -this.width / 2;
    this.camera.right = this.width / 2;
    this.camera.top = this.height / 2;
    this.camera.bottom = -this.height / 2;
    this.camera.updateProjectionMatrix();
    this.layoutDebugOverlay();

    if (this.image) this.rebuild();
  }

  rebuild() {
    this.frame = getImageFrame(this.image, this.width, this.height);
    this.imageMaterial.uniforms.uFrameSize.value.set(
      this.frame.width,
      this.frame.height,
    );
    this.rebuildImagePlane();

    const particles = this.useSpline && this.splines
      ? sampleSplineParticles(this.image, {
          width: this.width,
          height: this.height,
          maxParticles: this.maxParticles,
          splines: this.splines,
        })
      : sampleImage(this.image, {
          width: this.width,
          height: this.height,
          step: this.sampleStep,
          maxParticles: this.maxParticles,
        });

    this.particleSimulation.reset(particles);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(
        makeParticleLookupPositions(particles.targets.length / 3, this.particleSimulation.size),
        3,
      ),
    );
    geometry.setAttribute(
      "particleColor",
      new THREE.BufferAttribute(particles.colors, 3),
    );
    geometry.setAttribute(
      "randoms",
      new THREE.BufferAttribute(particles.randoms, 4),
    );

    if (this.points) {
      this.points.geometry.dispose();
      this.scene.remove(this.points);
    }

    this.points = new THREE.Points(geometry, this.material);
    this.points.renderOrder = 1;
    this.scene.add(this.points);
    this.material.uniforms.uPositionTexture.value = this.particleSimulation.texture;
  }

  rebuildImagePlane() {
    if (this.imageMesh) {
      this.imageMesh.geometry.dispose();
      this.scene.remove(this.imageMesh);
    }
    if (this.glowMesh) {
      this.glowMesh.geometry.dispose();
      this.scene.remove(this.glowMesh);
    }

    const geometry = new THREE.PlaneGeometry(this.frame.width, this.frame.height, 1, 1);
    this.imageMesh = new THREE.Mesh(geometry, this.imageMaterial);
    this.imageMesh.position.z = -30;
    this.imageMesh.renderOrder = 2;
    this.scene.add(this.imageMesh);

    const glowGeometry = new THREE.PlaneGeometry(this.frame.width, this.frame.height, 1, 1);
    this.glowMesh = new THREE.Mesh(glowGeometry, this.glowMaterial);
    this.glowMesh.scale.set(1.08, 1.08, 1);
    this.glowMesh.position.z = -20;
    this.glowMesh.renderOrder = 3;
    this.scene.add(this.glowMesh);
  }

  bindPointer() {
    const move = (event) => {
      const rect = this.canvas.getBoundingClientRect();
      this.screenMouse.set(event.clientX - rect.left, event.clientY - rect.top);
      this.hasPointer = true;
    };

    const leave = () => {
      this.hasPointer = false;
      this.hasFluidMouse = false;
    };

    window.addEventListener("pointermove", move, { passive: true });
    this.canvas.addEventListener("pointerdown", move, { passive: true });
    this.canvas.addEventListener("pointerleave", leave);
    window.addEventListener("mousemove", move, { passive: true });
    this.canvas.addEventListener("mousedown", move, { passive: true });
    this.canvas.addEventListener("mouseleave", leave);
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const uniforms = this.material.uniforms;
    const imageUniforms = this.imageMaterial.uniforms;
    const now = performance.now();
    const delta = Math.min(0.05, (now - this.lastFrameAt) * 0.001 || 0.016);
    this.lastFrameAt = now;
    this.drawFluidSplat();
    this.fluid.step(delta);

    const time = now * 0.001;
    if (this.particleSimulation.texture) {
      this.particleSimulation.step(delta, {
        fluidVelocity: this.fluid.velocityTexture,
        fluidMask: this.fluid.maskTexture,
        viewport: uniforms.uViewport.value,
        time,
      });
    }
    uniforms.uTime.value = time;
    uniforms.uPositionTexture.value = this.particleSimulation.texture;
    uniforms.uFluidVelocity.value = this.fluid.velocityTexture;
    uniforms.uFluidMask.value = this.fluid.maskTexture;
    uniforms.uPulsePoint.value.copy(this.pulsePoint);
    uniforms.uPulseDir.value.copy(this.pulseDir);
    uniforms.uPulseStrength.value = this.pulseStrength;
    imageUniforms.uTime.value = time;
    imageUniforms.uFluidVelocity.value = this.fluid.velocityTexture;
    imageUniforms.uFluidMask.value = this.fluid.maskTexture;
    imageUniforms.uPulsePoint.value.copy(this.pulsePoint);
    imageUniforms.uPulseDir.value.copy(this.pulseDir);
    imageUniforms.uPulseStrength.value = this.pulseStrength;
    this.glowMaterial.uniforms.uTime.value = time;
    this.glowMaterial.uniforms.uPulsePoint.value.copy(this.pulsePoint);
    this.glowMaterial.uniforms.uPulseDir.value.copy(this.pulseDir);
    this.glowMaterial.uniforms.uPulseStrength.value = this.pulseStrength;
    this.glowMaterial.uniforms.uFluidVelocity.value = this.fluid.velocityTexture;
    this.glowMaterial.uniforms.uFluidMask.value = this.fluid.maskTexture;
    this.updateDebugOverlay();

    this.renderer.setRenderTarget(null);
    this.renderer.setViewport(0, 0, this.width, this.height);
    this.renderer.setScissorTest(false);
    this.renderer.render(this.scene, this.camera);
    this.pulseStrength *= Math.pow(0.88, delta * 60);
  }

  drawFluidSplat() {
    if (!this.hasPointer) return;

    this.fluidMouse.copy(this.screenMouse);
    if (!this.hasFluidMouse) {
      this.lastFluidMouse.copy(this.fluidMouse);
      this.hasFluidMouse = true;
      return;
    }

    const fluidVelocity = this.fluidMouse.clone().sub(this.lastFluidMouse);
    const speed = fluidVelocity.length();
    if (speed <= 0.01) return;

    const cappedVelocity = fluidVelocity.clone();
    const maxFrameDelta = 18;
    if (speed > maxFrameDelta) {
      cappedVelocity.multiplyScalar(maxFrameDelta / speed);
    }
    const cappedSpeed = cappedVelocity.length();
    if (cappedSpeed > 0.2) {
      this.pulseDir.set(cappedVelocity.x, -cappedVelocity.y).normalize();
      const centerX = (this.fluidMouse.x + this.lastFluidMouse.x) * 0.5;
      const centerY = (this.fluidMouse.y + this.lastFluidMouse.y) * 0.5;
      this.pulsePoint.set(centerX - this.width / 2, this.height / 2 - centerY);
      this.pulseStrength = Math.max(
        this.pulseStrength,
        THREE.MathUtils.clamp(cappedSpeed / 11, 0, 1),
      );
    }

    const size = THREE.MathUtils.mapLinear(
      THREE.MathUtils.clamp(cappedSpeed, 0, 14),
      0,
      14,
      12,
      68,
    ) * 0.72;
    const cursorScale = THREE.MathUtils.mapLinear(this.cursorArea, 0.01, 2.4, 0.12, 2.4);
    const cursorSize = size * cursorScale;
    const force = THREE.MathUtils.mapLinear(
      THREE.MathUtils.clamp(cappedSpeed, 0, 15),
      0,
      15,
      0,
      10,
    );

    this.fluid.drawInput(
      this.fluidMouse.x,
      this.fluidMouse.y,
      cappedVelocity.x * force,
      cappedVelocity.y * force,
      new THREE.Color(0xffffff),
      cursorSize,
    );
    this.lastFluidMouse.copy(this.fluidMouse);
  }

  createDebugOverlay() {
    const modes = [0, 1, 2];
    for (const mode of modes) {
      const material = new THREE.ShaderMaterial({
        vertexShader: debugVertexShader,
        fragmentShader: debugFragmentShader,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          uVelocity: { value: this.fluid.velocityTexture },
          uMask: { value: this.fluid.maskTexture },
          uMode: { value: mode },
          uOpacity: { value: 0.94 },
        },
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
      mesh.renderOrder = 10 + mode;
      this.debugGroup.add(mesh);
      this.debugMaterials.push(material);
    }
  }

  layoutDebugOverlay() {
    if (!this.debugGroup) return;

    const width = Math.min(176, Math.max(104, this.width * 0.16));
    const height = width * 0.56;
    const gap = 10;
    const left = -this.width / 2 + width / 2 + 18;
    const mobile = this.width <= 620;
    const y = mobile
      ? this.height / 2 - height / 2 - 18
      : -this.height / 2 + height / 2 + 18;

    this.debugGroup.children.forEach((mesh, index) => {
      mesh.scale.set(width, height, 1);
      mesh.position.set(left + index * (width + gap), y, 120);
    });
  }

  updateDebugOverlay() {
    for (const material of this.debugMaterials) {
      material.uniforms.uVelocity.value = this.fluid.velocityTexture;
      material.uniforms.uMask.value = this.fluid.maskTexture;
    }
  }
}
