import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ChevronDown, ChevronUp, Compass, Pause, Play, RotateCcw } from 'lucide-react';

export type ShowcasePresetId = 'overview' | 'qr_stand' | 'mobile_menu' | 'upi_pay';

interface CameraPreset {
  id: ShowcasePresetId;
  label: string;
  caption: string;
  position: [number, number, number];
  target: [number, number, number];
}

const CAMERA_PRESETS: CameraPreset[] = [
  {
    id: 'overview',
    label: 'Bistro Table',
    caption: 'Drag to orbit · Scroll to zoom · Click any 3D station to inspect',
    position: [0.35, 3.35, 6.2],
    target: [0, 0.85, -0.25],
  },
  {
    id: 'qr_stand',
    label: 'Table QR Stand',
    caption: 'Permanent walnut & brass QR standees — update prices without reprinting',
    position: [-2.85, 2.25, 3.25],
    target: [-1.55, 0.9, -0.2],
  },
  {
    id: 'mobile_menu',
    label: 'Live 3D Menu',
    caption: 'Instant mobile menu with Hindi auto-translation, discounts & cart',
    position: [2.7, 2.35, 3.65],
    target: [1.4, 1.05, 0.45],
  },
  {
    id: 'upi_pay',
    label: 'Multi-UPI Pay',
    caption: 'Direct Paytm, BHIM UPI, GPay & PhonePe checkout + Google Reviews',
    position: [0.15, 2.45, 2.15],
    target: [0.05, 1.05, -1.7],
  },
];

// Module-level scratch vectors to guarantee zero per-frame allocations
const _goalPos = new THREE.Vector3();
const _goalTarget = new THREE.Vector3();
const _pointerNdc = new THREE.Vector2();

function detectSoftwareWebGL(renderer: THREE.WebGLRenderer): boolean {
  try {
    const gl = renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const rendererStr = String(
      dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) || ''
    );
    return /swiftshader|llvmpipe|softpipe|mesa offscreen|microsoft basic/i.test(rendererStr);
  } catch {
    return false;
  }
}

function createRoundedRectShape(width: number, height: number, radius: number): THREE.Shape {
  const s = new THREE.Shape();
  const x = -width / 2;
  const y = -height / 2;
  const r = Math.min(radius, width / 2, height / 2);
  s.moveTo(x + r, y);
  s.lineTo(x + width - r, y);
  s.quadraticCurveTo(x + width, y, x + width, y + r);
  s.lineTo(x + width, y + height - r);
  s.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  s.lineTo(x + r, y + height);
  s.quadraticCurveTo(x, y + height, x, y + height - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

function createWoodTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 512, 512);
  grad.addColorStop(0, '#3a2518');
  grad.addColorStop(0.5, '#4b301f');
  grad.addColorStop(1, '#2d1c12');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 160; i += 1) {
    const y = (i / 160) * 512;
    ctx.strokeStyle = i % 3 === 0 ? 'rgba(20,10,5,0.28)' : 'rgba(120,76,44,0.14)';
    ctx.lineWidth = 1 + (i % 3);
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= 512; x += 32) {
      const wave = Math.sin(x * 0.015 + i * 0.35) * 4;
      ctx.lineTo(x, y + wave);
    }
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
  grad.addColorStop(0, 'rgba(5, 3, 2, 0.72)');
  grad.addColorStop(0.55, 'rgba(5, 3, 2, 0.30)');
  grad.addColorStop(1, 'rgba(5, 3, 2, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

function drawFakeQrMatrix(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  seed: number,
  fg = '#171923'
) {
  const cells = 17;
  const cell = size / cells;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(x - 10, y - 10, size + 20, size + 20);

  const drawFinder = (cx: number, cy: number) => {
    ctx.fillStyle = fg;
    ctx.fillRect(x + cx * cell, y + cy * cell, cell * 5, cell * 5);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(x + (cx + 1) * cell, y + (cy + 1) * cell, cell * 3, cell * 3);
    ctx.fillStyle = fg;
    ctx.fillRect(x + (cx + 2) * cell, y + (cy + 2) * cell, cell, cell);
  };

  drawFinder(0, 0);
  drawFinder(cells - 5, 0);
  drawFinder(0, cells - 5);

  ctx.fillStyle = fg;
  for (let r = 0; r < cells; r += 1) {
    for (let c = 0; c < cells; c += 1) {
      const inFinder =
        (r < 6 && c < 6) || (r < 6 && c >= cells - 6) || (r >= cells - 6 && c < 6);
      if (inFinder) continue;
      const hash = Math.sin((r * 31 + c * 17 + seed) * 12.9898) * 43758.5453;
      if (hash - Math.floor(hash) > 0.48) {
        ctx.fillRect(x + c * cell, y + r * cell, cell * 0.92, cell * 0.92);
      }
    }
  }
}

function createQrCardTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 680;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#FFF9F1';
  ctx.fillRect(0, 0, 512, 680);

  // Header band
  ctx.fillStyle = '#171923';
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = '#FF9F43';
  ctx.fillRect(0, 124, 512, 8);

  ctx.fillStyle = '#FF9F43';
  ctx.font = 'bold 24px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('MENUQR · TABLE 04', 256, 52);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 38px Georgia, serif';
  ctx.fillText('Cafe Mocha', 256, 102);

  // QR matrix
  drawFakeQrMatrix(ctx, 106, 178, 300, 11, '#171923');

  // Center amber badge inside QR
  ctx.fillStyle = '#FF9F43';
  ctx.beginPath();
  ctx.roundRect(222, 294, 68, 68, 14);
  ctx.fill();
  ctx.fillStyle = '#171923';
  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.fillText('M', 256, 340);

  ctx.fillStyle = '#171923';
  ctx.font = 'bold 28px system-ui, sans-serif';
  ctx.fillText('Scan to Explore Menu', 256, 540);

  ctx.fillStyle = '#6B7280';
  ctx.font = '20px system-ui, sans-serif';
  ctx.fillText('English · हिंदी · Direct UPI Pay', 256, 580);

  ctx.fillStyle = '#C86D14';
  ctx.font = 'bold 19px monospace';
  ctx.fillText('/menu/cafe-mocha', 256, 632);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function createPhoneScreenTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  // Dark obsidian background with warm amber radial glow
  ctx.fillStyle = '#0E0B09';
  ctx.fillRect(0, 0, 512, 1024);

  const glow = ctx.createRadialGradient(256, 120, 20, 256, 120, 320);
  glow.addColorStop(0, 'rgba(255, 138, 31, 0.38)');
  glow.addColorStop(1, 'rgba(14, 11, 9, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 512, 460);

  // Status bar + dynamic island
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.roundRect(184, 18, 144, 30, 15);
  ctx.fill();

  ctx.fillStyle = '#D6CEC5';
  ctx.font = '600 22px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Hello Customer', 34, 102);

  // Headline
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 42px system-ui, sans-serif';
  ctx.fillText('Good Food.', 34, 152);
  ctx.fillStyle = '#FF9F43';
  ctx.fillText('Great Moments!', 34, 200);

  // Language chip top right
  ctx.fillStyle = '#FF8A1F';
  ctx.beginPath();
  ctx.roundRect(384, 74, 94, 38, 12);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 18px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('EN | हिं', 431, 99);

  // Featured Spotlight Card
  ctx.fillStyle = '#201914';
  ctx.strokeStyle = 'rgba(255, 159, 67, 0.45)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(30, 232, 452, 200, 26);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#FF7A00';
  ctx.beginPath();
  ctx.roundRect(52, 256, 136, 30, 8);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('20% OFF TODAY', 120, 277);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 30px system-ui, sans-serif';
  ctx.fillText('Paneer Tikka', 52, 330);
  ctx.fillStyle = '#A89F96';
  ctx.font = '18px system-ui, sans-serif';
  ctx.fillText('Char-grilled · Mint Chutney', 52, 360);
  ctx.fillStyle = '#FFA142';
  ctx.font = 'bold 30px monospace';
  ctx.fillText('₹249', 52, 404);
  ctx.fillStyle = '#7D756D';
  ctx.font = '20px monospace';
  ctx.fillText('₹299', 142, 404);

  // Warm dish circle preview
  const dishGrad = ctx.createRadialGradient(392, 332, 12, 392, 332, 68);
  dishGrad.addColorStop(0, '#FFB347');
  dishGrad.addColorStop(0.65, '#C84B11');
  dishGrad.addColorStop(1, '#3B180A');
  ctx.fillStyle = dishGrad;
  ctx.beginPath();
  ctx.arc(392, 332, 66, 0, Math.PI * 2);
  ctx.fill();

  // Dish Grid Cards
  const dishes = [
    { name: 'Cappuccino', price: '₹149', old: '₹179', color: '#B47642' },
    { name: 'Margherita', price: '₹299', old: '₹349', color: '#D9532F' },
    { name: 'Cold Coffee', price: '₹179', old: '₹219', color: '#8A5636' },
    { name: 'Brownie', price: '₹159', old: '₹199', color: '#5A3222' },
  ];

  dishes.forEach((d, idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const x = 30 + col * 234;
    const y = 464 + row * 218;

    ctx.fillStyle = '#1B1613';
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x, y, 218, 200, 22);
    ctx.fill();
    ctx.stroke();

    // Dish photo mock
    ctx.fillStyle = d.color;
    ctx.beginPath();
    ctx.roundRect(x + 14, y + 14, 190, 96, 14);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 21px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(d.name, x + 16, y + 142);

    ctx.fillStyle = '#FFA142';
    ctx.font = 'bold 22px monospace';
    ctx.fillText(d.price, x + 16, y + 178);

    // Orange + button
    ctx.fillStyle = '#FF8A1F';
    ctx.beginPath();
    ctx.arc(x + 182, y + 170, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('+', x + 182, y + 179);
  });

  // Bottom Cart Bar
  ctx.fillStyle = '#FF8A1F';
  ctx.beginPath();
  ctx.roundRect(30, 922, 452, 72, 22);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('3 items · ₹627', 58, 966);
  ctx.textAlign = 'right';
  ctx.fillText('Pay UPI →', 454, 966);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function createUpiBoardTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 640;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#151821';
  ctx.fillRect(0, 0, 512, 640);

  // Top emerald + amber accent
  ctx.fillStyle = '#239B69';
  ctx.fillRect(0, 0, 512, 16);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#34D399';
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.fillText('0% COMMISSION · DIRECT UPI PAY', 256, 62);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.fillText('Pay Any UPI App', 256, 108);

  // QR Box
  drawFakeQrMatrix(ctx, 136, 146, 240, 42, '#171923');

  // 4 UPI App Brand Tiles
  const apps = [
    { label: 'Paytm', bg: '#00BAF2', text: '#0B1E3D' },
    { label: 'BHIM UPI', bg: '#00897B', text: '#FFFFFF' },
    { label: 'GPay', bg: '#2563EB', text: '#FFFFFF' },
    { label: 'PhonePe', bg: '#5F259F', text: '#FFFFFF' },
  ];

  apps.forEach((app, idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const x = 44 + col * 218;
    const y = 434 + row * 68;
    ctx.fillStyle = app.bg;
    ctx.beginPath();
    ctx.roundRect(x, y, 204, 52, 14);
    ctx.fill();
    ctx.fillStyle = app.text;
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(app.label, x + 102, y + 34);
  });

  // Google Reviews footer hint
  ctx.fillStyle = '#FF9F43';
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.fillText('★★★★★  Post-Payment Google Reviews', 256, 604);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function createLatteArtTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(128, 128, 18, 128, 128, 128);
  grad.addColorStop(0, '#c88d55');
  grad.addColorStop(0.75, '#8c5328');
  grad.addColorStop(1, '#583015');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  // Cream rosetta heart
  ctx.fillStyle = '#F7EBDC';
  ctx.beginPath();
  ctx.moveTo(128, 174);
  ctx.bezierCurveTo(64, 134, 70, 74, 128, 102);
  ctx.bezierCurveTo(186, 74, 192, 134, 128, 174);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createRupeeCoinTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(96, 96, 16, 128, 128, 128);
  grad.addColorStop(0, '#FFE29A');
  grad.addColorStop(0.65, '#F5A623');
  grad.addColorStop(1, '#B4690E');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  ctx.strokeStyle = '#FFF2C6';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(128, 128, 106, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#4B2804';
  ctx.font = 'bold 124px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('₹', 128, 136);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createGlowParticleTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255, 198, 120, 0.95)');
  grad.addColorStop(0.4, 'rgba(255, 159, 67, 0.35)');
  grad.addColorStop(1, 'rgba(255, 159, 67, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

export function Landing3DShowcase() {
  const canvasMountRef = useRef<HTMLDivElement>(null);
  const [activePreset, setActivePreset] = useState<ShowcasePresetId>('overview');
  const [autoRotate, setAutoRotate] = useState(true);
  const [dockOpen, setDockOpen] = useState(true);
  const [hoveredStation, setHoveredStation] = useState<ShowcasePresetId | null>(null);

  const activePresetRef = useRef<ShowcasePresetId>('overview');
  const autoRotateRef = useRef(true);
  const cameraLerpActiveRef = useRef(false);

  const selectPreset = (presetId: ShowcasePresetId) => {
    activePresetRef.current = presetId;
    setActivePreset(presetId);
    cameraLerpActiveRef.current = true;
  };

  useEffect(() => {
    autoRotateRef.current = autoRotate;
  }, [autoRotate]);

  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#14110F');
    scene.fog = new THREE.FogExp2(0x14110f, 0.048);

    const width = container.clientWidth || 640;
    const height = container.clientHeight || 520;

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 60);
    camera.position.set(...CAMERA_PRESETS[0].position);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    const isSoftwareGl = detectSoftwareWebGL(renderer);

    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    container.appendChild(renderer.domElement);

    // Environment map (IBL) on every device for crisp reflections on brass, walnut, ceramic & glass
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    roomEnv.dispose();

    // Lighting rig: warm key, cool sky/ground fill, subtle amber rim
    const hemiLight = new THREE.HemisphereLight(0xcfe0ff, 0x3b2a1e, 0.72);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff1dc, 2.2);
    keyLight.position.set(4.5, 7.5, 5.2);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 1;
      keyLight.shadow.camera.far = 22;
      keyLight.shadow.camera.left = -6;
      keyLight.shadow.camera.right = 6;
      keyLight.shadow.camera.top = 6;
      keyLight.shadow.camera.bottom = -6;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.025;
    }
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xff9f43, 1.15);
    rimLight.position.set(-5.2, 3.8, -4.5);
    scene.add(rimLight);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.enablePan = false;
    controls.minDistance = 3.8;
    controls.maxDistance = 10.2;
    controls.minPolarAngle = 0.28;
    controls.maxPolarAngle = Math.PI * 0.455;
    controls.target.set(...CAMERA_PRESETS[0].target);
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.7;

    const handleControlStart = () => {
      cameraLerpActiveRef.current = false;
    };
    controls.addEventListener('start', handleControlStart);

    // Track disposable resources
    const textures: THREE.Texture[] = [];
    const registerTex = <T extends THREE.Texture>(t: T): T => {
      textures.push(t);
      return t;
    };

    const woodTex = registerTex(createWoodTexture());
    const shadowTex = registerTex(createContactShadowTexture());
    const qrCardTex = registerTex(createQrCardTexture());
    const phoneScreenTex = registerTex(createPhoneScreenTexture());
    const upiBoardTex = registerTex(createUpiBoardTexture());
    const latteTex = registerTex(createLatteArtTexture());
    const rupeeTex = registerTex(createRupeeCoinTexture());
    const particleTex = registerTex(createGlowParticleTexture());

    // Shared PBR materials
    const walnutMat = new THREE.MeshStandardMaterial({
      map: woodTex,
      roughness: 0.62,
      metalness: 0.05,
    });
    const darkWalnutMat = new THREE.MeshStandardMaterial({
      color: 0x3a2417,
      roughness: 0.52,
      metalness: 0.08,
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xe3b15b,
      roughness: 0.26,
      metalness: 0.88,
    });
    const titaniumMat = new THREE.MeshStandardMaterial({
      color: 0x242731,
      roughness: 0.28,
      metalness: 0.85,
    });
    const slateMat = new THREE.MeshStandardMaterial({
      color: 0x1a1d26,
      roughness: 0.42,
      metalness: 0.35,
    });
    const ceramicMat = new THREE.MeshStandardMaterial({
      color: 0xf7f1e8,
      roughness: 0.18,
      metalness: 0.04,
    });
    const contactShadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
    });

    const addContactShadow = (parent: THREE.Object3D, radius: number, x = 0, z = 0) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), contactShadowMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.004, z);
      parent.add(m);
    };

    // --- 0. Bistro Tabletop Stage (y = 0) ---
    const tableGroup = new THREE.Group();
    const tabletop = new THREE.Mesh(new THREE.CylinderGeometry(4.15, 4.05, 0.22, 64), walnutMat);
    tabletop.position.y = -0.11;
    tabletop.receiveShadow = true;
    tableGroup.add(tabletop);

    const brassTableRim = new THREE.Mesh(new THREE.TorusGeometry(4.15, 0.032, 16, 80), brassMat);
    brassTableRim.rotation.x = Math.PI / 2;
    brassTableRim.position.y = -0.02;
    tableGroup.add(brassTableRim);

    // Subtle matte table pedestal beneath
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.95, 1.8, 32), slateMat);
    pedestal.position.y = -1.12;
    tableGroup.add(pedestal);
    scene.add(tableGroup);

    const clickableStations: Array<{ group: THREE.Group; presetId: ShowcasePresetId }> = [];

    // --- 1. Assembly A: Tabletop Walnut & Brass QR Stand + Ceramic Cappuccino ---
    const qrStation = new THREE.Group();
    qrStation.position.set(-1.55, 0, -0.15);
    qrStation.rotation.y = 0.28;

    // Chamfered wooden base
    const standBaseShape = createRoundedRectShape(1.42, 0.66, 0.12);
    const standBaseGeo = new THREE.ExtrudeGeometry(standBaseShape, {
      depth: 0.16,
      bevelEnabled: true,
      bevelThickness: 0.03,
      bevelSize: 0.03,
      bevelSegments: 3,
    });
    standBaseGeo.rotateX(Math.PI / 2);
    const standBase = new THREE.Mesh(standBaseGeo, darkWalnutMat);
    standBase.position.y = 0.19;
    standBase.castShadow = true;
    standBase.receiveShadow = true;
    qrStation.add(standBase);

    // Brass base inlay strip
    const brassStrip = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.035, 0.06), brassMat);
    brassStrip.position.set(0, 0.205, 0.24);
    qrStation.add(brassStrip);

    // Angled QR Frame
    const qrPanelHolder = new THREE.Group();
    qrPanelHolder.position.set(0, 0.2, -0.02);
    qrPanelHolder.rotation.x = -0.16;

    const frameShape = createRoundedRectShape(1.36, 1.82, 0.1);
    const frameGeo = new THREE.ExtrudeGeometry(frameShape, {
      depth: 0.07,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.02,
      bevelSegments: 3,
    });
    const frameMesh = new THREE.Mesh(frameGeo, darkWalnutMat);
    frameMesh.position.set(0, 0.92, -0.035);
    frameMesh.castShadow = true;
    qrPanelHolder.add(frameMesh);

    // Brass perimeter trim
    const trimMesh = new THREE.Mesh(new THREE.BoxGeometry(1.42, 1.86, 0.04), brassMat);
    trimMesh.position.set(0, 0.92, -0.01);
    qrPanelHolder.add(trimMesh);

    // Printed QR Face (Front + Back so orbit works 360°)
    const qrFaceMat = new THREE.MeshStandardMaterial({
      map: qrCardTex,
      roughness: 0.35,
      metalness: 0.02,
    });
    const qrFront = new THREE.Mesh(new THREE.PlaneGeometry(1.24, 1.66), qrFaceMat);
    qrFront.position.set(0, 0.92, 0.058);
    qrPanelHolder.add(qrFront);

    const qrBack = new THREE.Mesh(new THREE.PlaneGeometry(1.24, 1.66), qrFaceMat);
    qrBack.rotation.y = Math.PI;
    qrBack.position.set(0, 0.92, -0.058);
    qrPanelHolder.add(qrBack);
    qrStation.add(qrPanelHolder);
    addContactShadow(qrStation, 0.95, 0, 0);

    // Ceramic Cappuccino Cup & Saucer right beside QR stand
    const cupGroup = new THREE.Group();
    cupGroup.position.set(1.12, 0, 0.72);

    const saucerPts = [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(0.32, 0.0),
      new THREE.Vector2(0.56, 0.055),
      new THREE.Vector2(0.58, 0.085),
      new THREE.Vector2(0.52, 0.085),
      new THREE.Vector2(0.28, 0.03),
      new THREE.Vector2(0.0, 0.03),
    ];
    const saucer = new THREE.Mesh(new THREE.LatheGeometry(saucerPts, 36), ceramicMat);
    saucer.castShadow = true;
    saucer.receiveShadow = true;
    cupGroup.add(saucer);

    const cupPts = [
      new THREE.Vector2(0.0, 0.03),
      new THREE.Vector2(0.21, 0.03),
      new THREE.Vector2(0.29, 0.14),
      new THREE.Vector2(0.34, 0.44),
      new THREE.Vector2(0.36, 0.48),
      new THREE.Vector2(0.31, 0.48),
      new THREE.Vector2(0.27, 0.15),
      new THREE.Vector2(0.0, 0.07),
    ];
    const cup = new THREE.Mesh(new THREE.LatheGeometry(cupPts, 36), ceramicMat);
    cup.castShadow = true;
    cupGroup.add(cup);

    const handleCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.32, 0.39, 0),
      new THREE.Vector3(0.49, 0.36, 0),
      new THREE.Vector3(0.48, 0.21, 0),
      new THREE.Vector3(0.27, 0.14, 0),
    ]);
    const handle = new THREE.Mesh(new THREE.TubeGeometry(handleCurve, 20, 0.034, 12, false), ceramicMat);
    handle.castShadow = true;
    cupGroup.add(handle);

    const coffeeDisc = new THREE.Mesh(
      new THREE.CircleGeometry(0.315, 32),
      new THREE.MeshStandardMaterial({ map: latteTex, roughness: 0.22, metalness: 0.02 })
    );
    coffeeDisc.rotation.x = -Math.PI / 2;
    coffeeDisc.position.y = 0.43;
    cupGroup.add(coffeeDisc);

    // Espresso spoon
    const spoonStem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.62, 10), brassMat);
    spoonStem.rotation.z = Math.PI / 2;
    spoonStem.rotation.y = 0.45;
    spoonStem.position.set(0.08, 0.06, 0.44);
    cupGroup.add(spoonStem);

    addContactShadow(cupGroup, 0.68, 0, 0);
    qrStation.add(cupGroup);
    scene.add(qrStation);
    clickableStations.push({ group: qrStation, presetId: 'qr_stand' });

    // --- 2. Assembly B: Live 3D Smartphone Digital Menu ---
    const phoneStation = new THREE.Group();
    phoneStation.position.set(1.45, 0, 0.45);
    phoneStation.rotation.y = -0.34;

    // Sculpted Dock Cradle
    const dockShape = createRoundedRectShape(1.12, 0.62, 0.14);
    const dockGeo = new THREE.ExtrudeGeometry(dockShape, {
      depth: 0.14,
      bevelEnabled: true,
      bevelThickness: 0.025,
      bevelSize: 0.025,
      bevelSegments: 3,
    });
    dockGeo.rotateX(Math.PI / 2);
    const dockMesh = new THREE.Mesh(dockGeo, slateMat);
    dockMesh.position.y = 0.16;
    dockMesh.castShadow = true;
    dockMesh.receiveShadow = true;
    phoneStation.add(dockMesh);

    const dockBrassAccent = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.025, 0.04), brassMat);
    dockBrassAccent.position.set(0, 0.175, 0.25);
    phoneStation.add(dockBrassAccent);

    // Floating Smartphone Group
    const phoneBodyGroup = new THREE.Group();
    phoneBodyGroup.position.set(0, 1.28, 0);
    phoneBodyGroup.rotation.x = -0.12;

    const phoneShape = createRoundedRectShape(1.04, 2.08, 0.16);
    const phoneGeo = new THREE.ExtrudeGeometry(phoneShape, {
      depth: 0.08,
      bevelEnabled: true,
      bevelThickness: 0.022,
      bevelSize: 0.02,
      bevelSegments: 4,
    });
    phoneGeo.center();
    const phoneChassis = new THREE.Mesh(phoneGeo, titaniumMat);
    phoneChassis.castShadow = true;
    phoneBodyGroup.add(phoneChassis);

    // Brass chamfer highlight ring around phone edge
    const screenMat = new THREE.MeshStandardMaterial({
      map: phoneScreenTex,
      roughness: 0.14,
      metalness: 0.06,
      emissive: new THREE.Color('#FF9F43'),
      emissiveMap: phoneScreenTex,
      emissiveIntensity: 0.22,
    });
    const screenPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 1.96), screenMat);
    screenPlane.position.z = 0.065;
    phoneBodyGroup.add(screenPlane);

    // Rear Camera Island
    const camBump = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.42, 0.04), slateMat);
    camBump.position.set(-0.22, 0.64, -0.075);
    phoneBodyGroup.add(camBump);
    for (let i = 0; i < 3; i += 1) {
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.03, 18), brassMat);
      lens.rotation.x = Math.PI / 2;
      const lx = i === 2 ? -0.14 : -0.3;
      const ly = i === 0 ? 0.72 : i === 1 ? 0.56 : 0.64;
      lens.position.set(lx, ly, -0.095);
      phoneBodyGroup.add(lens);
    }

    phoneStation.add(phoneBodyGroup);
    addContactShadow(phoneStation, 0.85, 0, 0);
    scene.add(phoneStation);
    clickableStations.push({ group: phoneStation, presetId: 'mobile_menu' });

    // --- 3. Assembly C: Direct Multi-UPI Counter Stand + Rotating Gold ₹ Coin ---
    const upiStation = new THREE.Group();
    upiStation.position.set(0.05, 0, -1.75);

    const upiBaseShape = createRoundedRectShape(1.62, 0.7, 0.12);
    const upiBaseGeo = new THREE.ExtrudeGeometry(upiBaseShape, {
      depth: 0.15,
      bevelEnabled: true,
      bevelThickness: 0.03,
      bevelSize: 0.03,
      bevelSegments: 3,
    });
    upiBaseGeo.rotateX(Math.PI / 2);
    const upiBase = new THREE.Mesh(upiBaseGeo, slateMat);
    upiBase.position.y = 0.18;
    upiBase.castShadow = true;
    upiBase.receiveShadow = true;
    upiStation.add(upiBase);

    const upiBoardHolder = new THREE.Group();
    upiBoardHolder.position.set(0, 0.19, -0.02);
    upiBoardHolder.rotation.x = -0.14;

    const upiFrameShape = createRoundedRectShape(1.52, 1.9, 0.12);
    const upiFrameGeo = new THREE.ExtrudeGeometry(upiFrameShape, {
      depth: 0.07,
      bevelEnabled: true,
      bevelThickness: 0.022,
      bevelSize: 0.022,
      bevelSegments: 3,
    });
    const upiFrame = new THREE.Mesh(upiFrameGeo, slateMat);
    upiFrame.position.set(0, 0.96, -0.035);
    upiFrame.castShadow = true;
    upiBoardHolder.add(upiFrame);

    // Emerald & Brass top bar
    const upiAccentBar = new THREE.Mesh(
      new THREE.BoxGeometry(1.56, 0.05, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x239b69, roughness: 0.3, metalness: 0.4 })
    );
    upiAccentBar.position.set(0, 1.92, 0);
    upiBoardHolder.add(upiAccentBar);

    const upiFaceMat = new THREE.MeshStandardMaterial({
      map: upiBoardTex,
      roughness: 0.25,
      metalness: 0.08,
      emissive: new THREE.Color('#ffffff'),
      emissiveMap: upiBoardTex,
      emissiveIntensity: 0.14,
    });
    const upiFront = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.76), upiFaceMat);
    upiFront.position.set(0, 0.96, 0.062);
    upiBoardHolder.add(upiFront);

    const upiBack = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.76), upiFaceMat);
    upiBack.rotation.y = Math.PI;
    upiBack.position.set(0, 0.96, -0.062);
    upiBoardHolder.add(upiBack);
    upiStation.add(upiBoardHolder);

    // Spinning Metallic ₹ Rupee Coin hovering beside UPI stand
    const coinGroup = new THREE.Group();
    coinGroup.position.set(1.12, 0.92, 0.28);
    const coinEdge = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.065, 36), brassMat);
    coinEdge.rotation.x = Math.PI / 2;
    coinEdge.castShadow = true;
    coinGroup.add(coinEdge);

    const coinFaceMat = new THREE.MeshStandardMaterial({
      map: rupeeTex,
      roughness: 0.24,
      metalness: 0.78,
    });
    const coinFront = new THREE.Mesh(new THREE.CircleGeometry(0.295, 36), coinFaceMat);
    coinFront.position.z = 0.036;
    coinGroup.add(coinFront);
    const coinBack = new THREE.Mesh(new THREE.CircleGeometry(0.295, 36), coinFaceMat);
    coinBack.rotation.y = Math.PI;
    coinBack.position.z = -0.036;
    coinGroup.add(coinBack);

    upiStation.add(coinGroup);
    addContactShadow(upiStation, 1.05, 0, 0);
    addContactShadow(upiStation, 0.42, 1.12, 0.28);
    scene.add(upiStation);
    clickableStations.push({ group: upiStation, presetId: 'upi_pay' });

    // --- 4. Ambient Warm Bistro Dust Particles ---
    const particleCount = 46;
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 0.8 + Math.random() * 4.4;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = 0.4 + Math.random() * 3.4;
      positions[i * 3 + 2] = Math.sin(angle) * radius;
    }
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particleMat = new THREE.PointsMaterial({
      map: particleTex,
      size: 0.16,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    // --- Raycasting for click-to-inspect & hover feedback ---
    const raycaster = new THREE.Raycaster();
    let pointerDownX = 0;
    let pointerDownY = 0;

    const findHitStation = (clientX: number, clientY: number): ShowcasePresetId | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      _pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      _pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(_pointerNdc, camera);
      for (const station of clickableStations) {
        const hits = raycaster.intersectObject(station.group, true);
        if (hits.length > 0) return station.presetId;
      }
      return null;
    };

    const onPointerDown = (e: PointerEvent) => {
      pointerDownX = e.clientX;
      pointerDownY = e.clientY;
    };

    const onPointerUp = (e: PointerEvent) => {
      const moved = Math.hypot(e.clientX - pointerDownX, e.clientY - pointerDownY);
      if (moved > 6) return; // Was an orbit drag, not a click
      const hit = findHitStation(e.clientX, e.clientY);
      if (hit) {
        selectPreset(hit);
      }
    };

    let lastHoverCheck = 0;
    const onPointerMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - lastHoverCheck < 70) return;
      lastHoverCheck = now;
      const hit = findHitStation(e.clientX, e.clientY);
      renderer.domElement.style.cursor = hit ? 'pointer' : 'grab';
      setHoveredStation(hit);
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointermove', onPointerMove);

    const onContextLost = (e: Event) => {
      e.preventDefault();
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);

    // Responsive ResizeObserver
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const w = Math.max(1, Math.floor(entry.contentRect.width));
      const h = Math.max(1, Math.floor(entry.contentRect.height));
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

    // Animation loop (with software WebGL pacing)
    let rafId = 0;
    let timerId = 0;
    let disposed = false;
    let lastTime = performance.now();

    const renderFrame = (now: number) => {
      if (disposed) return;
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      const t = now * 0.001;

      // Subtle living motion on hero objects
      phoneBodyGroup.position.y = 1.28 + Math.sin(t * 1.45) * 0.055;
      phoneBodyGroup.rotation.z = Math.sin(t * 0.9) * 0.025;
      coinGroup.position.y = 0.92 + Math.sin(t * 1.8 + 0.8) * 0.06;
      coinGroup.rotation.y += dt * 1.15;
      particles.rotation.y = t * 0.04;

      // Smooth camera transition to selected preset
      if (cameraLerpActiveRef.current) {
        const preset =
          CAMERA_PRESETS.find((p) => p.id === activePresetRef.current) || CAMERA_PRESETS[0];
        _goalPos.set(...preset.position);
        _goalTarget.set(...preset.target);

        camera.position.x = THREE.MathUtils.damp(camera.position.x, _goalPos.x, 4.5, dt);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, _goalPos.y, 4.5, dt);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, _goalPos.z, 4.5, dt);

        controls.target.x = THREE.MathUtils.damp(controls.target.x, _goalTarget.x, 5.2, dt);
        controls.target.y = THREE.MathUtils.damp(controls.target.y, _goalTarget.y, 5.2, dt);
        controls.target.z = THREE.MathUtils.damp(controls.target.z, _goalTarget.z, 5.2, dt);

        if (
          camera.position.distanceTo(_goalPos) < 0.03 &&
          controls.target.distanceTo(_goalTarget) < 0.02
        ) {
          cameraLerpActiveRef.current = false;
        }
      }

      controls.autoRotate = autoRotateRef.current && !cameraLerpActiveRef.current;
      controls.update();
      renderer.render(scene, camera);

      if (isSoftwareGl) {
        timerId = window.setTimeout(() => {
          rafId = requestAnimationFrame(renderFrame);
        }, 24);
      } else {
        rafId = requestAnimationFrame(renderFrame);
      }
    };

    rafId = requestAnimationFrame(renderFrame);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      clearTimeout(timerId);
      resizeObserver.disconnect();
      controls.removeEventListener('start', handleControlStart);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      controls.dispose();

      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh || (obj as THREE.Points).isPoints) {
          const mesh = obj as THREE.Mesh;
          mesh.geometry?.dispose();
          const mat = mesh.material;
          if (Array.isArray(mat)) {
            mat.forEach((m) => m.dispose());
          } else {
            mat?.dispose();
          }
        }
      });
      textures.forEach((t) => t.dispose());
      envTarget.dispose();
      pmremGenerator.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  const currentPreset = CAMERA_PRESETS.find((p) => p.id === activePreset) || CAMERA_PRESETS[0];
  const hoveredPreset = hoveredStation
    ? CAMERA_PRESETS.find((p) => p.id === hoveredStation)
    : null;

  return (
    <div className="relative w-full h-[460px] sm:h-[540px] lg:h-[580px] rounded-2xl overflow-hidden border border-[#2D2621] bg-[#14110F] shadow-[0_24px_60px_-24px_rgba(0,0,0,0.65)] select-none">
      {/* Isolated WebGL Canvas Mount */}
      <div
        ref={canvasMountRef}
        className="absolute inset-0 w-full h-full"
        aria-label="Interactive 3D MENUQR Bistro Table Scene"
      />

      {/* Top-Left Minimal Station Caption (solid translucent fill — zero backdrop-filter over WebGL) */}
      <div className="pointer-events-none absolute top-3.5 left-3.5 right-3.5 flex items-center justify-between gap-2">
        <div className="px-3 py-1.5 rounded-xl bg-[#181411]/90 border border-white/12 text-white max-w-md">
          <p className="text-[11px] font-bold tracking-wide text-[#FF9F43] flex items-center gap-1.5">
            <Compass className="w-3.5 h-3.5 shrink-0" />
            <span>
              {hoveredPreset ? `Click to inspect: ${hoveredPreset.label}` : currentPreset.label}
            </span>
          </p>
          <p className="text-[11px] text-[#C4BBB2] line-clamp-1 mt-0.5">{currentPreset.caption}</p>
        </div>

        <button
          type="button"
          onClick={() => selectPreset('overview')}
          aria-label="Reset 3D camera view"
          className="pointer-events-auto min-w-[38px] min-h-[38px] px-2.5 rounded-xl bg-[#181411]/90 hover:bg-[#26201C] border border-white/15 text-white/90 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Reset</span>
        </button>
      </div>

      {/* Collapsible Bottom 3D Scene Dock (solid rgba background — zero backdrop-filter over WebGL) */}
      <div className="absolute bottom-3.5 left-3.5 right-3.5 flex flex-col items-center gap-2 pointer-events-none">
        {dockOpen ? (
          <div className="pointer-events-auto max-w-full rounded-2xl bg-[#171311]/92 border border-white/15 p-1.5 shadow-xl flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {CAMERA_PRESETS.map((preset) => {
              const isActive = activePreset === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => selectPreset(preset.id)}
                  className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'bg-[#FF9F43] text-[#171923]'
                      : 'text-[#D6CEC5] hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}

            <div className="w-px h-5 bg-white/15 shrink-0 mx-0.5" aria-hidden="true" />

            <button
              type="button"
              onClick={() => setAutoRotate((v) => !v)}
              aria-label={autoRotate ? 'Pause 3D orbit' : 'Resume 3D orbit'}
              className="min-h-[36px] px-2.5 py-1.5 rounded-xl text-xs font-semibold text-[#D6CEC5] hover:bg-white/10 hover:text-white inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              {autoRotate ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{autoRotate ? 'Spin' : 'Paused'}</span>
            </button>

            <button
              type="button"
              onClick={() => setDockOpen(false)}
              aria-label="Hide 3D controls"
              className="min-w-[34px] min-h-[36px] rounded-xl text-[#A89F96] hover:bg-white/10 hover:text-white inline-flex items-center justify-center shrink-0"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setDockOpen(true)}
            className="pointer-events-auto min-h-[36px] px-3.5 py-1.5 rounded-xl bg-[#171311]/92 border border-white/15 text-xs font-bold text-white inline-flex items-center gap-1.5 hover:bg-[#241E1B]"
          >
            <ChevronUp className="w-3.5 h-3.5 text-[#FF9F43]" />
            <span>3D Scenes ({currentPreset.label})</span>
          </button>
        )}
      </div>
    </div>
  );
}
