import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OBJLoader, MTLLoader, GLTFLoader } from 'three-stdlib';

const Mascot3DCanvas: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

  const width = containerRef.current.clientWidth;
  const height = 360;
    const scene = new THREE.Scene();
    scene.background = null; // transparent

  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
  camera.position.set(0, 0.7, 3.2);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
  // Ensure correct color space for PBR textures
  // @ts-ignore - support different three versions
  if (renderer.outputColorSpace !== undefined) (renderer as any).outputColorSpace = THREE.SRGBColorSpace;
  // @ts-ignore
  if (renderer.outputEncoding !== undefined) (renderer as any).outputEncoding = THREE.sRGBEncoding;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

  const hemi = new THREE.HemisphereLight(0xffffff, 0x222233, 0.9);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 0.9);
  dir.position.set(2, 3, 2);
  dir.castShadow = true;
  scene.add(dir);

    // Holder controls overall motion (swing + land), group holds the model
  const holder = new THREE.Group();
    scene.add(holder);
    const group = new THREE.Group();
    holder.add(group);

    // Ground plane for soft shadow when landing
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 6),
      new THREE.ShadowMaterial({ opacity: 0.25 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.06;
    ground.receiveShadow = true;
    scene.add(ground);

    let animId = 0;
    // GLB animation mixer (if the model has clips)
    let mixer: THREE.AnimationMixer | null = null;
    // Procedural bones fallback
    const bones: Record<string, THREE.Bone[]> = {
      spine: [], head: [], armL: [], armR: [], legL: [], legR: []
    };
    let hasSkeleton = false;

    // Simple rope from ceiling to mascot for swinging effect
    const ropeMat = new THREE.LineBasicMaterial({ color: 0x6b4f2a });
    const ropeGeom = new THREE.BufferGeometry();
    const rope = new THREE.Line(ropeGeom, ropeMat);
    scene.add(rope);
    const anchor = new THREE.Vector3(-3.2, 3.6, 0);
  // Prepare loaders and helpers
  const textureLoader = new THREE.TextureLoader();
  const matcap = textureLoader.load('/monkey.png');
  // @ts-ignore - support three versions with color space/encoding
  if ((matcap as any).colorSpace !== undefined) (matcap as any).colorSpace = THREE.SRGBColorSpace;
  // @ts-ignore
  if ((matcap as any).encoding !== undefined) (matcap as any).encoding = THREE.sRGBEncoding;
  const matcapMaterial = new THREE.MeshMatcapMaterial({ matcap, color: 0xffffff });

    const applyCommonTweaks = (obj: THREE.Object3D, mode: 'glb' | 'obj' = 'obj') => {
      obj.traverse((child: any) => {
        if (child.isMesh) {
          const mesh = child as THREE.Mesh;
          // For GLB: keep existing materials/textures; only ensure shadows
          // For OBJ: apply MatCap if missing material
          if (mode === 'obj') {
            if (!mesh.material) mesh.material = matcapMaterial;
            if (mesh.material && !(mesh.material as any).matcap) {
              mesh.material = matcapMaterial;
            }
          }
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        }
      });

      // Center and scale to fit
      const box = new THREE.Box3().setFromObject(obj);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);
      obj.position.sub(center);
      const target = 1.6;
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const scale = target / maxDim;
      obj.scale.setScalar(scale);
    };

    // Palette to match monkey.png (tweak as needed)
    const palette = {
      furLight: new THREE.Color('#f8c388'),
      furDark: new THREE.Color('#8b5e3c'),
      innerEar: new THREE.Color('#f6a5a5'),
      suit: new THREE.Color('#111827'),
      tie: new THREE.Color('#dc2626'),
      shirt: new THREE.Color('#ffffff'),
      pin: new THREE.Color('#fbbf24'),
      eyeWhite: new THREE.Color('#ffffff'),
      pupil: new THREE.Color('#222222'),
      mouth: new THREE.Color('#a34b3a')
    } as const;

    const applyPaletteByName = (root: THREE.Object3D) => {
      root.traverse((child: any) => {
        if (!child.isMesh) return;
        const mesh = child as THREE.Mesh & { material: any };
        const name = (child.name || '').toLowerCase();
        const mat: THREE.MeshStandardMaterial = mesh.material instanceof THREE.MeshStandardMaterial
          ? mesh.material
          : new THREE.MeshStandardMaterial({ color: 0xffffff });
        const hasTexture = !!(mat as any).map;
        if (hasTexture) return; // keep embedded textures if present

        const setColor = (c: THREE.ColorRepresentation) => {
          mat.color = new THREE.Color(c);
          mesh.material = mat;
        };

        // Suit/outerwear (make black)
        if (
          name.includes('suit') ||
          name.includes('jacket') ||
          name.includes('coat') ||
          name.includes('blazer') ||
          name.includes('sleeve') ||
          name.includes('pant') ||
          name.includes('trouser') ||
          (mesh.material?.name && String(mesh.material.name).toLowerCase().includes('suit'))
        ) setColor(palette.suit);
        else if (name.includes('tie')) setColor(palette.tie);
        else if (name.includes('shirt')) setColor(palette.shirt);
        else if (name.includes('pin') || name.includes('badge')) setColor(palette.pin);
        else if (name.includes('eye') && !name.includes('brow')) setColor(palette.eyeWhite);
        else if (name.includes('pupil')) setColor(palette.pupil);
        else if (name.includes('ear')) setColor(palette.innerEar);
        else if (name.includes('mouth') || name.includes('tongue') || name.includes('lip')) setColor(palette.mouth);
        else if (name.includes('hair') || name.includes('brow') || name.includes('top')) setColor(palette.furDark);
        else if (name.includes('face') || name.includes('head') || name.includes('body') || name.includes('hand')) setColor(palette.furLight);
      });
    };

    // Try GLB first (with embedded textures), then MTL+OBJ, then OBJ+MatCap
    const tryLoadGLB = () => new Promise<THREE.Object3D>((resolve, reject) => {
      const gltfLoader = new GLTFLoader();
      gltfLoader.load(
        '/base.glb',
        (gltf) => {
          const root = gltf.scene || (gltf as any).scenes?.[0];
          if (!root) return reject(new Error('GLB has no scene'));
          // Ensure texture color spaces are sRGB
          root.traverse((child: any) => {
            if (child.isMesh && child.material) {
              const mat = child.material as any;
              // Standardize material to MeshStandardMaterial
              if (!(mat instanceof THREE.MeshStandardMaterial)) {
                child.material = new THREE.MeshStandardMaterial({ color: mat.color || 0xffffff });
              }
              const material = child.material as THREE.MeshStandardMaterial & { map?: any };
              if (material.map) {
                // @ts-ignore
                if (material.map.colorSpace !== undefined) material.map.colorSpace = THREE.SRGBColorSpace;
                // @ts-ignore
                if (material.map.encoding !== undefined) material.map.encoding = THREE.sRGBEncoding;
                material.map.needsUpdate = true;
              }
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });
          // Apply brand palette by mesh names if no textures
          applyPaletteByName(root);

          // If GLB has animations, set up mixer
          // @ts-ignore
          const clips: THREE.AnimationClip[] = (gltf as any).animations || [];
          if (clips.length) {
            mixer = new THREE.AnimationMixer(root);
            const action = mixer.clipAction(clips[0]);
            action.reset().setLoop(THREE.LoopRepeat, Infinity).play();
          } else {
            // Collect bones by name for procedural animation
            root.traverse((obj: any) => {
              if (obj.isSkinnedMesh && obj.skeleton) {
                hasSkeleton = true;
                const list = obj.skeleton.bones as THREE.Bone[];
                list.forEach((b) => {
                  const n = (b.name || '').toLowerCase();
                  if (n.includes('spine') || n.includes('chest')) bones.spine.push(b);
                  else if (n.includes('head')) bones.head.push(b);
                  else if ((n.includes('arm') || n.includes('shoulder')) && (n.includes('l') || n.includes('left'))) bones.armL.push(b);
                  else if ((n.includes('arm') || n.includes('shoulder')) && (n.includes('r') || n.includes('right'))) bones.armR.push(b);
                  else if ((n.includes('leg') || n.includes('thigh')) && (n.includes('l') || n.includes('left'))) bones.legL.push(b);
                  else if ((n.includes('leg') || n.includes('thigh')) && (n.includes('r') || n.includes('right'))) bones.legR.push(b);
                });
              }
            });
          }
          resolve(root);
        },
        undefined,
        (e) => reject(e)
      );
    });

    // Try to load materials if an MTL file exists; otherwise fallback to OBJ
    const tryLoadWithMTL = () => new Promise<THREE.Object3D>((resolve) => {
      const mtl = new MTLLoader();
      mtl.load(
        '/base.mtl',
        (materials) => {
          materials.preload();
          const objLoader = new OBJLoader();
          objLoader.setMaterials(materials);
          objLoader.load('/base.obj', (obj) => resolve(obj));
        },
        undefined,
        () => {
          const objLoader = new OBJLoader();
          objLoader.load('/base.obj', (obj) => resolve(obj));
        }
      );
    });

    tryLoadGLB()
      .then((obj) => {
        applyCommonTweaks(obj, 'glb');
        group.add(obj);
      })
      .catch(() => {
        tryLoadWithMTL().then((obj) => {
          // If no materials, fallback to matcap inside tweaks
          applyCommonTweaks(obj);
          // Apply brand palette (forces suit black if mesh names match)
          applyPaletteByName(obj);
          group.add(obj);
        }).catch((err) => {
          // eslint-disable-next-line no-console
          console.error('Failed to load model', err);
        });
      });

    const onResize = () => {
      if (!containerRef.current || !rendererRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = height;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

  const clock = new THREE.Clock();

    // Swing-in bezier path from left-top into center above fields
    const P0 = new THREE.Vector3(-3.2, 2.6, 0);
    const C = new THREE.Vector3(-1.2, 3.2, 0);
    const P1 = new THREE.Vector3(0, 0.1, 0);

    const lerp2 = (a: THREE.Vector3, b: THREE.Vector3, t: number) => new THREE.Vector3(
      a.x + (b.x - a.x) * t,
      a.y + (b.y - a.y) * t,
      a.z + (b.z - a.z) * t
    );
    const quadBezier = (t: number) => {
      const ab = lerp2(P0, C, t);
      const bc = lerp2(C, P1, t);
      return lerp2(ab, bc, t);
    };

    const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
    const easeOutBounce = (x: number) => {
      const n1 = 7.5625, d1 = 2.75;
      if (x < 1 / d1) return n1 * x * x;
      else if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
      else if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
      return n1 * (x -= 2.625 / d1) * x + 0.984375;
    };

  holder.position.copy(P0);
    holder.rotation.z = -0.6;

    let phase: 'intro' | 'settle' | 'idle' = 'intro';
    let introTime = 0;
    let settleTime = 0;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      const dt = Math.min(0.033, clock.getDelta());

      if (phase === 'intro') {
        introTime += dt;
        const d = 1.4; // seconds
        const t = Math.min(1, introTime / d);
        const te = easeOutCubic(t);
        const p = quadBezier(te);
        holder.position.copy(p);
        holder.rotation.z = -0.6 * (1 - te);
        if (t >= 1) {
          phase = 'settle';
          settleTime = 0;
        }
      } else if (phase === 'settle') {
        settleTime += dt;
        const d = 0.8;
        const t = Math.min(1, settleTime / d);
        const bounce = 1 + 0.08 * (1 - easeOutBounce(t));
        holder.scale.setScalar(bounce);
        holder.rotation.z = 0.05 * Math.cos(t * Math.PI * 2) * (1 - t);
        if (t >= 1) {
          holder.scale.setScalar(1);
          holder.rotation.z = 0;
          phase = 'idle';
        }
      } else {
        // idle: gentle float
        const time = clock.elapsedTime;
        holder.position.y = 0.1 + Math.sin(time * 1.2) * 0.02;
      }


      // Update rope endpoints (anchor to above the model)
      const top = holder.position.clone().add(new THREE.Vector3(0, 0.8, 0));
      const pos = new Float32Array([
        anchor.x, anchor.y, anchor.z,
        top.x, top.y, top.z,
      ]);
      ropeGeom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      ropeGeom.computeBoundingSphere();

      // Drive GLB built-in animations
      if (mixer) mixer.update(dt);

      // Procedural limb motion if no clips
      if (!mixer && hasSkeleton) {
        const t = clock.elapsedTime;
        const sway = Math.sin(t * 2.4) * 0.35;
        bones.armL.forEach((b) => { b.rotation.z = -0.8 + sway; });
        bones.armR.forEach((b) => { b.rotation.z = 0.8 + sway; });
        bones.legL.forEach((b) => { b.rotation.x = 0.4 - sway * 0.6; });
        bones.legR.forEach((b) => { b.rotation.x = -0.4 - sway * 0.6; });
        bones.spine.forEach((b, i) => { b.rotation.y = Math.sin(t * 1.5 + i * 0.3) * 0.1; });
        bones.head.forEach((b) => { b.rotation.y = Math.sin(t * 0.8) * 0.15; b.rotation.x = Math.sin(t * 0.6) * 0.08; });
      }
      // subtle model turn
      group.rotation.y += dt * 0.25;
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', onResize);
      if (rendererRef.current) {
        rendererRef.current.dispose();
      }
  matcap.dispose();
      ropeGeom.dispose();
      ropeMat.dispose();
  matcapMaterial.dispose();
      if (containerRef.current && renderer.domElement.parentElement === containerRef.current) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={containerRef} style={{ width: '100%', height: 360 }} />;
};

export default Mascot3DCanvas;
