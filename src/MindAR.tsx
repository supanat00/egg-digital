// MindARComponent.tsx
import React, { useEffect, useRef } from 'react';
import {
  Scene,
  Assets,
  AssetItem,
  Camera,
  Entity,
  Plane,
  GLTFModel,
} from "aframe-react";
import 'aframe';
import 'mind-ar/dist/mindar-image-aframe.prod.js';

// ประกาศ interface สำหรับ A-Frame scene element ที่มี property 'systems'
export interface AFrameSceneElement extends HTMLElement {
  systems: {
    [key: string]: any;
  };
}

const MindARComponent: React.FC = () => {
  // กำหนด ref ให้กับ Scene โดยใช้ AFrameSceneElement
  const sceneRef = useRef<AFrameSceneElement | null>(null);

  useEffect(() => {
    const sceneEl = sceneRef.current;
    if (!sceneEl) return;

    // เข้าถึงระบบ AR จาก MindAR ผ่าน systems
    const arSystem = sceneEl.systems["mindar-image-system"];

    // กำหนด event listener เพื่อเริ่ม AR เมื่อ scene เริ่ม render
    const onRenderStart = () => {
      if (arSystem && typeof arSystem.start === 'function') {
        arSystem.start();
      }
    };
    sceneEl.addEventListener("renderstart", onRenderStart);

    // Cleanup เมื่อ component ถูก unmount
    return () => {
      sceneEl.removeEventListener("renderstart", onRenderStart);
      if (arSystem && typeof arSystem.stop === 'function') {
        arSystem.stop();
      }
    };
  }, []);

  return (
    <Scene
      ref={sceneRef as any} // ใช้ type assertion เพื่อให้ TS ยอมรับ ref กับ custom element
      mindar-image="imageTargetSrc: https://cdn.jsdelivr.net/gh/hiukim/mind-ar-js@1.2.0/examples/image-tracking/assets/card-example/card.mind; autoStart: false; uiLoading: no; uiError: no; uiScanning: no;"
      color-space="sRGB"
      embedded
      renderer="colorManagement: true, physicallyCorrectLights"
      vr-mode-ui="enabled: false"
      device-orientation-permission-ui="enabled: false"
    >
      <Assets>
        <img
          id="card"
          src="https://cdn.jsdelivr.net/gh/hiukim/mind-ar-js@1.2.0/examples/image-tracking/assets/card-example/card.png"
        />
        <AssetItem
          id="avatarModel"
          src="https://cdn.jsdelivr.net/gh/hiukim/mind-ar-js@1.2.0/examples/image-tracking/assets/card-example/softmind/scene.gltf"
        />
      </Assets>

      <Camera position="0 0 0" look-controls="enabled: false" />

      <Entity mindar-image-target="targetIndex: 0">
        <Plane
          src="#card"
          position="0 0 0"
          height="0.552"
          width="1"
          rotation="0 0 0"
        />
        <GLTFModel
          rotation="0 0 0"
          position="0 0 0.1"
          scale="0.005 0.005 0.005"
          src="#avatarModel"
          animation="property: position; to: 0 0.1 0.1; dur: 1000; easing: easeInOutQuad; loop: true; dir: alternate"
        />
      </Entity>
    </Scene>
  );
};

export default MindARComponent;
