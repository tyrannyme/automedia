import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const width = 1280;
const height = 720;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(width, height);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x08080b);
scene.fog = new THREE.Fog(0x08080b, 6, 14);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 50);

const knot = new THREE.Mesh(
  new THREE.TorusKnotGeometry(1, 0.32, 360, 48, 2, 3),
  new THREE.MeshPhysicalMaterial({
    color: 0xf2f2f2,
    metalness: 1,
    roughness: 0.16,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
  }),
);
scene.add(knot);

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(9, 96),
  new THREE.MeshPhongMaterial({ color: 0x060607, shininess: 40 }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -2.1;
scene.add(floor);

const colors = [0xef4444, 0x3b82f6, 0x22c55e, 0xa855f7];
const lights = colors.map((color) => {
  const light = new THREE.PointLight(color, 40, 12, 1.6);
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 16, 16),
    new THREE.MeshBasicMaterial({ color }),
  );
  light.add(bulb);
  scene.add(light);
  return light;
});

window.automedia.registerRenderer(({ timeSeconds: t, durationSeconds }) => {
  const turn = (t / durationSeconds) * Math.PI * 2;
  knot.rotation.set(turn * 0.5, turn, 0);
  for (const [i, light] of lights.entries()) {
    const a = turn * (i % 2 ? -1 : 1) + (i * Math.PI) / 2;
    light.position.set(Math.cos(a) * 2.6, Math.sin(a * 2) * 0.9 + 0.3, Math.sin(a) * 2.6);
  }
  camera.position.set(Math.sin(turn) * 1.2, 0.9 + Math.sin(turn * 2) * 0.2, 7.6);
  camera.lookAt(0, -0.1, 0);
  renderer.render(scene, camera);
});
