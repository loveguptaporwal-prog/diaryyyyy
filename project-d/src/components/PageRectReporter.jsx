import React, { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useOverlay } from '../store/overlayStore.js';

export default function PageRectReporter({ meshRef, side, visible = true }) {
  const setRect = useOverlay((s) => s.setRect);

  const corners = useMemo(() => {
    return [new THREE.Vector3(), new THREE.Vector3()];
  }, []);

  useFrame(({ camera, size }) => {
    if (!visible || !meshRef.current) return;
    const m = meshRef.current;
    m.updateWorldMatrix(true, false);

    // Three.js page dimensions: width 3.05, height 4.22
    const minX = side === 'right' ? 0 : -3.05;
    const maxX = side === 'right' ? 3.05 : 0;
    const topY = 4.22 / 2;
    const bottomY = -4.22 / 2;
    const frontZ = 0.022;

    corners[0].set(minX, topY, frontZ).applyMatrix4(m.matrixWorld).project(camera);
    corners[1].set(maxX, bottomY, frontZ).applyMatrix4(m.matrixWorld).project(camera);

    const x1 = ((corners[0].x + 1) / 2) * size.width;
    const y1 = ((1 - corners[0].y) / 2) * size.height;
    const x2 = ((corners[1].x + 1) / 2) * size.width;
    const y2 = ((1 - corners[1].y) / 2) * size.height;

    const r = {
      left: Math.round(Math.min(x1, x2)),
      top: Math.round(Math.min(y1, y2)),
      width: Math.round(Math.abs(x2 - x1)),
      height: Math.round(Math.abs(y2 - y1)),
    };

    if (r.width > 20 && r.height > 20) {
      setRect(side, r);
    }
  });

  return null;
}
