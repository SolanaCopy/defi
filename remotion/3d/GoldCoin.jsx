import React, { useRef, useMemo } from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from 'remotion';
import { useFrame } from '@react-three/fiber';
import { MeshTransmissionMaterial, Float, Environment, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';

// ===== GOLD COIN 3D =====
export const GoldCoin = ({ rotationSpeed = 0.01, floatIntensity = 0.3, scale = 1 }) => {
  const meshRef = useRef();
  const frame = useCurrentFrame();

  const goldMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: new THREE.Color('#D4A843'),
    metalness: 0.95,
    roughness: 0.15,
    emissive: new THREE.Color('#9A7B2E'),
    emissiveIntensity: 0.2,
  }), []);

  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.rotation.y += rotationSpeed;
    }
  });

  return (
    <Float speed={1.5} rotationIntensity={0.2} floatIntensity={floatIntensity}>
      <group ref={meshRef} scale={scale}>
        {/* Main coin body */}
        <mesh material={goldMaterial}>
          <cylinderGeometry args={[1.5, 1.5, 0.2, 64]} />
        </mesh>
        {/* Rim */}
        <mesh material={goldMaterial} position={[0, 0, 0]}>
          <torusGeometry args={[1.5, 0.06, 16, 64]} />
        </mesh>
        {/* Inner rim */}
        <mesh material={goldMaterial}>
          <torusGeometry args={[1.1, 0.03, 16, 64]} />
        </mesh>
        {/* Center dot */}
        <mesh material={goldMaterial} position={[0, 0.11, 0]}>
          <cylinderGeometry args={[0.3, 0.3, 0.02, 32]} />
        </mesh>
      </group>
    </Float>
  );
};

// ===== GOLD BARS =====
export const GoldBar = ({ position = [0, 0, 0], rotation = [0, 0, 0], scale = 1 }) => {
  const goldMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: new THREE.Color('#D4A843'),
    metalness: 0.9,
    roughness: 0.2,
    emissive: new THREE.Color('#9A7B2E'),
    emissiveIntensity: 0.15,
  }), []);

  return (
    <mesh material={goldMaterial} position={position} rotation={rotation} scale={scale}>
      <boxGeometry args={[2.5, 0.6, 1.2]} />
    </mesh>
  );
};

// ===== GOLD PARTICLE FIELD =====
export const GoldParticles = ({ count = 200, spread = 10 }) => {
  const pointsRef = useRef();
  const frame = useCurrentFrame();

  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * spread;
      pos[i * 3 + 1] = (Math.random() - 0.5) * spread;
      pos[i * 3 + 2] = (Math.random() - 0.5) * spread;
    }
    return pos;
  }, [count, spread]);

  const sizes = useMemo(() => {
    const s = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      s[i] = Math.random() * 0.04 + 0.01;
    }
    return s;
  }, [count]);

  useFrame(() => {
    if (pointsRef.current) {
      pointsRef.current.rotation.y += 0.001;
      pointsRef.current.rotation.x += 0.0005;
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial size={0.03} color="#D4A843" transparent opacity={0.6} sizeAttenuation />
    </points>
  );
};

// ===== RISING CHART 3D =====
export const Chart3D = ({ data = [30, 45, 35, 60, 55, 75, 65, 85, 90, 95], barWidth = 0.3, spacing = 0.15 }) => {
  const frame = useCurrentFrame();

  const goldMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: new THREE.Color('#D4A843'),
    metalness: 0.8,
    roughness: 0.3,
    emissive: new THREE.Color('#9A7B2E'),
    emissiveIntensity: 0.1,
  }), []);

  const greenMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: new THREE.Color('#34D399'),
    metalness: 0.7,
    roughness: 0.3,
    emissive: new THREE.Color('#059669'),
    emissiveIntensity: 0.15,
  }), []);

  const totalWidth = data.length * (barWidth + spacing);

  return (
    <group position={[-totalWidth / 2, -1.5, 0]}>
      {data.map((val, i) => {
        const height = (val / 100) * 3;
        const animatedHeight = interpolate(frame, [i * 4, i * 4 + 20], [0, height], {
          extrapolateRight: 'clamp',
          easing: Easing.out(Easing.back(1.2)),
        });
        const isGreen = i > 0 && data[i] > data[i - 1];

        return (
          <mesh
            key={i}
            material={isGreen ? greenMaterial : goldMaterial}
            position={[i * (barWidth + spacing), animatedHeight / 2, 0]}
          >
            <boxGeometry args={[barWidth, animatedHeight || 0.01, barWidth]} />
          </mesh>
        );
      })}
    </group>
  );
};

// ===== LIGHTING SETUP =====
export const GoldLighting = () => (
  <>
    <ambientLight intensity={0.3} />
    <directionalLight position={[5, 8, 5]} intensity={1.2} color="#FFF5E0" castShadow />
    <directionalLight position={[-3, 4, -5]} intensity={0.4} color="#D4A843" />
    <pointLight position={[0, 3, 0]} intensity={0.5} color="#F0D078" />
    <spotLight position={[0, 10, 0]} angle={0.3} penumbra={0.8} intensity={0.6} color="#D4A843" />
  </>
);
