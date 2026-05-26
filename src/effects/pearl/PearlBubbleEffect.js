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
    this.pendingFluidPoints = [];
    this.hasFluidMouse = false;
    this.pulsePoint = new THREE.Vector2(99999, 99999);
    this.pulseDir = new THREE.Vector2(1, 0);
    this.pulseStrength = 0;
    this.effectActiveUntil = performance.now() + 1200;
    this.lastRenderAt = 0;
    this.energyTrailColor = new THREE.Color();
    this.energyHeadColor = new THREE.Color();
    this.glowColor = new THREE.Color(options.glowColor ?? "#8eefff");
    this.smoothness = THREE.MathUtils.clamp(options.smoothness ?? 0.62, 0, 8);
    this.pulseScale = THREE.MathUtils.clamp(options.pulseScale ?? 1, 0, 4);
    this.glowScale = THREE.MathUtils.clamp(options.glowScale ?? 0.92, 0, 4);
    this.glowOpacity = THREE.MathUtils.clamp(options.glowOpacity ?? 1, 0, 2);
    this.effectStyle = normalizeEffectStyle(options.effectStyle);
    this.effectStyleAmount = getEffectStyleAmount(this.effectStyle);
    this.imageWarp = options.imageWarp ?? true;
    this.imageFade = options.imageFade ?? true;
    this.revealDepth = THREE.MathUtils.clamp(options.revealDepth ?? 0.72, 0, 2);
    this.arcGlow = options.arcGlow ?? true;
    this.pearlMaskReveal = options.pearlMaskReveal ?? false;
    this.filterOverlay = options.filterOverlay ?? true;
    this.revealHoldBase = {
      hold: 0.4,
      densityDissipation: options.densityDissipation ?? 0.97,
      velocityDissipation: options.velocityDissipation ?? 0.98,
    };
    this.revealHold = THREE.MathUtils.clamp(options.revealHold ?? this.revealHoldBase.hold, 0.25, 6);
    const revealDecay = getRevealDecay(this.revealHold, this.revealHoldBase);
    this.lastFrameAt = performance.now();
    this.maxPixelRatio = options.maxPixelRatio ?? 1.35;
    this.activeFps = options.activeFps ?? 50;
    this.idleVideoFps = options.idleVideoFps ?? 24;
    this.idleImageFps = options.idleImageFps ?? 12;
    this.isVideoSource = false;
    this.baseDynamics = {
      relax: 0.07,
      mouseStrength: 1,
      flowToScreen: 1,
      separation: options.separation ?? 140,
    };

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: false,
      antialias: false,
      powerPreference: "low-power",
    });
    this.renderer.setClearColor(0x050507, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.fluid = new FluidSimulation(this.renderer, {
      width: this.width,
      height: this.height,
      simSize: options.fluidSimSize ?? 192,
      dyeSize: options.fluidDyeSize ?? 384,
      densityDissipation: revealDecay.densityDissipation,
      velocityDissipation: revealDecay.velocityDissipation,
      pressureDissipation: 0.8,
      pressureIterations: options.pressureIterations ?? 4,
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
        uEffectStyle: { value: this.effectStyleAmount },
        uArcGlow: { value: this.arcGlow ? 1 : 0 },
        uPearlMaskReveal: { value: this.pearlMaskReveal ? 1 : 0 },
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
        uGlowOpacity: { value: this.glowOpacity },
        uGlowColor: { value: this.glowColor.clone() },
        uArcGlow: { value: this.arcGlow ? 1 : 0 },
        uEffectStyle: { value: this.effectStyleAmount },
        uImageWarp: { value: this.imageWarp ? 1 : 0 },
        uImageFade: { value: this.imageFade ? 1 : 0 },
        uRevealDepth: { value: this.revealDepth },
        uFilterOverlay: { value: this.filterOverlay ? 1 : 0 },
        uFluidVelocity: { value: this.fluid.velocityTexture },
        uFluidMask: { value: this.fluid.maskTexture },
        uFluidEnergy: { value: this.fluid.energyTexture },
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
        uGlowOpacity: { value: this.glowOpacity },
        uGlowColor: { value: this.glowColor.clone() },
        uArcGlow: { value: this.arcGlow ? 1 : 0 },
        uFluidVelocity: { value: this.fluid.velocityTexture },
        uFluidMask: { value: this.fluid.maskTexture },
        uFluidEnergy: { value: this.fluid.energyTexture },
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
    this.isVideoSource = media.isVideo;
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
    this.markEffectActive(1000);
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

  setRevealHold(value) {
    this.revealHold = THREE.MathUtils.clamp(Number(value), 0.25, 6);
    this.fluid.setDissipation(getRevealDecay(this.revealHold, this.revealHoldBase));
  }

  setRevealDepth(value) {
    this.revealDepth = THREE.MathUtils.clamp(Number(value), 0, 2);
    this.imageMaterial.uniforms.uRevealDepth.value = this.revealDepth;
  }

  setSmoke(value) {
    const smoke = Number(value);
    this.imageMaterial.uniforms.uSmoke.value = smoke;
    this.glowMaterial.uniforms.uSmoke.value = smoke;
  }

  setSmoothness(value) {
    this.smoothness = THREE.MathUtils.clamp(Number(value), 0, 8);
    this.material.uniforms.uSmoothness.value = this.smoothness;
    this.imageMaterial.uniforms.uSmoothness.value = this.smoothness;
    this.glowMaterial.uniforms.uSmoothness.value = this.smoothness;
  }

  setPulseScale(value) {
    this.pulseScale = THREE.MathUtils.clamp(Number(value), 0, 4);
    this.material.uniforms.uPulseScale.value = this.pulseScale;
    this.imageMaterial.uniforms.uPulseScale.value = this.pulseScale;
    this.glowMaterial.uniforms.uPulseScale.value = this.pulseScale;
  }

  setGlowScale(value) {
    this.glowScale = THREE.MathUtils.clamp(Number(value), 0, 4);
    this.imageMaterial.uniforms.uGlowScale.value = this.glowScale;
    this.glowMaterial.uniforms.uGlowScale.value = this.glowScale;
  }

  setGlowOpacity(value) {
    this.glowOpacity = THREE.MathUtils.clamp(Number(value), 0, 2);
    this.imageMaterial.uniforms.uGlowOpacity.value = this.glowOpacity;
    this.glowMaterial.uniforms.uGlowOpacity.value = this.glowOpacity;
  }

  setGlowColor(value) {
    this.glowColor.set(value || "#8eefff");
    this.imageMaterial.uniforms.uGlowColor.value.copy(this.glowColor);
    this.glowMaterial.uniforms.uGlowColor.value.copy(this.glowColor);
  }

  setEffectStyle(value) {
    this.effectStyle = normalizeEffectStyle(value);
    this.effectStyleAmount = getEffectStyleAmount(this.effectStyle);
    this.material.uniforms.uEffectStyle.value = this.effectStyleAmount;
    this.imageMaterial.uniforms.uEffectStyle.value = this.effectStyleAmount;
    this.applyParticleDynamics();
  }

  setImageWarp(value) {
    this.imageWarp = Boolean(value);
    this.imageMaterial.uniforms.uImageWarp.value = this.imageWarp ? 1 : 0;
  }

  setImageFade(value) {
    this.imageFade = Boolean(value);
    this.imageMaterial.uniforms.uImageFade.value = this.imageFade ? 1 : 0;
  }

  setFilterOverlay(value) {
    this.filterOverlay = Boolean(value);
    this.imageMaterial.uniforms.uFilterOverlay.value = this.filterOverlay ? 1 : 0;
  }

  setArcGlow(value) {
    this.arcGlow = Boolean(value);
    this.material.uniforms.uArcGlow.value = this.arcGlow ? 1 : 0;
    this.imageMaterial.uniforms.uArcGlow.value = this.arcGlow ? 1 : 0;
    this.glowMaterial.uniforms.uArcGlow.value = this.arcGlow ? 1 : 0;
    if (this.glowMesh) this.glowMesh.visible = this.arcGlow;
  }

  setPearlMaskReveal(value) {
    this.pearlMaskReveal = Boolean(value);
    this.material.uniforms.uPearlMaskReveal.value = this.pearlMaskReveal ? 1 : 0;
  }

  setDebug(value) {
    this.debug = Boolean(value);
    this.debugGroup.visible = this.debug;
  }

  applyParticleDynamics() {
    const style = getEffectDynamics(this.effectStyle);
    this.particleSimulation.setSeparation(this.baseDynamics.separation * style.separation);
    this.particleSimulation.setRelax(this.baseDynamics.relax * style.relax);
    this.particleSimulation.setMouseStrength(this.baseDynamics.mouseStrength * style.mouseStrength);
    this.particleSimulation.setFlowToScreen(this.baseDynamics.flowToScreen * style.flowToScreen);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, Math.floor(rect.width));
    this.height = Math.max(1, Math.floor(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, this.maxPixelRatio);

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
    this.glowMesh.scale.set(1, 1, 1);
    this.glowMesh.position.z = -20;
    this.glowMesh.renderOrder = 3;
    this.glowMesh.visible = this.arcGlow;
    this.scene.add(this.glowMesh);
  }

  bindPointer() {
    const move = (event) => {
      const rect = this.canvas.getBoundingClientRect();
      this.screenMouse.set(event.clientX - rect.left, event.clientY - rect.top);
      this.pendingFluidPoints.push(this.screenMouse.clone());
      if (this.pendingFluidPoints.length > 32) {
        this.pendingFluidPoints.splice(0, this.pendingFluidPoints.length - 32);
      }
      this.markEffectActive();
      this.hasPointer = true;
    };

    const leave = () => {
      this.hasPointer = false;
      this.hasFluidMouse = false;
      this.pendingFluidPoints.length = 0;
    };

    const hasPointerEvents = "PointerEvent" in window;
    window.addEventListener(hasPointerEvents ? "pointermove" : "mousemove", move, { passive: true });
    this.canvas.addEventListener(hasPointerEvents ? "pointerdown" : "mousedown", move, { passive: true });
    this.canvas.addEventListener(hasPointerEvents ? "pointerleave" : "mouseleave", leave);
  }

  markEffectActive(duration = this.getEffectActiveDuration()) {
    this.effectActiveUntil = Math.max(this.effectActiveUntil, performance.now() + duration);
  }

  getEffectActiveDuration() {
    return 2000 + this.revealHold * 2200;
  }

  isVideoPlaying() {
    return this.isVideoSource && this.image && !this.image.paused && !this.image.ended;
  }

  isEffectActive(now) {
    return this.pendingFluidPoints.length > 0 || this.pulseStrength > 0.002 || now < this.effectActiveUntil;
  }

  getTargetFps(now) {
    if (this.isEffectActive(now) || this.debug) return this.activeFps;
    if (this.isVideoPlaying()) return this.idleVideoFps;
    return this.idleImageFps;
  }

  animate(frameTime = performance.now()) {
    requestAnimationFrame((nextFrameTime) => this.animate(nextFrameTime));

    const now = typeof frameTime === "number" ? frameTime : performance.now();
    const targetFps = this.getTargetFps(now);
    if (now - this.lastRenderAt < 1000 / targetFps) return;
    this.lastRenderAt = now;

    const uniforms = this.material.uniforms;
    const imageUniforms = this.imageMaterial.uniforms;
    const delta = Math.min(0.05, (now - this.lastFrameAt) * 0.001 || 0.016);
    this.lastFrameAt = now;
    this.drawFluidSplat();
    const effectActive = this.isEffectActive(now) || this.debug;
    if (effectActive) {
      this.fluid.step(delta);
    }

    const time = now * 0.001;
    if (this.particleSimulation.texture && effectActive) {
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
    imageUniforms.uFluidEnergy.value = this.fluid.energyTexture;
    imageUniforms.uPulsePoint.value.copy(this.pulsePoint);
    imageUniforms.uPulseDir.value.copy(this.pulseDir);
    imageUniforms.uPulseStrength.value = this.pulseStrength;
    this.glowMaterial.uniforms.uTime.value = time;
    this.glowMaterial.uniforms.uPulsePoint.value.copy(this.pulsePoint);
    this.glowMaterial.uniforms.uPulseDir.value.copy(this.pulseDir);
    this.glowMaterial.uniforms.uPulseStrength.value = this.pulseStrength;
    this.glowMaterial.uniforms.uFluidVelocity.value = this.fluid.velocityTexture;
    this.glowMaterial.uniforms.uFluidMask.value = this.fluid.maskTexture;
    this.glowMaterial.uniforms.uFluidEnergy.value = this.fluid.energyTexture;
    this.updateDebugOverlay();

    this.renderer.setRenderTarget(null);
    this.renderer.setViewport(0, 0, this.width, this.height);
    this.renderer.setScissorTest(false);
    this.renderer.render(this.scene, this.camera);
    this.pulseStrength *= Math.pow(0.91, delta * 60);
  }

  drawFluidSplat() {
    if (!this.hasPointer || this.pendingFluidPoints.length === 0) return;

    const points = this.pendingFluidPoints.splice(0, this.pendingFluidPoints.length);
    for (const point of points) {
      this.drawFluidPoint(point);
    }
  }

  drawFluidPoint(point) {
    this.fluidMouse.copy(point);
    if (!this.hasFluidMouse) {
      this.lastFluidMouse.copy(this.fluidMouse);
      this.hasFluidMouse = true;
      return;
    }

    const fluidVelocity = this.fluidMouse.clone().sub(this.lastFluidMouse);
    const speed = fluidVelocity.length();
    if (speed <= 0.01) return;

    const start = this.lastFluidMouse.clone();
    const steps = Math.min(6, Math.max(1, Math.ceil(speed / 8)));
    for (let step = 1; step <= steps; step += 1) {
      const pointOnSegment = start.clone().lerp(this.fluidMouse, step / steps);
      const segmentVelocity = pointOnSegment.clone().sub(this.lastFluidMouse);
      this.drawFluidSegment(pointOnSegment, segmentVelocity, speed, step === steps);
      this.lastFluidMouse.copy(pointOnSegment);
    }
  }

  drawFluidSegment(point, fluidVelocity, gestureSpeed, isTrailHead = false) {
    const speed = fluidVelocity.length();
    if (speed <= 0.01) return;

    if (speed > 0.2 && isTrailHead) {
      this.pulseDir.set(fluidVelocity.x, -fluidVelocity.y).normalize();
      const centerX = (point.x + this.lastFluidMouse.x) * 0.5;
      const centerY = (point.y + this.lastFluidMouse.y) * 0.5;
      this.pulsePoint.set(centerX - this.width / 2, this.height / 2 - centerY);
      this.pulseStrength = Math.max(
        this.pulseStrength * 0.72,
        THREE.MathUtils.clamp(gestureSpeed / 24, 0, 0.42),
      );
    }

    const size = THREE.MathUtils.mapLinear(
      THREE.MathUtils.clamp(gestureSpeed, 0, 5),
      0,
      5,
      0,
      60,
    ) * 0.6;
    const cursorScale = THREE.MathUtils.mapLinear(this.cursorArea, 0.01, 2.4, 0.12, 2.4);
    const style = getEffectDynamics(this.effectStyle);
    const cursorSize = size * cursorScale * style.fluidRadius;
    const force = THREE.MathUtils.mapLinear(
      THREE.MathUtils.clamp(gestureSpeed, 0, 15),
      0,
      15,
      0,
      10,
    ) * style.fluidForce;

    this.fluid.drawInput(
      point.x,
      point.y,
      fluidVelocity.x * force,
      fluidVelocity.y * force,
      new THREE.Color(style.density, style.density, style.density),
      cursorSize,
    );

    const energy = THREE.MathUtils.clamp(gestureSpeed / 11, 0, 1);
    if (energy > 0.05) {
      const energyPower = this.arcGlow ? this.pulseScale * this.glowScale : 0;
      const power = energy * energyPower;
      this.energyTrailColor.copy(this.glowColor).multiplyScalar(power * 0.62);
      this.energyHeadColor.copy(this.glowColor).lerp({ r: 1, g: 1, b: 1 }, 0.42).multiplyScalar(power * 10.5);
      this.fluid.drawEnergySegment(
        this.lastFluidMouse.x,
        this.lastFluidMouse.y,
        point.x,
        point.y,
        this.energyTrailColor,
        Math.max(2, cursorSize * 0.18),
      );
      if (isTrailHead) {
        this.fluid.drawEnergy(
          point.x,
          point.y,
          this.energyHeadColor,
          Math.max(4, cursorSize * 0.64),
          true,
        );
      }
    }
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
          uEnergy: { value: this.fluid.energyTexture },
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
      material.uniforms.uEnergy.value = this.fluid.energyTexture;
    }
  }
}

function getRevealDecay(hold, base) {
  const ratio = base.hold / Math.max(0.001, hold);
  return {
    densityDissipation: Math.pow(base.densityDissipation, ratio),
    velocityDissipation: Math.pow(base.velocityDissipation, ratio),
  };
}

function normalizeEffectStyle(value) {
  if (value === "smoke" || value === "energy" || value === "silk") return value;
  return "silk";
}

function getEffectStyleAmount(style) {
  if (style === "silk") return 2;
  if (style === "energy") return 1;
  return 0;
}

function getEffectDynamics(style) {
  if (style === "silk") {
    return {
      separation: 0.25,
      relax: 2.6,
      mouseStrength: 0.08,
      flowToScreen: 0.1,
      fluidRadius: 0.9,
      fluidForce: 0.08,
      density: 1,
    };
  }

  if (style === "energy") {
    return {
      separation: 0.74,
      relax: 1,
      mouseStrength: 0.86,
      flowToScreen: 1.35,
      fluidRadius: 0.86,
      fluidForce: 0.68,
      density: 0.74,
    };
  }

  return {
    separation: 1,
    relax: 1,
    mouseStrength: 1,
    flowToScreen: 1.15,
    fluidRadius: 1,
    fluidForce: 1,
    density: 1,
  };
}
