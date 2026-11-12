import * as THREE from "three";

/** キャンバス描画の解像度（ワールド座標 1 単位あたりのピクセル数）。 */
export const PX_PER_UNIT = 200;

export const LABEL_FONT = '"Rajdhani", "Segoe UI", sans-serif';
export const MONO_FONT = '"JetBrains Mono", Consolas, monospace';

export const COLORS = {
  accent: "#5fe3ff",
  accentSoft: "rgba(95, 227, 255, 0.45)",
  text: "#d8f6ff",
  textDim: "#7fb6cc",
  cardTop: "rgba(10, 30, 56, 0.9)",
  cardBottom: "rgba(4, 13, 30, 0.9)",
  cardSolid: "#07142a",
  night: "#b9a8ff",
  success: "#7dffc4",
} as const;

/** 再現性のある乱数（画像のイラストや星の配置を毎回同じにするため）。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createCanvas(width: number, height: number): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width);
  canvas.height = Math.ceil(height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D キャンバスを作成できません");
  return { canvas, ctx };
}

export function toTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

/** 四隅に置く「かぎ括弧」状の装飾。 */
function drawCornerBrackets(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  len: number,
  color: string,
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.lineCap = "square";
  const corners: [number, number, number, number][] = [
    [x, y, 1, 1],
    [x + w, y, -1, 1],
    [x, y + h, 1, -1],
    [x + w, y + h, -1, -1],
  ];
  for (const [cx, cy, sx, sy] of corners) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + sy * len);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx + sx * len, cy);
    ctx.stroke();
  }
  ctx.restore();
}

/** 4 本の光芒を持つきらめき（塗り）。 */
function sparklePath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  const w = r * 0.28;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.quadraticCurveTo(cx + w, cy - w, cx + r, cy);
  ctx.quadraticCurveTo(cx + w, cy + w, cx, cy + r);
  ctx.quadraticCurveTo(cx - w, cy + w, cx - r, cy);
  ctx.quadraticCurveTo(cx - w, cy - w, cx, cy - r);
  ctx.closePath();
}

export type IconKind =
  | "terminal"
  | "moon"
  | "tasks"
  | "calendar"
  | "weather"
  | "memo"
  | "guideline"
  | "reference"
  | "prompt"
  | "imageAI"
  | "image"
  | "chat"
  | "message"
  | "check";

/**
 * データ種別を表すピクトグラムを描く。実在サービスのロゴは使わず、
 * 100×100 の箱（中心が原点）に線画で描いたものを size に拡大する。
 */
export function drawIcon(
  ctx: CanvasRenderingContext2D,
  kind: IconKind,
  cx: number,
  cy: number,
  size: number,
  color: string,
  background: string = COLORS.cardSolid,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(size / 100, size / 100);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const line = (x1: number, y1: number, x2: number, y2: number) => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };
  const dot = (x: number, y: number, r: number) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };

  switch (kind) {
    case "terminal": {
      roundRectPath(ctx, -44, -36, 88, 72, 10);
      ctx.stroke();
      line(-44, -18, 44, -18);
      dot(-32, -27, 3.5);
      dot(-21, -27, 3.5);
      ctx.beginPath();
      ctx.moveTo(-26, -2);
      ctx.lineTo(-12, 9);
      ctx.lineTo(-26, 20);
      ctx.stroke();
      line(-2, 21, 20, 21);
      break;
    }
    case "moon": {
      ctx.save();
      ctx.beginPath();
      ctx.arc(-4, 4, 34, 0, Math.PI * 2);
      ctx.clip();
      ctx.beginPath();
      ctx.arc(-4, 4, 34, 0, Math.PI * 2);
      ctx.moveTo(10 + 30, -10);
      ctx.arc(10, -10, 30, 0, Math.PI * 2);
      ctx.fill("evenodd");
      ctx.restore();
      sparklePath(ctx, 30, -26, 11);
      ctx.fill();
      sparklePath(ctx, 38, 12, 6);
      ctx.fill();
      break;
    }
    case "tasks": {
      for (const [i, y] of [-28, 0, 28].entries()) {
        roundRectPath(ctx, -42, y - 9, 18, 18, 3);
        ctx.stroke();
        if (i < 2) {
          ctx.beginPath();
          ctx.moveTo(-38, y);
          ctx.lineTo(-33, y + 5);
          ctx.lineTo(-26, y - 6);
          ctx.stroke();
        }
        line(-12, y, 42, y);
      }
      break;
    }
    case "calendar": {
      roundRectPath(ctx, -40, -32, 80, 72, 8);
      ctx.stroke();
      line(-40, -14, 40, -14);
      line(-20, -42, -20, -24);
      line(20, -42, 20, -24);
      for (const [i, [x, y]] of (
        [
          [-22, 4],
          [0, 4],
          [22, 4],
          [-22, 24],
          [0, 24],
          [22, 24],
        ] as const
      ).entries()) {
        if (i === 4) {
          ctx.fillRect(x - 7, y - 7, 14, 14);
        } else {
          ctx.lineWidth = 4;
          ctx.strokeRect(x - 6, y - 6, 12, 12);
          ctx.lineWidth = 6;
        }
      }
      break;
    }
    case "weather": {
      ctx.beginPath();
      ctx.arc(14, -14, 14, 0, Math.PI * 2);
      ctx.stroke();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        line(14 + Math.cos(a) * 21, -14 + Math.sin(a) * 21, 14 + Math.cos(a) * 28, -14 + Math.sin(a) * 28);
      }
      ctx.beginPath();
      ctx.moveTo(-30, 34);
      ctx.arc(-24, 18, 16, Math.PI * 0.6, Math.PI * 1.45);
      ctx.arc(-2, 6, 20, Math.PI * 1.1, Math.PI * 1.95);
      ctx.arc(20, 20, 14, Math.PI * 1.45, Math.PI * 0.45);
      ctx.closePath();
      ctx.fillStyle = background;
      ctx.fill();
      ctx.stroke();
      break;
    }
    case "memo": {
      ctx.beginPath();
      ctx.moveTo(-32, -40);
      ctx.lineTo(14, -40);
      ctx.lineTo(34, -20);
      ctx.lineTo(34, 40);
      ctx.lineTo(-32, 40);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(14, -40);
      ctx.lineTo(14, -20);
      ctx.lineTo(34, -20);
      ctx.stroke();
      line(-20, -6, 22, -6);
      line(-20, 10, 22, 10);
      line(-20, 26, 6, 26);
      break;
    }
    case "guideline": {
      roundRectPath(ctx, -34, -42, 68, 84, 6);
      ctx.stroke();
      ctx.fillRect(-22, -32, 44, 9);
      for (const y of [-6, 12, 30]) {
        dot(-19, y, 4);
        line(-8, y, 22, y);
      }
      break;
    }
    case "reference": {
      roundRectPath(ctx, -44, -36, 88, 72, 6);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(-16, -8, 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(-16, 28, 20, Math.PI * 1.05, Math.PI * 1.95);
      ctx.stroke();
      line(10, -18, 32, -18);
      line(10, -2, 32, -2);
      line(10, 14, 26, 14);
      break;
    }
    case "prompt": {
      roundRectPath(ctx, -42, -30, 84, 62, 8);
      ctx.stroke();
      line(-28, -10, 14, -10);
      line(-28, 8, 0, 8);
      line(10, 0, 10, 18);
      sparklePath(ctx, 32, -32, 14);
      ctx.fillStyle = background;
      ctx.fill();
      ctx.fillStyle = color;
      sparklePath(ctx, 32, -32, 11);
      ctx.fill();
      break;
    }
    case "imageAI": {
      roundRectPath(ctx, -26, -26, 52, 52, 6);
      ctx.stroke();
      for (const k of [-14, 0, 14]) {
        line(k, -26, k, -38);
        line(k, 26, k, 38);
        line(-26, k, -38, k);
        line(26, k, 38, k);
      }
      sparklePath(ctx, 0, 0, 15);
      ctx.fill();
      break;
    }
    case "image": {
      roundRectPath(ctx, -42, -32, 84, 64, 6);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-36, 24);
      ctx.lineTo(-12, -2);
      ctx.lineTo(2, 12);
      ctx.lineTo(16, -8);
      ctx.lineTo(36, 24);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(-20, -16, 7, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "chat": {
      const x = -40;
      const y = -36;
      const w = 80;
      const h = 56;
      const r = 14;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.arcTo(x + w, y, x + w, y + r, r);
      ctx.lineTo(x + w, y + h - r);
      ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
      ctx.lineTo(-4, y + h);
      ctx.lineTo(-24, 38);
      ctx.lineTo(-18, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.arcTo(x, y + h, x, y + h - r, r);
      ctx.lineTo(x, y + r);
      ctx.arcTo(x, y, x + r, y, r);
      ctx.closePath();
      ctx.stroke();
      dot(-18, -8, 5);
      dot(0, -8, 5);
      dot(18, -8, 5);
      break;
    }
    case "message": {
      roundRectPath(ctx, -40, -28, 80, 56, 6);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-38, -24);
      ctx.lineTo(0, 6);
      ctx.lineTo(38, -24);
      ctx.stroke();
      break;
    }
    case "check": {
      ctx.lineWidth = 11;
      ctx.beginPath();
      ctx.moveTo(-30, 2);
      ctx.lineTo(-8, 24);
      ctx.lineTo(32, -22);
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

export interface CardOptions {
  label: string;
  icon: IconKind;
  /** ワールド座標での幅・高さ。 */
  width: number;
  height: number;
  mono?: boolean;
  accent?: string;
}

/** ノード（アイコン＋ラベルのホログラム風カード）のテクスチャ。 */
export function createCardTexture(options: CardOptions): THREE.CanvasTexture {
  const { label, icon, width, height, mono = false, accent = COLORS.accent } = options;
  const W = width * PX_PER_UNIT;
  const H = height * PX_PER_UNIT;
  const { canvas, ctx } = createCanvas(W, H);
  const pad = 16;
  const innerW = W - pad * 2;
  const innerH = H - pad * 2;
  const radius = innerH * 0.2;

  // 地の塗り
  const fill = ctx.createLinearGradient(0, pad, 0, H - pad);
  fill.addColorStop(0, COLORS.cardTop);
  fill.addColorStop(1, COLORS.cardBottom);
  roundRectPath(ctx, pad, pad, innerW, innerH, radius);
  ctx.fillStyle = fill;
  ctx.fill();

  // 発光する枠線
  ctx.save();
  ctx.shadowColor = accent;
  ctx.shadowBlur = 14;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3;
  roundRectPath(ctx, pad, pad, innerW, innerH, radius);
  ctx.stroke();
  ctx.restore();

  drawCornerBrackets(ctx, pad + 8, pad + 8, innerW - 16, innerH - 16, innerH * 0.16, "rgba(200, 248, 255, 0.55)");

  // アイコン
  const iconCx = pad + innerH * 0.55;
  const iconCy = H / 2;
  const iconR = innerH * 0.32;
  ctx.beginPath();
  ctx.arc(iconCx, iconCy, iconR, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(95, 227, 255, 0.08)";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = COLORS.accentSoft;
  ctx.stroke();
  drawIcon(ctx, icon, iconCx, iconCy, iconR * 1.15, accent);

  // ラベル
  const textX = iconCx + iconR + innerH * 0.22;
  const maxTextW = W - pad - innerH * 0.25 - textX;
  let fontSize = mono ? innerH * 0.3 : innerH * 0.4;
  const font = (size: number) => (mono ? `500 ${size}px ${MONO_FONT}` : `600 ${size}px ${LABEL_FONT}`);
  ctx.font = font(fontSize);
  while (ctx.measureText(label).width > maxTextW && fontSize > 8) {
    fontSize -= 1;
    ctx.font = font(fontSize);
  }
  ctx.fillStyle = COLORS.text;
  ctx.textBaseline = "middle";
  ctx.fillText(label, textX, H / 2 + fontSize * 0.04);

  return toTexture(canvas);
}

/** 小さなバッジ（night / sent など）やキーワードのチップ。 */
export function createPillTexture(options: {
  text: string;
  width: number;
  height: number;
  icon?: IconKind;
  color?: string;
}): THREE.CanvasTexture {
  const { text, width, height, icon, color = COLORS.accent } = options;
  const W = width * PX_PER_UNIT;
  const H = height * PX_PER_UNIT;
  const { canvas, ctx } = createCanvas(W, H);
  const pad = 10;
  const innerH = H - pad * 2;

  roundRectPath(ctx, pad, pad, W - pad * 2, innerH, innerH / 2);
  ctx.fillStyle = "rgba(6, 16, 34, 0.92)";
  ctx.fill();
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.restore();

  const fontSize = innerH * 0.56;
  ctx.font = `600 ${fontSize}px ${LABEL_FONT}`;
  const textW = ctx.measureText(text).width;
  const iconSize = icon ? innerH * 0.62 : 0;
  const gap = icon ? innerH * 0.22 : 0;
  const startX = (W - (textW + iconSize + gap)) / 2;
  if (icon) {
    drawIcon(ctx, icon, startX + iconSize / 2, H / 2, iconSize, color, "rgba(6, 16, 34, 1)");
  }
  ctx.fillStyle = COLORS.text;
  ctx.textBaseline = "middle";
  ctx.fillText(text, startX + iconSize + gap, H / 2 + fontSize * 0.04);
  return toTexture(canvas);
}

/** 中心が白く外へ溶ける光の玉。 */
export function createGlowTexture(): THREE.CanvasTexture {
  const size = 128;
  const { canvas, ctx } = createCanvas(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.18, "rgba(255,255,255,0.75)");
  g.addColorStop(0.45, "rgba(255,255,255,0.22)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return toTexture(canvas);
}

/** 破線の円弧と目盛りを持つ、回転させて使うリング。 */
export function createRingTexture(): THREE.CanvasTexture {
  const size = 512;
  const { canvas, ctx } = createCanvas(size, size);
  const c = size / 2;
  ctx.strokeStyle = "white";
  ctx.lineCap = "round";

  ctx.lineWidth = 6;
  const arcs = [
    [0.05, 0.62],
    [0.78, 1.18],
    [1.32, 1.86],
  ];
  for (const [a, b] of arcs) {
    ctx.beginPath();
    ctx.arc(c, c, size * 0.44, a! * Math.PI, b! * Math.PI);
    ctx.stroke();
  }
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  ctx.arc(c, c, size * 0.38, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 3;
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const r0 = size * (i % 4 === 0 ? 0.465 : 0.475);
    const r1 = size * 0.49;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0);
    ctx.lineTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1);
    ctx.stroke();
  }
  return toTexture(canvas);
}

/** 生成画像の外枠（中央は透明）。 */
export function createFrameTexture(width: number, height: number): THREE.CanvasTexture {
  const W = width * PX_PER_UNIT;
  const H = height * PX_PER_UNIT;
  const { canvas, ctx } = createCanvas(W, H);
  const pad = 14;
  ctx.save();
  ctx.shadowColor = COLORS.accent;
  ctx.shadowBlur = 16;
  ctx.strokeStyle = COLORS.accent;
  ctx.lineWidth = 3;
  roundRectPath(ctx, pad, pad, W - pad * 2, H - pad * 2, 12);
  ctx.stroke();
  ctx.restore();
  drawCornerBrackets(ctx, pad - 6, pad - 6, W - pad * 2 + 12, H - pad * 2 + 12, 34, "rgba(220, 250, 255, 0.9)");
  return toTexture(canvas);
}

/** 画像やラベルの下に添える、1〜2語の小さな文字。 */
export function createLabelTexture(text: string, width: number, height: number, color: string = COLORS.text): THREE.CanvasTexture {
  const W = width * PX_PER_UNIT;
  const H = height * PX_PER_UNIT;
  const { canvas, ctx } = createCanvas(W, H);
  const fontSize = H * 0.7;
  ctx.font = `600 ${fontSize}px ${LABEL_FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, W / 2, H / 2 + fontSize * 0.04);
  return toTexture(canvas);
}

/** 画像に添えて送るメッセージ（吹き出し）。 */
export function createMessageTexture(width: number, height: number): THREE.CanvasTexture {
  const W = width * PX_PER_UNIT;
  const H = height * PX_PER_UNIT;
  const { canvas, ctx } = createCanvas(W, H);
  const pad = 16;
  const tail = H * 0.16;
  const x = pad;
  const y = pad;
  const w = W - pad * 2;
  const h = H - pad * 2 - tail;
  const r = h * 0.22;

  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + w * 0.3, y + h);
  ctx.lineTo(x + w * 0.16, y + h + tail);
  ctx.lineTo(x + w * 0.18, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
  const fill = ctx.createLinearGradient(0, y, 0, y + h);
  fill.addColorStop(0, COLORS.cardTop);
  fill.addColorStop(1, COLORS.cardBottom);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.save();
  ctx.shadowColor = COLORS.accent;
  ctx.shadowBlur = 14;
  ctx.strokeStyle = COLORS.accent;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();

  const iconSize = h * 0.34;
  const headerY = y + h * 0.3;
  drawIcon(ctx, "message", x + h * 0.32, headerY, iconSize, COLORS.accent);
  const fontSize = h * 0.26;
  ctx.font = `600 ${fontSize}px ${LABEL_FONT}`;
  ctx.fillStyle = COLORS.text;
  ctx.textBaseline = "middle";
  ctx.fillText("Message", x + h * 0.32 + iconSize * 0.75, headerY + fontSize * 0.04);

  // 本文は読ませないため、文字の代わりに帯で表す
  ctx.fillStyle = "rgba(190, 236, 255, 0.55)";
  const barH = h * 0.09;
  roundRectPath(ctx, x + h * 0.2, y + h * 0.56, w * 0.78, barH, barH / 2);
  ctx.fill();
  roundRectPath(ctx, x + h * 0.2, y + h * 0.74, w * 0.52, barH, barH / 2);
  ctx.fill();
  return toTexture(canvas);
}

/**
 * 「生成された画像」として描く夜の山のイラスト。
 * 月・星・山並みと、月の近くを飛ぶ青い小鳥を描く。
 */
export function createIllustrationTexture(): THREE.CanvasTexture {
  const W = 1024;
  const H = 640;
  const { canvas, ctx } = createCanvas(W, H);
  const rand = mulberry32(20261112);

  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#06102c");
  sky.addColorStop(0.5, "#15407a");
  sky.addColorStop(0.75, "#2f7fb6");
  sky.addColorStop(1, "#5fb8e0");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // 月の周りの淡い光
  const halo = ctx.createRadialGradient(760, 150, 40, 760, 150, 360);
  halo.addColorStop(0, "rgba(170, 225, 255, 0.35)");
  halo.addColorStop(1, "rgba(170, 225, 255, 0)");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, W, H);

  // 天の川のような淡い帯
  ctx.save();
  ctx.translate(W * 0.5, H * 0.3);
  ctx.rotate(-0.35);
  const band = ctx.createLinearGradient(0, -90, 0, 90);
  band.addColorStop(0, "rgba(120, 200, 255, 0)");
  band.addColorStop(0.5, "rgba(140, 190, 255, 0.16)");
  band.addColorStop(1, "rgba(120, 200, 255, 0)");
  ctx.fillStyle = band;
  ctx.fillRect(-W, -90, W * 2, 180);
  ctx.restore();

  for (let i = 0; i < 260; i++) {
    const x = rand() * W;
    const y = rand() * H * 0.7;
    const r = rand() < 0.08 ? 1.8 : rand() * 1.1 + 0.3;
    ctx.fillStyle = `rgba(230, 245, 255, ${0.35 + rand() * 0.6})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // 月
  ctx.save();
  ctx.shadowColor = "rgba(160, 230, 255, 0.9)";
  ctx.shadowBlur = 70;
  ctx.fillStyle = "#eaf7ff";
  ctx.beginPath();
  ctx.arc(760, 150, 54, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = "rgba(170, 205, 230, 0.35)";
  for (const [x, y, r] of [
    [742, 135, 11],
    [778, 168, 8],
    [770, 128, 5],
  ] as const) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // 山並み（奥から手前へ）
  const ridge = (baseY: number, amp: number, freq: number, seed: number, fill: string, rim: string | null) => {
    const r = mulberry32(seed);
    const o1 = r() * 10;
    const o2 = r() * 10;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) {
      const t = x / W;
      const y =
        baseY -
        amp * (0.55 * Math.sin(t * freq + o1) + 0.3 * Math.sin(t * freq * 2.3 + o2) + 0.15 * Math.sin(t * freq * 5.1));
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (rim) {
      ctx.save();
      ctx.shadowColor = rim;
      ctx.shadowBlur = 12;
      ctx.strokeStyle = rim;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
  };
  ridge(430, 70, 7, 3, "#1b4d7c", "rgba(150, 230, 255, 0.85)");
  ridge(485, 60, 9, 7, "#0f2d52", "rgba(110, 200, 245, 0.6)");
  ridge(560, 45, 12, 11, "#061428", "rgba(80, 170, 230, 0.35)");

  // 月の近くを飛ぶ青い小鳥と、星をまとった尾羽
  ctx.save();
  ctx.translate(640, 230);
  ctx.rotate(-0.18);
  ctx.shadowColor = "rgba(120, 230, 255, 1)";
  ctx.shadowBlur = 18;
  ctx.fillStyle = "#7fdcff";
  ctx.beginPath();
  ctx.ellipse(0, 0, 16, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-4, -2);
  ctx.quadraticCurveTo(-10, -30, 14, -34);
  ctx.quadraticCurveTo(4, -14, 8, -2);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-14, 2);
  ctx.lineTo(-40, 12);
  ctx.lineTo(-36, 0);
  ctx.closePath();
  ctx.fillStyle = "#bdf3ff";
  ctx.fill();
  ctx.restore();
  for (let i = 0; i < 14; i++) {
    const t = i / 14;
    ctx.fillStyle = `rgba(200, 245, 255, ${0.8 * (1 - t)})`;
    ctx.beginPath();
    ctx.arc(600 - t * 140, 245 + t * 46 + Math.sin(t * 9) * 6, 2.6 * (1 - t) + 0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // 周辺減光
  const vignette = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.65);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,10,0.55)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);

  return toTexture(canvas);
}
