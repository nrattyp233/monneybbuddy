import React, { Suspense, useMemo, useRef } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { OrbitControls, useProgress, Html } from '@react-three/drei';
import * as THREE from 'three';
import { OBJLoader } from 'three-stdlib';

function Loader() {
  const { progress } = useProgress();
  return <Html center>{progress.toFixed(0)}% loaded</Html>;
}

function MascotModel() {
  const raw = useLoader(OBJLoader, '/base.obj');

  // Wrap model in a group so we can center/scale and animate
  const group = useRef<THREE.Group>(null!);

  // Prepare a centered, scaled clone with a visible material if needed
  const prepared = useMemo(() => {
    const obj = raw.clone(true);
    const palette = {
      suit: new THREE.Color('#111827'), // black suit
      tie: new THREE.Color('#dc2626'),
      shirt: new THREE.Color('#ffffff'),
    };
    const applyPaletteByName = (root: THREE.Object3D) => {
      root.traverse((child: any) => {
        if (!child.isMesh) return;
        const mesh = child as THREE.Mesh & { material: any };
        const name = (child.name || '').toLowerCase();
        const mat: THREE.MeshStandardMaterial = mesh.material instanceof THREE.MeshStandardMaterial
          ? mesh.material
          : new THREE.MeshStandardMaterial({ color: '#fbbf24', metalness: 0.2, roughness: 0.7 });
        const hasTexture = !!(mat as any).map;
        if (hasTexture) return;

        const setColor = (c: THREE.ColorRepresentation) => {
          mat.color = new THREE.Color(c);
          mesh.material = mat;
        };
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
      });
    };
    // Ensure meshes have a visible material
    obj.traverse((child: any) => {
      if (child.isMesh) {
        const mesh = child as THREE.Mesh;
        // If no material or not standard, apply a basic standard material
        if (!mesh.material) {
          mesh.material = new THREE.MeshStandardMaterial({ color: '#fbbf24', metalness: 0.2, roughness: 0.7 });
        }
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });

    // Apply coloring to set suit black if mesh names match
    applyPaletteByName(obj);

    // Center and scale to a target size
    const box = new THREE.Box3().setFromObject(obj);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    // Move the model so it is centered at origin
    obj.position.x += -center.x;
    obj.position.y += -center.y;
    obj.position.z += -center.z;

    // Compute a uniform scale so the largest dimension fits target
    const targetSize = 1.8; // world units
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const scale = targetSize / maxDim;
    obj.scale.setScalar(scale);

    return obj;
  }, [raw]);

  // Subtle rotation to show it's alive
  useFrame((_, delta) => {
    if (group.current) {
      group.current.rotation.y += delta * 0.3;
    }
  });

  return (
    <group ref={group}>
      <primitive object={prepared} />
    </group>
  );
}

const Mascot3DViewer: React.FC = () => (
  <div style={{ width: '100%', height: 320 }}>
    <Canvas camera={{ position: [0, 0.6, 3], fov: 45 }} shadows>
      <hemisphereLight args={[0xffffff, 0x222233, 0.8]} />
      <directionalLight position={[2, 3, 2]} intensity={0.9} castShadow />
      <Suspense fallback={<Loader />}>
        <MascotModel />
      </Suspense>
      <OrbitControls enablePan={false} enableZoom={false} autoRotate={false} />
    </Canvas>
  </div>
);

export default Mascot3DViewer;
