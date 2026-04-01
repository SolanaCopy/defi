import React, { Suspense } from 'react';
import { ThreeCanvas } from '@remotion/three';
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from 'remotion';
import { GoldCoin, GoldBar, GoldParticles, Chart3D, GoldLighting } from './GoldCoin.jsx';

const ease = Easing.out(Easing.cubic);

// ===== HERO 3D SCENE — Rotating gold coin + particles =====
export const HeroCoinScene = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const cameraZ = interpolate(frame, [0, 60], [8, 5], { extrapolateRight: 'clamp', easing: ease });
  const cameraY = interpolate(frame, [0, 60], [3, 1.5], { extrapolateRight: 'clamp', easing: ease });

  return (
    <ThreeCanvas
      width={width}
      height={height}
      camera={{ position: [0, cameraY, cameraZ], fov: 45 }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <Suspense fallback={null}>
        <GoldLighting />
        <GoldCoin rotationSpeed={0.02} floatIntensity={0.4} scale={1.2} />
        <GoldParticles count={300} spread={15} />
        <fog attach="fog" args={['#020304', 5, 20]} />
      </Suspense>
    </ThreeCanvas>
  );
};

// ===== GOLD BARS STACK — For stats scene =====
export const GoldBarsScene = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const cameraX = interpolate(frame, [0, 150], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <ThreeCanvas
      width={width}
      height={height}
      camera={{ position: [3 + cameraX, 2.5, 4], fov: 40 }}
      style={{ position: 'absolute', inset: 0, opacity: 0.35 }}
    >
      <Suspense fallback={null}>
        <GoldLighting />
        <GoldBar position={[0, 0, 0]} rotation={[0, 0.3, 0]} scale={0.8} />
        <GoldBar position={[0.5, 0.5, -0.3]} rotation={[0, -0.2, 0]} scale={0.8} />
        <GoldBar position={[-0.3, 1, 0.1]} rotation={[0, 0.5, 0]} scale={0.8} />
        <GoldParticles count={100} spread={8} />
        <fog attach="fog" args={['#020304', 3, 15]} />
      </Suspense>
    </ThreeCanvas>
  );
};

// ===== 3D CHART — For performance scene =====
export const ChartScene = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const cameraRotY = interpolate(frame, [0, 150], [0.5, -0.3], { extrapolateRight: 'clamp' });

  return (
    <ThreeCanvas
      width={width}
      height={height}
      camera={{ position: [2, 2, 5], fov: 40 }}
      style={{ position: 'absolute', inset: 0, opacity: 0.4 }}
    >
      <Suspense fallback={null}>
        <GoldLighting />
        <group rotation={[0, cameraRotY, 0]}>
          <Chart3D />
        </group>
        <GoldParticles count={80} spread={10} />
        <fog attach="fog" args={['#020304', 4, 18]} />
      </Suspense>
    </ThreeCanvas>
  );
};

// ===== PARTICLE ONLY — Subtle background =====
export const ParticleBackground = ({ opacity = 0.3, count = 200 }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  return (
    <ThreeCanvas
      width={width}
      height={height}
      camera={{ position: [0, 0, 6], fov: 50 }}
      style={{ position: 'absolute', inset: 0, opacity }}
    >
      <Suspense fallback={null}>
        <ambientLight intensity={0.5} />
        <GoldParticles count={count} spread={12} />
        <fog attach="fog" args={['#020304', 3, 15]} />
      </Suspense>
    </ThreeCanvas>
  );
};
