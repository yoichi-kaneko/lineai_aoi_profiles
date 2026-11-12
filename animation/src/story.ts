import * as THREE from "three";
import { CurveBeam, StraightBeam } from "./objects/beam";
import { bezier, Card, createGlow, createRing, LAYER } from "./objects/card";
import { GeneratedImage } from "./objects/generatedImage";
import { Mountains } from "./objects/mountains";
import { Stream } from "./objects/particles";
import { promptTextAt, PromptPanel } from "./objects/promptPanel";
import { Ripples } from "./objects/ripples";
import { COLORS, createCardTexture, createMessageTexture, createPillTexture, type IconKind } from "./textures";
import { ease, fadeWindow, keyframes, lerp, seg, type Keyframe } from "./timeline";

/*
 * 碧衣の画像生成プロセスを、光の線が進む一本の旅として描く。
 * すべての状態はループ内の時刻 t だけから決まる（前のフレームの状態を持たない）ため、
 * 任意の時刻へ飛んでも同じ絵になる。
 */

const P = (x: number, y: number) => new THREE.Vector2(x, y);

/** 光の線が走る高さ。 */
const LINE_Y = -0.3;
/** 光の線の始点（ワールド座標。常に画面の外）。 */
const LINE_START = -40;
const LINE_COLOR = "#5fe3ff";

// 画面上の配置（16 × 9 の枠の座標）
const RUN_NODE_WIDTH = 3.0;
const READ_LEFT = P(-2.35, 1.8);
const READ_RIGHT = P(2.35, 1.8);
const PARK_LEFT = P(-5.55, 1.6);
const PARK_RIGHT = P(5.55, 2.0);
const PANEL_POS = P(0, 1.45);
const AI_POS = P(5.15, -1.45);
const AI_SIZE = { w: 2.5, h: 0.9 };
const AI_ENTRY = P(AI_POS.x - AI_SIZE.w / 2, AI_POS.y);
/** 画像生成 AI ノードのアイコン（左寄り）の中心。 */
const AI_ICON = P(AI_POS.x - 0.76, AI_POS.y);
const GEN_POS = P(4.55, 1.25);
const IMAGE_CENTER = P(0, 1.75);
const MESSAGE_POS = P(2.95, 0.4);
const CHAT_POS = P(5.45, 3.15);
const CHAT_SIZE = { w: 2.1, h: 0.78 };
const CHAT_ENTRY = P(CHAT_POS.x - CHAT_SIZE.w / 2, CHAT_POS.y);

/** 光の線の先端（ワールド座標の x）。 */
const HEAD_KEYS: readonly Keyframe[] = [
  [0.5, -15],
  [3.2, -RUN_NODE_WIDTH / 2, ease.outCubic],
  [5.4, -RUN_NODE_WIDTH / 2],
  [7.7, 10, ease.inOutSine],
  [11.6, 10],
  [12.7, 15],
  [21.3, 15],
  [22.2, 19],
  [33.3, 19],
  [34.2, 23],
];

/** 画面（と山並み）が光の線を追いかける量。先端より少し遅れて動く。 */
const SCROLL_KEYS: readonly Keyframe[] = [
  [5.9, 0],
  [8.4, 10, ease.inOutCubic],
  [11.8, 10],
  [13.0, 15],
  [21.4, 15],
  [22.5, 19],
  [33.4, 19],
  [34.5, 23],
];

/** 最後に光の線を左から消していく位置（ワールド座標の x）。 */
const ERASE_KEYS: readonly Keyframe[] = [
  [37.2, 14],
  [38.3, 25, ease.inOutSine],
];

/** ガイドラインからプロンプトのパネルへ伸びる導線（キーワードもこの上を運ばれる）。 */
const GUIDE_CURVE = [P(PARK_LEFT.x + 1.3, PARK_LEFT.y), P(-3.4, 2.3), P(-2.4, 1.6)] as const;

interface GatherSpec {
  label: string;
  icon: IconKind;
  from: THREE.Vector2;
  control: THREE.Vector2;
  hover: THREE.Vector2;
  enter: readonly [number, number];
  absorb: readonly [number, number];
}

/** 情報収集で集まってくるデータ。左上・左下から入り、光の線の先端へ取り込まれる。 */
const GATHER_SPECS: readonly GatherSpec[] = [
  { label: "Tasks", icon: "tasks", from: P(-11, 5.6), control: P(-6.5, 4.6), hover: P(-2.9, 1.2), enter: [8.6, 10.0], absorb: [10.45, 11.0] },
  { label: "Calendar", icon: "calendar", from: P(-11, -5.6), control: P(-6.5, -4.6), hover: P(-2.9, -1.75), enter: [8.85, 10.25], absorb: [10.65, 11.2] },
  { label: "Weather", icon: "weather", from: P(-11, 3.4), control: P(-7.5, 2.4), hover: P(-5.1, 0.55), enter: [9.1, 10.5], absorb: [10.85, 11.4] },
  { label: "Memo", icon: "memo", from: P(-11, -3.6), control: P(-7.5, -2.6), hover: P(-5.1, -1.15), enter: [9.35, 10.75], absorb: [11.05, 11.6] },
];

const CHIP_TEXTS = ["composition", "lighting", "palette", "mood"] as const;
const CHIP_START = 16.95;
const CHIP_INTERVAL = 0.95;
const CHIP_TRAVEL = 1.05;

/** 光の線に残す、通過した工程の目印（ワールド座標の x と、現れる時刻）。 */
const MARKERS: readonly { x: number; time: number }[] = [
  { x: 10, time: 11.7 },
  { x: 15, time: 21.0 },
  { x: 19, time: 33.0 },
];

const RIPPLE_EVENTS = [
  { time: 3.2, x: -RUN_NODE_WIDTH / 2, y: LINE_Y, size: 1.4 },
  ...GATHER_SPECS.map((g) => ({ time: g.absorb[1], x: 0, y: LINE_Y, size: 1.0 })),
  { time: 24.4, x: AI_ICON.x, y: AI_ICON.y, size: 1.6 },
  { time: 24.8, x: AI_ICON.x, y: AI_ICON.y, size: 2.2 },
  { time: 33.0, x: 0, y: LINE_Y, size: 1.4 },
  { time: 36.75, x: CHAT_POS.x, y: CHAT_POS.y, size: 2.2, color: COLORS.success },
];

function card(label: string, icon: IconKind, width: number, height: number, options: { mono?: boolean } = {}): Card {
  return new Card(createCardTexture({ label, icon, width, height, ...options }), width, height);
}

function pill(text: string, width: number, height: number, icon?: IconKind, color?: string): Card {
  return new Card(createPillTexture({ text, width, height, icon, color }), width, height, LAYER.chip);
}

/** 画像生成 AI へ向かう枝線の、パルスの流れの位相。画像を返すときは逆向きに流す。 */
function aiBeamPhase(t: number): number {
  if (t < 31.6) return t;
  if (t < 33.4) return 31.6 - (t - 31.6) * 1.4;
  return 31.6 - 1.8 * 1.4 - (t - 33.4) * 0.5;
}

export class Story {
  /** スクロールに合わせて動く層（光の線と、その上に置かれたもの）。 */
  private readonly track = new THREE.Group();
  private readonly line = new StraightBeam(LINE_COLOR);
  private readonly headGlow = createGlow(LINE_COLOR, 1);
  private readonly orbGlow = createGlow("#7fe8ff", 1);
  private readonly orbRingOuter = createRing(LINE_COLOR, 1);
  private readonly orbRingInner = createRing("#b9a8ff", 1);
  private readonly markers = MARKERS.map(() => createGlow("#a8f3ff", 0.45));
  private readonly mountains = new Mountains();

  private readonly runNode = card("/run_aoi_daily", "terminal", RUN_NODE_WIDTH, 0.9, { mono: true });
  private readonly runGlow = createGlow(LINE_COLOR, 1);
  private readonly nightBadge = pill("night", 1.25, 0.44, "moon", COLORS.night);

  private readonly gathers = GATHER_SPECS.map((spec) => ({
    spec,
    card: card(spec.label, spec.icon, 2.1, 0.74),
    link: new CurveBeam(LINE_COLOR, 0.45),
  }));

  private readonly guideline = card("Guideline", "guideline", 2.6, 0.85);
  private readonly reference = card("Reference", "reference", 2.6, 0.85);
  private readonly scanBars = [createGlow("#dffaff", 1), createGlow("#dffaff", 1)];
  private readonly guideStream = new Stream(LINE_COLOR, { seed: 3 });
  private readonly referenceStream = new Stream("#b9a8ff", { seed: 5 });

  private readonly panel = new PromptPanel();
  private readonly guideBeam = new CurveBeam(LINE_COLOR, 0.45);
  private readonly thinkStream = new Stream("#a8f3ff", { seed: 7, count: 28, speed: 0.9 });
  private readonly chips = CHIP_TEXTS.map((text) => pill(text, 0.32 + text.length * 0.16, 0.38));

  private readonly aiNode = card("Image AI", "imageAI", AI_SIZE.w, AI_SIZE.h);
  private readonly aiGlow = createGlow("#7f9dff", 1);
  private readonly aiRingOuter = createRing(LINE_COLOR, 1.6, LAYER.cardTop);
  private readonly aiRingInner = createRing("#b9a8ff", 1.15, LAYER.cardTop);
  private readonly aiBeam = new CurveBeam(LINE_COLOR);
  private readonly genStream = new Stream("#9fdcff", { seed: 11, count: 48, speed: 0.8 });
  private readonly image = new GeneratedImage();

  private readonly message = new Card(createMessageTexture(2.3, 1.0), 2.3, 1.0);
  private readonly chatNode = card("Chat", "chat", CHAT_SIZE.w, CHAT_SIZE.h);
  private readonly chatGlow = createGlow(COLORS.success, 1);
  private readonly chatBeam = new CurveBeam(LINE_COLOR);
  private readonly sentBadge = pill("sent", 1.1, 0.42, "check", COLORS.success);

  private readonly ripples = new Ripples(RIPPLE_EVENTS);

  constructor(scene: THREE.Scene) {
    this.line.mesh.renderOrder = LAYER.beam;
    for (const beam of [this.aiBeam, this.chatBeam, this.guideBeam, ...this.gathers.map((g) => g.link)]) {
      beam.mesh.renderOrder = LAYER.beam;
    }
    this.runGlow.mesh.renderOrder = LAYER.glow;
    this.scanBars.forEach((bar) => (bar.mesh.renderOrder = LAYER.cardTop));

    this.track.add(this.line.mesh, this.runGlow.mesh, this.runNode.mesh, this.nightBadge.mesh, ...this.markers.map((m) => m.mesh));

    scene.add(
      this.mountains.group,
      this.track,
      this.headGlow.mesh,
      this.orbGlow.mesh,
      this.orbRingOuter.mesh,
      this.orbRingInner.mesh,
      ...this.gathers.flatMap((g) => [g.card.mesh, g.link.mesh]),
      this.guideline.mesh,
      this.reference.mesh,
      ...this.scanBars.map((b) => b.mesh),
      this.guideStream.points,
      this.referenceStream.points,
      this.panel.group,
      this.guideBeam.mesh,
      this.thinkStream.points,
      ...this.chips.map((c) => c.mesh),
      this.aiGlow.mesh,
      this.aiNode.mesh,
      this.aiRingOuter.mesh,
      this.aiRingInner.mesh,
      this.aiBeam.mesh,
      this.genStream.points,
      this.image.group,
      this.message.mesh,
      this.chatGlow.mesh,
      this.chatNode.mesh,
      this.chatBeam.mesh,
      this.sentBadge.mesh,
      this.ripples.group,
    );
  }

  /** @param t ループ内の時刻（0〜LOOP_DURATION 秒）。 */
  update(t: number): void {
    // 全体のフェードイン・フェードアウト（背景の星空は残す）
    const master = Math.min(seg(t, 0, 1.4), 1 - seg(t, 37.9, 39.3));

    const headX = keyframes(t, HEAD_KEYS);
    const scroll = keyframes(t, SCROLL_KEYS);
    const eraseX = t < 37.2 ? -1e4 : keyframes(t, ERASE_KEYS);
    const head = P(headX - scroll, LINE_Y);
    /** 光の線の先端そのものが消えていく割合。 */
    const headFade = 1 - seg(t, 37.85, 38.15);

    this.track.position.x = -scroll;
    this.mountains.update(scroll, master);
    this.ripples.update(t);

    // 1. 光の線
    this.line.update(LINE_START, headX, LINE_Y, { opacity: seg(t, 0.4, 0.8), phase: t, erase: eraseX });
    const headPulse = 1 + Math.sin(t * 6) * 0.08;
    this.headGlow.set(head.x, head.y, 0.9 * headPulse, seg(t, 0.4, 0.8) * headFade);

    this.updateRunNode(t, scroll);
    this.updateMarkers(t, eraseX, headFade);
    const orbLevel = this.updateGather(t, head, headFade);
    this.updateReading(t, head);
    this.updatePrompt(t, head);
    this.updateAi(t, head, master);
    this.updateImage(t);
    this.updateSend(t, head, master);

    // 先端に溜まっていく情報の光
    const orbFade = seg(t, 8.4, 9.2) * headFade;
    const orbPulse = 1 + Math.sin(t * 3.2) * 0.06;
    this.orbGlow.set(head.x, head.y, (0.7 + orbLevel * 1.5) * orbPulse, Math.min(1, 0.3 + orbLevel) * orbFade);
    const ringFade = seg(t, 10.0, 11.4) * orbFade;
    this.orbRingOuter.set(head.x, head.y, 1.0 + orbLevel * 0.7, 0.75 * ringFade);
    this.orbRingOuter.mesh.rotation.z = t * 0.5;
    this.orbRingInner.set(head.x, head.y, 0.7 + orbLevel * 0.45, 0.6 * ringFade);
    this.orbRingInner.mesh.rotation.z = -t * 0.8;
  }

  /** 2〜4. /run_aoi_daily の起動、night の表示、左へ流れて消える。 */
  private updateRunNode(t: number, scroll: number): void {
    const appear = seg(t, 2.0, 2.8);
    const opacity = ease.outCubic(appear) * (1 - seg(scroll, 6.5, 9.8));
    this.runNode.set(0, LINE_Y, 0.6 + 0.4 * ease.outBack(appear), opacity);

    // 光の線がつながった瞬間に強く光り、その後も起動中の淡い光を残す
    const flash = seg(t, 3.2, 3.35) * (1 - seg(t, 3.35, 4.3));
    const glow = (0.28 * seg(t, 3.2, 3.6) + 0.9 * flash) * opacity;
    this.runGlow.mesh.position.set(0, LINE_Y, 0);
    this.runGlow.mesh.scale.set(4.6, 2.0, 1);
    this.runGlow.mesh.material.opacity = glow;
    this.runGlow.mesh.visible = glow > 0.001;

    const pop = seg(t, 4.0, 4.45);
    this.nightBadge.set(RUN_NODE_WIDTH / 2 - 0.3, LINE_Y - 0.62, ease.outBack(pop), seg(t, 4.0, 4.2) * opacity);
  }

  private updateMarkers(t: number, eraseX: number, headFade: number): void {
    MARKERS.forEach((marker, i) => {
      const visible = seg(t, marker.time, marker.time + 0.5) * (eraseX > marker.x ? 0 : 1) * headFade;
      this.markers[i]!.set(marker.x, LINE_Y, 1, visible * 0.9);
    });
  }

  /** 5. タスクやカレンダーなどが集まり、光の線の先端へ取り込まれる。戻り値は先端の光の溜まり具合。 */
  private updateGather(t: number, head: THREE.Vector2, headFade: number): number {
    let level = 0;
    for (const { spec, card: node, link } of this.gathers) {
      const enter = ease.outCubic(seg(t, spec.enter[0], spec.enter[1]));
      const absorb = ease.inCubic(seg(t, spec.absorb[0], spec.absorb[1]));
      const pos = bezier(spec.from, spec.control, spec.hover, enter);
      pos.lerp(head, absorb);
      const opacity = seg(t, spec.enter[0], spec.enter[0] + 0.5) * (1 - seg(t, spec.absorb[1] - 0.12, spec.absorb[1]));
      node.set(pos.x, pos.y, 1 - absorb * 0.85, opacity);

      const linkOpacity = 0.75 * (1 - seg(t, spec.absorb[1] - 0.2, spec.absorb[1]));
      const mid = P((pos.x + head.x) / 2, (pos.y + head.y) / 2 + 0.25);
      if (pos.distanceTo(head) > 0.05) link.setCurve(pos, mid, head);
      link.update({ opacity: linkOpacity, phase: t, draw: ease.outCubic(seg(t, spec.enter[1] - 0.15, spec.enter[1] + 0.35)) });

      level += seg(t, spec.absorb[1] - 0.05, spec.absorb[1] + 0.35) * 0.16;
    }
    level += seg(t, 14.2, 15.8) * 0.2;
    level += seg(t, 16.6, 21.0) * 0.12;
    return level * headFade;
  }

  /** 6. ガイドラインと設定資料が中央へ移り、読み込まれる。 */
  private updateReading(t: number, head: THREE.Vector2): void {
    // ガイドライン：上から入り、読み込み後は左へ退いてプロンプトの元になり、役目を終えて消える
    const gEnter = ease.outCubic(seg(t, 12.8, 13.8));
    const gPark = ease.inOutCubic(seg(t, 15.6, 16.4));
    const gExit = ease.inCubic(seg(t, 21.6, 22.4));
    const gPos = bezier(P(-3.6, 6.3), P(-4.2, 3.4), READ_LEFT, gEnter).lerp(PARK_LEFT, gPark);
    gPos.x -= gExit * 1.2;
    this.guideline.set(gPos.x, gPos.y, 1, seg(t, 12.8, 13.3) * (1 - gExit));

    // 設定資料：上から入り、右へ退いたあと、画像生成 AI へ運ばれる
    const rEnter = ease.outCubic(seg(t, 13.1, 14.1));
    const rPark = ease.inOutCubic(seg(t, 15.6, 16.4));
    const rFly = ease.inOutCubic(seg(t, 23.3, 24.4));
    const rPos = bezier(P(3.6, 6.3), P(4.2, 3.4), READ_RIGHT, rEnter).lerp(PARK_RIGHT, rPark);
    if (rFly > 0) bezier(PARK_RIGHT, P(7.0, 0.6), AI_ICON, rFly, rPos);
    this.reference.set(rPos.x, rPos.y, 1 - rFly * 0.8, seg(t, 13.1, 13.6) * (1 - seg(t, 24.2, 24.4)));

    // 読み取りの走査線
    const scans: [THREE.Vector2, number][] = [
      [READ_LEFT, 14.1],
      [READ_RIGHT, 14.35],
    ];
    scans.forEach(([pos, start], i) => {
      const p = seg(t, start, start + 0.9);
      const bar = this.scanBars[i]!;
      bar.mesh.position.set(pos.x - 1.2 + 2.4 * p, pos.y, 0);
      bar.mesh.scale.set(0.18, 1.3, 1);
      bar.mesh.material.opacity = Math.sin(Math.PI * p) * 0.9;
      bar.mesh.visible = p > 0 && p < 1;
    });

    this.guideStream.update(t, fadeWindow(t, 14.0, 15.7, 0.3, 0.5), P(READ_LEFT.x, READ_LEFT.y - 0.4), head, 0.5);
    this.referenceStream.update(t, fadeWindow(t, 14.25, 15.9, 0.3, 0.5), P(READ_RIGHT.x, READ_RIGHT.y - 0.4), head, -0.5);
  }

  /** 7. ガイドラインをもとにプロンプトを考案する。 */
  private updatePrompt(t: number, head: THREE.Vector2): void {
    const appear = seg(t, 16.0, 16.8);
    const fly = ease.inOutCubic(seg(t, 23.6, 24.8));
    const flicker = appear < 1 ? 0.75 + 0.25 * Math.sin(t * 70) : 1;
    const pos = bezier(PANEL_POS, P(3.8, 1.6), AI_ICON, fly);
    const typingStart = 16.8;
    const typing = promptTextAt(t - typingStart, 4.0);
    const ready = t >= 20.9;
    const blink = (t * 2.4) % 1 < 0.55;
    this.panel.update({
      x: pos.x,
      y: pos.y,
      scale: (0.85 + 0.15 * ease.outBack(appear)) * (1 - fly * 0.88),
      opacity: ease.outCubic(appear) * flicker * (1 - seg(t, 24.6, 24.8)),
      text: t < typingStart ? "" : typing.text,
      cursor: !ready && (t < typingStart || typing.done ? blink : true),
      ready,
      flash: fadeWindow(t, 20.9, 21.8, 0.08, 0.7),
    });

    // ガイドラインからパネルへの導線と、先端の光から立ちのぼる思考の粒
    this.guideBeam.setCurve(...GUIDE_CURVE);
    this.guideBeam.update({
      opacity: 0.85 * fadeWindow(t, 16.4, 21.5, 0.2, 0.5),
      phase: t,
      draw: ease.outCubic(seg(t, 16.4, 16.9)),
    });
    this.thinkStream.update(t, fadeWindow(t, 16.6, 21.2, 0.4, 0.5), head, P(0.2, PANEL_POS.y - 0.9), 0.35, 0.3);

    // ガイドラインから導線に乗って運ばれ、パネルの縁で吸い込まれる観点のキーワード
    this.chips.forEach((chip, k) => {
      const start = CHIP_START + k * CHIP_INTERVAL;
      const p = seg(t, start, start + CHIP_TRAVEL);
      const pos2 = bezier(...GUIDE_CURVE, ease.inOutSine(p));
      pos2.y += 0.32;
      const scale = lerp(0.6, 1, ease.outBack(seg(p, 0, 0.25))) * (1 - 0.75 * seg(p, 0.6, 1));
      const opacity = seg(p, 0, 0.15) * (1 - seg(p, 0.7, 1));
      chip.set(pos2.x, pos2.y, scale, p > 0 && p < 1 ? opacity : 0);
    });
  }

  /** 8. 画像生成 AI のノードが現れ、設定資料とプロンプトが運び込まれる。 */
  private updateAi(t: number, head: THREE.Vector2, master: number): void {
    const appear = seg(t, 22.0, 22.7);
    this.aiNode.set(AI_POS.x, AI_POS.y, 0.6 + 0.4 * ease.outBack(appear), ease.outCubic(appear) * master);

    this.aiBeam.setCurve(head, P(head.x + 2.6, LINE_Y), AI_ENTRY);
    this.aiBeam.update({
      opacity: 1,
      phase: aiBeamPhase(t),
      draw: ease.outCubic(seg(t, 22.5, 23.2)),
      erase: t < 37.45 ? -1e4 : lerp(-1, this.aiBeam.curveLength + 1, ease.inOutSine(seg(t, 37.45, 38.3))),
    });

    // 生成中は、アイコンの周りでリングが回る
    const processing = fadeWindow(t, 24.7, 31.2, 0.4, 0.6);
    this.aiRingOuter.set(AI_ICON.x, AI_ICON.y, 1, 0.95 * processing);
    this.aiRingOuter.mesh.rotation.z = t * 1.6;
    this.aiRingInner.set(AI_ICON.x, AI_ICON.y, 1, 0.85 * processing);
    this.aiRingInner.mesh.rotation.z = -t * 2.4;
    const glowPulse = 0.85 + 0.15 * Math.sin(t * 5);
    this.aiGlow.mesh.position.set(AI_POS.x, AI_POS.y, 0);
    this.aiGlow.mesh.scale.set(4.2 * glowPulse, 2.2 * glowPulse, 1);
    this.aiGlow.mesh.material.opacity = 0.6 * processing;
    this.aiGlow.mesh.visible = processing > 0.001;
  }

  /** 9〜10. 新しい画像が生まれ、中央へ返される。 */
  private updateImage(t: number): void {
    const appear = seg(t, 25.8, 26.5);
    const move = ease.inOutCubic(seg(t, 31.8, 33.0));
    const send = ease.inOutCubic(seg(t, 35.7, 36.7));
    const pos = bezier(GEN_POS, P(2.6, 2.7), IMAGE_CENTER, move);
    if (send > 0) bezier(IMAGE_CENTER, P(2.4, 4.2), CHAT_POS, send, pos);
    this.image.update({
      x: pos.x,
      y: pos.y,
      scale: (0.8 + 0.2 * ease.outBack(appear)) * (1 + 0.25 * move) * (1 - 0.9 * send),
      opacity: ease.outCubic(appear) * (1 - seg(t, 36.5, 36.7)),
      progress: ease.inOutSine(seg(t, 26.2, 30.6)),
      time: t,
      bar: fadeWindow(t, 26.0, 31.3, 0.3, 0.5),
      labelMix: seg(t, 30.6, 31.0),
      flash: fadeWindow(t, 30.6, 31.5, 0.06, 0.8),
    });
    this.genStream.update(
      t,
      fadeWindow(t, 25.9, 30.8, 0.4, 0.5),
      P(AI_ICON.x, AI_ICON.y + 0.35),
      P(GEN_POS.x, GEN_POS.y - GeneratedImage.HEIGHT / 2),
      -0.4,
      0.3,
    );
  }

  /** 11. 画像にメッセージを添えて、チャットへ送る。 */
  private updateSend(t: number, head: THREE.Vector2, master: number): void {
    const chatAppear = seg(t, 34.2, 34.9);
    this.chatNode.set(CHAT_POS.x, CHAT_POS.y, 0.6 + 0.4 * ease.outBack(chatAppear), ease.outCubic(chatAppear) * master);

    const arrival = fadeWindow(t, 36.7, 37.7, 0.05, 0.8);
    this.chatGlow.mesh.position.set(CHAT_POS.x, CHAT_POS.y, 0);
    this.chatGlow.mesh.scale.set(4.0, 1.8, 1);
    this.chatGlow.mesh.material.opacity = 0.7 * arrival;
    this.chatGlow.mesh.visible = arrival > 0.001;

    const msgAppear = seg(t, 34.6, 35.2);
    const msgSend = ease.inOutCubic(seg(t, 35.85, 36.85));
    const msgPos = bezier(MESSAGE_POS, P(5.0, 1.6), CHAT_POS, msgSend);
    this.message.set(
      msgPos.x,
      msgPos.y,
      (0.6 + 0.4 * ease.outBack(msgAppear)) * (1 - 0.85 * msgSend),
      ease.outCubic(msgAppear) * (1 - seg(t, 36.65, 36.85)),
    );

    this.chatBeam.setCurve(head, P(head.x + 3.4, LINE_Y + 0.1), CHAT_ENTRY);
    this.chatBeam.update({
      opacity: 1,
      phase: t,
      draw: ease.outCubic(seg(t, 35.0, 35.6)),
      erase: t < 37.5 ? -1e4 : lerp(-1, this.chatBeam.curveLength + 1, ease.inOutSine(seg(t, 37.5, 38.35))),
    });

    const pop = seg(t, 36.85, 37.25);
    this.sentBadge.set(CHAT_POS.x + 0.75, CHAT_POS.y - 0.55, ease.outBack(pop), seg(t, 36.85, 37.0) * master);
  }
}
