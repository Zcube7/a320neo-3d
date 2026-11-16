// 全机共用材质。带 skin 标记的是外蒙皮类材质，透视模式下整体变半透明。
import * as THREE from 'three';

export function makeMaterials() {
  const P = (o) => new THREE.MeshPhysicalMaterial(o);
  const S = (o) => new THREE.MeshStandardMaterial(o);
  const glow = (c, i = 0.9) => S({ color: c, emissive: c, emissiveIntensity: i, roughness: 0.5, metalness: 0.1 });
  const glass = (c, o) => S({ color: c, transparent: true, opacity: o, roughness: 0.25, metalness: 0, depthWrite: false, side: THREE.DoubleSide });

  const M = {
    // ---- 外蒙皮 ----
    paint: P({ color: 0xffffff, roughness: 0.36, clearcoat: 0.55, clearcoatRoughness: 0.22 }),
    paintGrey: P({ color: 0xc6ccd3, roughness: 0.44, clearcoat: 0.3, clearcoatRoughness: 0.4 }),
    panel: P({ color: 0xaeb5be, roughness: 0.5, clearcoat: 0.2, clearcoatRoughness: 0.5 }),
    paintBlue: P({ color: 0x12305e, roughness: 0.34, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
    paintBlue2: P({ color: 0x1d4b8f, roughness: 0.34, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
    nacelle: P({ color: 0xf0f2f4, roughness: 0.36, clearcoat: 0.55, clearcoatRoughness: 0.22, side: THREE.DoubleSide }),
    nacelleBlue: P({ color: 0x12305e, roughness: 0.34, clearcoat: 0.6, clearcoatRoughness: 0.2, side: THREE.DoubleSide }),
    alu: S({ color: 0xdfe3e8, metalness: 0.82, roughness: 0.3 }),
    lip: S({ color: 0xe9edf1, metalness: 0.95, roughness: 0.16, side: THREE.DoubleSide }),
    door: P({ color: 0xbfc5cc, roughness: 0.45, clearcoat: 0.3, side: THREE.DoubleSide }),
    liner: S({ color: 0x2b2f36, metalness: 0.55, roughness: 0.5, side: THREE.DoubleSide }),        // 短舱内壁、核心机匣
    coreCowl: S({ color: 0x8b929b, metalness: 0.75, roughness: 0.4, side: THREE.DoubleSide }),
    bay: S({ color: 0x101216, roughness: 0.85 }),                                                 // 轮舱口、扰流板凹槽的深色底

    // ---- 机械件 ----
    steel: S({ color: 0x9da3ab, metalness: 0.9, roughness: 0.34 }),
    chrome: S({ color: 0xf4f6f8, metalness: 1.0, roughness: 0.1 }),
    strut: S({ color: 0xe4e7ea, metalness: 0.35, roughness: 0.38 }),
    dark: S({ color: 0x2b2f36, metalness: 0.55, roughness: 0.5, side: THREE.DoubleSide }),
    black: S({ color: 0x101216, roughness: 0.85 }),
    rubber: S({ color: 0x17181a, roughness: 0.93 }),
    hub: S({ color: 0xcfd3d8, metalness: 0.8, roughness: 0.35 }),
    carbon: S({ color: 0x3a3d42, metalness: 0.3, roughness: 0.6 }),

    // ---- 发动机内部（由冷到热配色） ----
    fanBlade: S({ color: 0x30353d, metalness: 0.55, roughness: 0.36, side: THREE.DoubleSide }),
    spinner: S({ color: 0xe6e9ec, metalness: 0.5, roughness: 0.3 }),
    lpc: S({ color: 0x4f9de0, metalness: 0.6, roughness: 0.4, side: THREE.DoubleSide }),
    hpc: S({ color: 0x35c0b0, metalness: 0.6, roughness: 0.4, side: THREE.DoubleSide }),
    burner: S({ color: 0xff8a2a, emissive: 0xff5a10, emissiveIntensity: 0.6, roughness: 0.6, side: THREE.DoubleSide }),
    hpt: S({ color: 0xe04a3a, metalness: 0.6, roughness: 0.4, side: THREE.DoubleSide }),
    lpt: S({ color: 0xe0a23a, metalness: 0.6, roughness: 0.4, side: THREE.DoubleSide }),
    casing: S({ color: 0x8b929b, metalness: 0.75, roughness: 0.4, side: THREE.DoubleSide }),
    shaft: S({ color: 0xb9bec5, metalness: 0.9, roughness: 0.3 }),
    cascade: S({ color: 0x4a4f57, metalness: 0.7, roughness: 0.5, side: THREE.DoubleSide }),

    // ---- 机载系统（透视模式） ----
    structure: S({ color: 0x9fc2e8, metalness: 0.2, roughness: 0.6, transparent: true, opacity: 0.5, depthWrite: false }),
    floor: S({ color: 0x8792a0, roughness: 0.8, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }),
    seat: S({ color: 0x2f5fa8, roughness: 0.8 }),
    cargo: S({ color: 0xb9bdc3, metalness: 0.6, roughness: 0.5 }),
    fuel: glass(0xffb020, 0.42),
    fuel2: glass(0xff8a20, 0.42),
    fuelVent: glass(0xd9d2c0, 0.3),
    hydG: glow(0x2fd36b), hydB: glow(0x3a8dff), hydY: glow(0xffd21f),
    elec: glow(0xc77dff), bleed: glow(0xff7a3a, 0.7), cold: glow(0x7fd8ff, 0.7),
    box: S({ color: 0x4b5563, metalness: 0.5, roughness: 0.5 }),
    avionics: S({ color: 0x3b82c4, metalness: 0.4, roughness: 0.5 }),
    recorder: S({ color: 0xff6a00, roughness: 0.5 }),
    radar: S({ color: 0xd8dde3, metalness: 0.7, roughness: 0.35, side: THREE.DoubleSide }),
    apu: S({ color: 0xc08a4a, metalness: 0.75, roughness: 0.4 }),
    pack: S({ color: 0x66b8d8, metalness: 0.6, roughness: 0.45 }),
  };
  for (const k of ['paint', 'paintGrey', 'panel', 'paintBlue', 'paintBlue2', 'nacelle', 'nacelleBlue', 'alu', 'lip', 'door', 'liner', 'coreCowl', 'bay']) M[k].userData.skin = true;
  M.liner.userData.xray = 0.07; M.coreCowl.userData.xray = 0.1; M.bay.userData.xray = 0.04;
  return M;
}

// 透视模式：蒙皮材质整体变成半透明（材质是共享的，改一次全机生效）
export function setXray(M, on, opacity = 0.2) {
  for (const k in M) {
    const m = M[k];
    if (!m.userData.skin) continue;
    m.transparent = on; m.opacity = on ? (m.userData.xray || opacity) : 1; m.depthWrite = !on; m.needsUpdate = true;
  }
}
