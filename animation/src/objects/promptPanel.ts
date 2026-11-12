import * as THREE from "three";
import {
  COLORS,
  createCanvas,
  createFrameTexture,
  drawIcon,
  LABEL_FONT,
  MONO_FONT,
  PX_PER_UNIT,
  roundRectPath,
  toTexture,
} from "../textures";
import { Card, LAYER } from "./card";

type Operation = { type: string } | { pause: number } | { erase: number };

/** パネルに打ち込むプロンプト。途中で一度、光の表現を書き直す。 */
const SCRIPT: readonly Operation[] = [
  { type: "scene: private room, night skyline\n" },
  { type: "subject: Aoi by the window\n" },
  { type: "companion: Ruri, small blue bird\n" },
  { type: "light: warm lamp" },
  { pause: 0.45 },
  { erase: "warm lamp".length },
  { type: "holographic, cool blue\n" },
  { type: "style: cel shading, calm mood" },
];

/** 消すときは打つときの何倍速か。 */
const ERASE_SPEEDUP = 3;

/**
 * 打ち込み開始から elapsed 秒後に表示されている文字列。
 * duration 秒でちょうど打ち終わるよう、打鍵の速さを逆算する。
 */
export function promptTextAt(elapsed: number, duration: number): { text: string; done: boolean } {
  let typed = 0;
  let erased = 0;
  let pauses = 0;
  for (const op of SCRIPT) {
    if ("type" in op) typed += op.type.length;
    else if ("pause" in op) pauses += op.pause;
    else erased += op.erase;
  }
  const cps = (typed + erased / ERASE_SPEEDUP) / Math.max(duration - pauses, 0.1);

  let remaining = Math.max(elapsed, 0);
  let text = "";
  for (const op of SCRIPT) {
    if ("type" in op) {
      const need = op.type.length / cps;
      if (remaining < need) return { text: text + op.type.slice(0, Math.floor(remaining * cps)), done: false };
      text += op.type;
      remaining -= need;
    } else if ("pause" in op) {
      if (remaining < op.pause) return { text, done: false };
      remaining -= op.pause;
    } else {
      const need = op.erase / (cps * ERASE_SPEEDUP);
      if (remaining < need) {
        const n = Math.floor(remaining * cps * ERASE_SPEEDUP);
        return { text: text.slice(0, text.length - n), done: false };
      }
      text = text.slice(0, text.length - op.erase);
      remaining -= need;
    }
  }
  return { text, done: true };
}

export interface PromptPanelState {
  x: number;
  y: number;
  scale: number;
  opacity: number;
  text: string;
  cursor: boolean;
  ready: boolean;
  /** 完成時に枠を光らせる強さ。 */
  flash: number;
}

/** ガイドラインをもとにプロンプトを書き上げていくパネル。 */
export class PromptPanel {
  static readonly WIDTH = 4.8;
  static readonly HEIGHT = 2.4;

  readonly group = new THREE.Group();
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private readonly body: Card;
  private readonly flash: Card;
  private lastKey = "";

  constructor() {
    const { canvas, ctx } = createCanvas(PromptPanel.WIDTH * PX_PER_UNIT, PromptPanel.HEIGHT * PX_PER_UNIT);
    this.canvas = canvas;
    this.ctx = ctx;
    this.texture = toTexture(canvas);
    this.body = new Card(this.texture, PromptPanel.WIDTH, PromptPanel.HEIGHT, LAYER.card);
    this.flash = new Card(
      createFrameTexture(PromptPanel.WIDTH, PromptPanel.HEIGHT),
      PromptPanel.WIDTH,
      PromptPanel.HEIGHT,
      LAYER.cardTop,
      THREE.AdditiveBlending,
    );
    this.flash.mesh.material.color = new THREE.Color(COLORS.success);
    this.group.add(this.body.mesh, this.flash.mesh);
    this.draw("", false, false);
  }

  update(state: PromptPanelState): void {
    this.group.position.set(state.x, state.y, 0);
    this.group.scale.setScalar(Math.max(state.scale, 1e-4));
    this.group.visible = state.opacity > 0.001;
    this.body.mesh.material.opacity = state.opacity;
    this.flash.set(0, 0, 1, state.flash * state.opacity);
    if (this.group.visible) this.draw(state.text, state.cursor, state.ready);
  }

  private draw(text: string, cursor: boolean, ready: boolean): void {
    const key = `${text}|${cursor}|${ready}`;
    if (key === this.lastKey) return;
    this.lastKey = key;

    const { ctx, canvas } = this;
    const W = canvas.width;
    const H = canvas.height;
    const pad = 16;
    const accent = ready ? COLORS.success : COLORS.accent;
    ctx.clearRect(0, 0, W, H);

    const fill = ctx.createLinearGradient(0, pad, 0, H - pad);
    fill.addColorStop(0, "rgba(10, 30, 56, 0.93)");
    fill.addColorStop(1, "rgba(4, 12, 28, 0.93)");
    roundRectPath(ctx, pad, pad, W - pad * 2, H - pad * 2, 22);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.save();
    ctx.shadowColor = accent;
    ctx.shadowBlur = 16;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();

    // 見出し
    const headerY = pad + 50;
    drawIcon(ctx, "prompt", pad + 52, headerY, 52, accent);
    ctx.font = `600 44px ${LABEL_FONT}`;
    ctx.fillStyle = COLORS.text;
    ctx.textBaseline = "middle";
    ctx.fillText("Prompt", pad + 96, headerY + 2);

    ctx.font = `600 30px ${LABEL_FONT}`;
    ctx.textAlign = "right";
    ctx.fillStyle = ready ? COLORS.success : COLORS.textDim;
    ctx.fillText(ready ? "ready" : "drafting", W - pad - 40, headerY + 2);
    ctx.textAlign = "left";

    ctx.strokeStyle = "rgba(95, 227, 255, 0.3)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pad + 28, pad + 96);
    ctx.lineTo(W - pad - 28, pad + 96);
    ctx.stroke();

    // 本文
    const lines = text.split("\n");
    const lineHeight = 56;
    const startY = pad + 140;
    const textX = pad + 78;
    ctx.font = `500 34px ${MONO_FONT}`;
    lines.forEach((line, i) => {
      const y = startY + i * lineHeight;
      ctx.fillStyle = "rgba(95, 227, 255, 0.55)";
      ctx.fillText(">", pad + 40, y);
      const colon = line.indexOf(":");
      if (colon >= 0) {
        const key = line.slice(0, colon + 1);
        ctx.fillStyle = COLORS.accent;
        ctx.fillText(key, textX, y);
        ctx.fillStyle = COLORS.text;
        ctx.fillText(line.slice(colon + 1), textX + ctx.measureText(key).width, y);
      } else {
        ctx.fillStyle = COLORS.accent;
        ctx.fillText(line, textX, y);
      }
    });

    if (cursor) {
      const last = lines[lines.length - 1] ?? "";
      const x = textX + ctx.measureText(last).width + 4;
      const y = startY + (lines.length - 1) * lineHeight;
      ctx.fillStyle = accent;
      ctx.fillRect(x, y - 19, 18, 38);
    }

    this.texture.needsUpdate = true;
  }
}
