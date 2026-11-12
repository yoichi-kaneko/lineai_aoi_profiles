import * as THREE from "three";
import { clamp01 } from "../timeline";
import { COLORS, createFrameTexture, createIllustrationTexture, createPillTexture } from "../textures";
import { Card, LAYER } from "./card";

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/**
 * ノイズから絵が立ち上がる表現。progress が進むにつれて、
 * ノイズが段階的に減り、粗いモザイクが細かくなって元の絵に落ち着く。
 */
const fragmentShader = /* glsl */ `
uniform sampler2D uMap;
uniform float uProgress;
uniform float uOpacity;
uniform float uTime;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  float p = clamp(uProgress, 0.0, 1.0);
  float stepIndex = floor(p * 30.0);
  float blocks = mix(5.0, 220.0, p * p);
  vec2 grid = vec2(blocks * 1.6, blocks);
  vec2 q = (floor(vUv * grid) + 0.5) / grid;
  vec3 picture = texture2D(uMap, mix(q, vUv, smoothstep(0.82, 1.0, p))).rgb;

  float n = hash(floor(vUv * vec2(96.0, 60.0)) + stepIndex * 13.17);
  vec3 noiseColor = mix(vec3(0.01, 0.03, 0.09), vec3(0.25, 0.7, 1.0), n * n);
  float reveal = smoothstep(0.0, 1.0, p * 1.35 - n * 0.35);
  vec3 color = mix(noiseColor, picture, reveal);

  float scan = exp(-pow((vUv.y - fract(uTime * 0.5)) * 40.0, 2.0));
  color += vec3(0.35, 0.8, 1.0) * scan * 0.25 * (1.0 - p);
  gl_FragColor = vec4(color, uOpacity);
}
`;

export interface GeneratedImageState {
  x: number;
  y: number;
  scale: number;
  opacity: number;
  progress: number;
  time: number;
  /** 進捗バーの不透明度。 */
  bar: number;
  /** 「generating」と「Image」のラベルの切り替え（0 で generating、1 で Image）。 */
  labelMix: number;
  flash: number;
}

/** 画像生成 AI が作り出す一枚。生成中の進捗バーとラベルを伴う。 */
export class GeneratedImage {
  static readonly WIDTH = 3.2;
  static readonly HEIGHT = 2.0;

  readonly group = new THREE.Group();
  private readonly material: THREE.ShaderMaterial;
  private readonly frame: Card;
  private readonly flash: Card;
  private readonly barBack: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly barFill: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly generatingLabel: Card;
  private readonly imageLabel: Card;

  constructor() {
    const { WIDTH: w, HEIGHT: h } = GeneratedImage;
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uMap: { value: createIllustrationTexture() },
        uProgress: { value: 0 },
        uOpacity: { value: 1 },
        uTime: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      depthTest: false,
    });
    const image = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.material);
    image.renderOrder = LAYER.card;

    const frameW = w + 0.16;
    const frameH = h + 0.16;
    const frameTexture = createFrameTexture(frameW, frameH);
    this.frame = new Card(frameTexture, frameW, frameH, LAYER.cardTop);
    this.flash = new Card(frameTexture, frameW, frameH, LAYER.cardTop + 1, THREE.AdditiveBlending);
    this.flash.mesh.material.color = new THREE.Color("#ffffff");

    const barY = -h / 2 - 0.2;
    this.barBack = new THREE.Mesh(
      new THREE.PlaneGeometry(w, 0.05),
      new THREE.MeshBasicMaterial({ color: "#16405e", transparent: true, depthWrite: false, depthTest: false }),
    );
    this.barBack.position.set(0, barY, 0);
    this.barBack.renderOrder = LAYER.card;
    const fillGeometry = new THREE.PlaneGeometry(1, 0.05);
    fillGeometry.translate(0.5, 0, 0);
    this.barFill = new THREE.Mesh(
      fillGeometry,
      new THREE.MeshBasicMaterial({
        color: COLORS.accent,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.barFill.position.set(-w / 2, barY, 0);
    this.barFill.renderOrder = LAYER.cardTop;

    const labelW = 1.7;
    const labelH = 0.42;
    const labelX = -w / 2 + labelW / 2 - 0.08;
    const labelY = h / 2 + 0.34;
    this.generatingLabel = new Card(createPillTexture({ text: "generating", icon: "imageAI", width: labelW, height: labelH }), labelW, labelH, LAYER.cardTop);
    this.imageLabel = new Card(
      createPillTexture({ text: "Image", icon: "image", width: labelW * 0.78, height: labelH, color: COLORS.success }),
      labelW * 0.78,
      labelH,
      LAYER.cardTop,
    );
    this.generatingLabel.mesh.position.set(labelX, labelY, 0);
    this.imageLabel.mesh.position.set(-w / 2 + (labelW * 0.78) / 2 - 0.08, labelY, 0);

    this.group.add(
      image,
      this.frame.mesh,
      this.flash.mesh,
      this.barBack,
      this.barFill,
      this.generatingLabel.mesh,
      this.imageLabel.mesh,
    );
  }

  update(state: GeneratedImageState): void {
    this.group.position.set(state.x, state.y, 0);
    this.group.scale.setScalar(Math.max(state.scale, 1e-4));
    this.group.visible = state.opacity > 0.001;
    if (!this.group.visible) return;

    const u = this.material.uniforms;
    u.uProgress!.value = state.progress;
    u.uOpacity!.value = state.opacity;
    u.uTime!.value = state.time;

    this.frame.mesh.material.opacity = state.opacity;
    this.flash.mesh.material.opacity = state.flash * state.opacity;
    this.flash.mesh.visible = state.flash > 0.001;

    const bar = state.bar * state.opacity;
    this.barBack.material.opacity = bar * 0.8;
    this.barFill.material.opacity = bar;
    this.barFill.scale.x = Math.max(GeneratedImage.WIDTH * state.progress, 1e-4);
    this.barBack.visible = bar > 0.001;
    this.barFill.visible = bar > 0.001;

    // 2つのラベルが重ならないよう、generating が消えてから Image を出す
    const generating = state.opacity * (1 - clamp01(state.labelMix / 0.4));
    const image = state.opacity * clamp01((state.labelMix - 0.6) / 0.4);
    this.generatingLabel.mesh.material.opacity = generating;
    this.imageLabel.mesh.material.opacity = image;
    this.generatingLabel.mesh.visible = generating > 0.001;
    this.imageLabel.mesh.visible = image > 0.001;
  }
}
