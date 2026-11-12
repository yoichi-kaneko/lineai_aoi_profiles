import * as THREE from "three";
import "./style.css";

const canvas = document.querySelector<HTMLCanvasElement>("#scene");
if (!canvas) {
  throw new Error("#scene の canvas が見つかりません");
}

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050a18);

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
camera.position.set(0, 0, 6);

// 光源
scene.add(new THREE.AmbientLight(0x6080ff, 0.6));
const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
keyLight.position.set(3, 4, 5);
scene.add(keyLight);

// 中心の発光体
const core = new THREE.Mesh(
  new THREE.IcosahedronGeometry(1, 1),
  new THREE.MeshStandardMaterial({
    color: 0x4fc3f7,
    emissive: 0x0b3d5c,
    roughness: 0.35,
    metalness: 0.2,
    flatShading: true,
  }),
);
scene.add(core);

// 発光体を囲むワイヤーフレームの殻
const shell = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(1.7, 0)),
  new THREE.LineBasicMaterial({ color: 0x9be7ff, transparent: true, opacity: 0.7 }),
);
scene.add(shell);

// 周囲に散らばる星
const STAR_COUNT = 800;
const starPositions = new Float32Array(STAR_COUNT * 3);
for (let i = 0; i < STAR_COUNT; i++) {
  const radius = 10 + Math.random() * 15;
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  starPositions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
  starPositions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
  starPositions[i * 3 + 2] = radius * Math.cos(phi);
}
const starGeometry = new THREE.BufferGeometry();
starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
const stars = new THREE.Points(
  starGeometry,
  new THREE.PointsMaterial({ color: 0xffffff, size: 0.06, sizeAttenuation: true }),
);
scene.add(stars);

const resize = (): void => {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
};
window.addEventListener("resize", resize);
resize();

renderer.setAnimationLoop((timeMs: number) => {
  const t = timeMs / 1000;

  core.rotation.set(t * 0.4, t * 0.6, 0);
  core.scale.setScalar(1 + Math.sin(t * 2) * 0.06);

  shell.rotation.set(Math.sin(t * 0.5) * 0.3, -t * 0.3, 0);

  stars.rotation.y = t * 0.02;

  camera.position.y = Math.sin(t * 0.4) * 0.4;
  camera.lookAt(0, 0, 0);

  renderer.render(scene, camera);
});
