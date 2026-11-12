import "@fontsource/rajdhani/latin-500.css";
import "@fontsource/rajdhani/latin-600.css";
import "@fontsource/jetbrains-mono/latin-500.css";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import "./style.css";
import { CAMERA_FOV, fitDistance, pointScaleFor } from "./layout";
import { Background } from "./objects/background";
import { pixelRatio, pointScale } from "./objects/particles";
import { Story } from "./story";
import { LOOP_DURATION, phaseNameAt } from "./timeline";

/** キャンバスに文字を描く前に、ラベル用のフォントを読み込んでおく。 */
async function loadFonts(): Promise<void> {
  const faces = ['500 40px "Rajdhani"', '600 40px "Rajdhani"', '500 40px "JetBrains Mono"'];
  try {
    await Promise.all(faces.map((face) => document.fonts.load(face)));
  } catch {
    // 読み込めなくても、textures.ts の代替フォントで描画を続ける
  }
}

/**
 * URL パラメータ
 * - t=秒: その時刻から再生する
 * - pause: 一時停止した状態で始める
 * - debug: 時刻とフェーズ名を表示する
 */
function readParams(): { start: number; paused: boolean; debug: boolean } {
  const params = new URLSearchParams(window.location.search);
  const start = Number(params.get("t") ?? 0);
  return {
    start: Number.isFinite(start) ? ((start % LOOP_DURATION) + LOOP_DURATION) % LOOP_DURATION : 0,
    paused: params.has("pause"),
    debug: params.has("debug"),
  };
}

async function main(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>("#scene");
  if (!canvas) throw new Error("#scene の canvas が見つかりません");
  await loadFonts();

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#02040b");
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 200);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.8, 0.45, 0.62));
  composer.addPass(new OutputPass());

  const background = new Background();
  scene.add(background.group);
  const story = new Story(scene);

  let cameraDistance = fitDistance(16 / 9);
  const resize = (): void => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const dpr = Math.min(window.devicePixelRatio, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    composer.setPixelRatio(dpr);
    composer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    cameraDistance = fitDistance(camera.aspect);
    pointScale.value = pointScaleFor(height);
    pixelRatio.value = dpr;
  };
  window.addEventListener("resize", resize);
  resize();

  const params = readParams();
  let loopTime = params.start;
  let paused = params.paused;
  const hud = document.createElement("div");
  hud.id = "hud";
  hud.hidden = !params.debug;
  document.body.append(hud);

  // 確認用の操作：Space で一時停止、←/→ で 1 秒（Shift で 5 秒）移動、D で時刻表示
  window.addEventListener("keydown", (event) => {
    const step = event.shiftKey ? 5 : 1;
    if (event.code === "Space") paused = !paused;
    else if (event.code === "ArrowLeft") loopTime -= step;
    else if (event.code === "ArrowRight") loopTime += step;
    else if (event.code === "KeyD") hud.hidden = !hud.hidden;
    else return;
    event.preventDefault();
    loopTime = ((loopTime % LOOP_DURATION) + LOOP_DURATION) % LOOP_DURATION;
  });

  let last = performance.now();
  renderer.setAnimationLoop((now: number) => {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (!paused) loopTime = (loopTime + dt) % LOOP_DURATION;

    // ループ1周でちょうど元に戻る、ごく小さなカメラの揺れ
    const sway = (loopTime / LOOP_DURATION) * Math.PI * 2;
    camera.position.set(Math.sin(sway) * 0.12, Math.sin(sway * 2) * 0.06, cameraDistance);
    camera.lookAt(0, 0, 0);

    background.update(now / 1000);
    story.update(loopTime);
    composer.render();

    if (!hud.hidden) {
      hud.textContent = `${loopTime.toFixed(2)}s / ${LOOP_DURATION}s  ${phaseNameAt(loopTime)}${paused ? "  [paused]" : ""}`;
    }
  });
}

main().catch((error: unknown) => {
  console.error(error);
});
