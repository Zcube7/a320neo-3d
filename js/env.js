// 环境：天空穹顶、太阳光与阴影、停机坪 / 跑道地面、空中云层、环境反射贴图。
import * as THREE from 'three';

const SUN = new THREE.Vector3(-0.42, 0.74, 0.52).normalize();

const SKY_FRAG = /* glsl */`
  uniform vec3 uSun; varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float h = clamp(d.y, -1.0, 1.0);
    vec3 zen = vec3(0.07, 0.25, 0.62), hor = vec3(0.60, 0.77, 0.95), gnd = vec3(0.46, 0.50, 0.54);
    vec3 c = mix(hor, zen, pow(max(h, 0.0), 0.42));
    c = mix(c, gnd, smoothstep(0.0, -0.08, h));
    float s = max(dot(d, uSun), 0.0);
    c += vec3(1.0, 0.86, 0.66) * (pow(s, 6.0) * 0.16 + pow(s, 90.0) * 0.55 + smoothstep(0.9993, 0.9997, s) * 9.0);
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
const SKY_VERT = /* glsl */`
  varying vec3 vDir;
  void main() { vDir = position; vec4 p = modelViewMatrix * vec4(position, 0.0); gl_Position = projectionMatrix * vec4(p.xyz, 1.0); gl_Position.z = gl_Position.w; }`;

function noiseCanvas(size, draw) {
  const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size); return c;
}

function apronTexture() {
  const cv = noiseCanvas(1024, (g, n) => {
    g.fillStyle = '#9a9b99'; g.fillRect(0, 0, n, n);
    for (let i = 0; i < 9000; i++) {
      const v = 120 + Math.random() * 60 | 0;
      g.fillStyle = `rgba(${v + 6},${v + 4},${v},${0.05 + Math.random() * 0.1})`;
      g.fillRect(Math.random() * n, Math.random() * n, 1 + Math.random() * 5, 1 + Math.random() * 5);
    }
    g.strokeStyle = 'rgba(52,56,60,0.75)'; g.lineWidth = 3;
    for (let i = 0; i <= 2; i++) { const p = i * n / 2; g.beginPath(); g.moveTo(p, 0); g.lineTo(p, n); g.moveTo(0, p); g.lineTo(n, p); g.stroke(); }
  });
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(60, 60); /* 15 m 一格、每格 2×2 块板 */ t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// 跑道：沿 X 方向 60 m 一个周期（中线虚线 30 m 实 + 30 m 空），宽 45 m
function runwayTexture() {
  const cv = noiseCanvas(1024, (g, n) => {
    g.fillStyle = '#6a6d70'; g.fillRect(0, 0, n, n);
    for (let i = 0; i < 12000; i++) {
      const v = 84 + Math.random() * 44 | 0;
      g.fillStyle = `rgba(${v},${v},${v + 2},${0.08 + Math.random() * 0.12})`;
      g.fillRect(Math.random() * n, Math.random() * n, 1 + Math.random() * 6, 1 + Math.random() * 3);
    }
    g.fillStyle = 'rgba(30,30,32,0.28)'; g.fillRect(0, n * 0.36, n, n * 0.1); g.fillRect(0, n * 0.54, n, n * 0.1);
    g.fillStyle = '#f4f5f5';
    g.fillRect(0, n * 0.5 - 5, n * 0.5, 10);          // 中线
    g.fillRect(0, n * 0.02, n, 10); g.fillRect(0, n * 0.98 - 10, n, 10);   // 边线
  });
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; t.repeat.set(40, 1); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

function cloudTexture() {
  const cv = noiseCanvas(1024, (g, n) => {
    g.fillStyle = 'rgba(255,255,255,0)'; g.clearRect(0, 0, n, n);
    for (let i = 0; i < 420; i++) {
      const x = Math.random() * n, y = Math.random() * n, r = 30 + Math.random() * 110;
      for (const [ox, oy] of [[0, 0], [n, 0], [-n, 0], [0, n], [0, -n]]) {
        const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        gr.addColorStop(0, 'rgba(255,255,255,0.20)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
    }
  });
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(5, 5); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildEnv(scene, renderer) {
  const skyMat = new THREE.ShaderMaterial({ uniforms: { uSun: { value: SUN } }, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, depthTest: false });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), skyMat);
  sky.frustumCulled = false; sky.renderOrder = -10;
  scene.add(sky);

  // 环境反射：把天空烘成 PMREM
  const envScene = new THREE.Scene();
  const envSky = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), skyMat.clone());
  envSky.material.depthTest = false;
  envScene.add(envSky);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(envScene, 0.02).texture;
  scene.environmentIntensity = 0.85;
  pmrem.dispose();

  const sun = new THREE.DirectionalLight(0xfff3e0, 2.7);
  sun.position.copy(SUN).multiplyScalar(80);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 20, far: 160 });
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.06;
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight(0xcfe2ff, 0x70757a, 0.35));

  // 地面：停机坪与跑道两套贴图
  const apron = apronTexture(), runway = runwayTexture();
  const groundMat = new THREE.MeshStandardMaterial({ map: apron, roughness: 0.95, metalness: 0 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  scene.add(ground);
  const rwMat = new THREE.MeshStandardMaterial({ map: runway, roughness: 0.92, metalness: 0 });
  const rw = new THREE.Mesh(new THREE.PlaneGeometry(2400, 45), rwMat);
  rw.rotation.x = -Math.PI / 2; rw.position.y = 0.01; rw.receiveShadow = true; rw.visible = false;
  scene.add(rw);
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x566b3e, roughness: 1 });
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), grassMat);
  grass.rotation.x = -Math.PI / 2; grass.position.y = -0.02; grass.receiveShadow = true; grass.visible = false;
  scene.add(grass);
  // 停机坪滑行引导线
  const line = new THREE.Mesh(new THREE.PlaneGeometry(400, 0.18), new THREE.MeshStandardMaterial({ color: 0xf2c200, roughness: 0.8 }));
  line.rotation.x = -Math.PI / 2; line.position.y = 0.012; line.receiveShadow = true;
  scene.add(line);

  // 空中：脚下的云层
  const cloudTex = cloudTexture();
  const clouds = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, depthWrite: false, opacity: 0.95, fog: true }));
  clouds.rotation.x = -Math.PI / 2; clouds.position.y = -420; clouds.visible = false;
  const haze = new THREE.Mesh(new THREE.PlaneGeometry(20000, 20000), new THREE.MeshBasicMaterial({ color: 0x9fbbd6 }));
  haze.rotation.x = -Math.PI / 2; haze.position.y = -900; haze.visible = false;
  scene.add(clouds, haze);
  scene.fog = new THREE.Fog(0xa9c6e6, 260, 1700);

  let mode = 'apron';
  return {
    sun, SUN,
    // mode: 'apron' | 'runway' | 'air'；speed 为地面/云层向后滚动的速度（m/s，视觉用）
    setMode(m) {
      mode = m;
      const air = m === 'air';
      ground.visible = m === 'apron'; line.visible = m === 'apron';
      rw.visible = grass.visible = m === 'runway';
      clouds.visible = haze.visible = air;
      scene.fog.near = air ? 900 : 220; scene.fog.far = air ? 7000 : 1500;
    },
    update(dt, speed) {
      if (mode === 'runway') runway.offset.x -= (speed * dt) / 60;
      if (mode === 'air') cloudTex.offset.x -= (speed * dt) / 1800;
    },
  };
}
