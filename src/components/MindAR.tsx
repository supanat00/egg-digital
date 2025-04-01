import { CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { ARMarker } from "../interfaces/MindAR";

import * as THREE from "three";
import 'mind-ar/dist/mindar-image.prod';

// General global declaration สำหรับ window.MINDAR (หากยังไม่ได้ประกาศในไฟล์ declaration อื่น)
declare global {
  interface Window {
    MINDAR: any;
  }
}

function MindAR() {
  // General app state
  const [arReady, setARReady] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);

  // ThreeJS
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  // MindAR 
  const markerRef = useRef<ARMarker | null>(null);
  const controllerRef = useRef<any>(null);

  /**
   * Starts webcam via navigator.mediaDevices API with automatic camera and resolution selection.
   */
  const startVideo = async () => {
    const video = videoRef.current;
    if (!video) {
      console.error("Missing video DOM element");
      return;
    }

    // เรียกดูรายชื่ออุปกรณ์วิดีโอ
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(device => device.kind === "videoinput");

    // เลือกกล้องที่มี label "back" ถ้ามี หรือเลือกตัวแรก
    const selectedCamera = videoDevices.find(device =>
      device.label.toLowerCase().includes("back")
    ) || videoDevices[0];

    // กำหนดรายการ resolution ที่มีให้เลือก
    const resolutions = [
      { width: 1280, height: 720 },
      { width: 1920, height: 1080 },
      { width: 3840, height: 2160 }
    ];

    // อ่านขนาดหน้าจอปัจจุบัน
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;

    // เลือก resolution ที่ใกล้เคียงกับขนาดหน้าจอมากที่สุด
    let selectedRes = resolutions[0];
    let minDiff = Number.MAX_VALUE;
    resolutions.forEach((res) => {
      const diff = Math.abs(screenWidth - res.width) + Math.abs(screenHeight - res.height);
      if (diff < minDiff) {
        minDiff = diff;
        selectedRes = res;
      }
    });

    // สร้าง constraints สำหรับ getUserMedia โดยใช้ deviceId และ resolution ที่เลือก
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        deviceId: { exact: selectedCamera.deviceId },
        facingMode: { ideal: "environment" },
        width: { exact: selectedRes.width },
        height: { exact: selectedRes.height }
      }
    });

    video.srcObject = stream;
    video.width = selectedRes.width;
    video.height = selectedRes.height;
    video.play();
  };

  /**
   * Starts canvas and renderer for ThreeJS
   */
  const startCanvas = () => {
    const canvas = canvasRef.current as HTMLCanvasElement;
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true
    });

    renderer.setClearColor(0x000000, 0);
    renderer.setSize(window.innerWidth, window.innerHeight);

    rendererRef.current = renderer;
  };

  /**
   * Initializes a single MindAR marker and sets it to a mutable ref.
   */
  const initMarker = useCallback(() => {
    const postMatrix = new THREE.Matrix4();

    const anchor = new THREE.Object3D();
    anchor.visible = false;
    anchor.matrixAutoUpdate = false;

    markerRef.current = {
      postMatrix,
      anchor,
      targetIndex: 0,
      targetSrc: './data/targets.mind',
      setupMarker,
      updateWorldMatrix
    };
  }, []);

  /**
   * Creates a 3d anchor using ThreeJS in the center of a target image.
   */
  const setupMarker = (dimensions: [number, number]) => {
    const [width, height] = dimensions;
    const marker = markerRef.current as ARMarker;
    const matrix = new THREE.Matrix4();

    const position = new THREE.Vector3(
      width / 2,
      width / 2 + (height - width) / 2
    );

    const scale = new THREE.Vector3(width, width, width);
    const quaternion = new THREE.Quaternion();

    matrix.compose(position, quaternion, scale);

    marker.postMatrix = matrix;
  };

  /**
   * Updates the world matrix of a marker in a ThreeJS scene.
   */
  const updateWorldMatrix = (worldMatrixUpdate: number[] | null) => {
    const matrixFound = worldMatrixUpdate !== null;
    const marker = markerRef.current as ARMarker;
    const anchor = marker.anchor;

    if (anchor.visible && matrixFound) {
      console.log('Target Found');
    } else if (anchor.visible && !matrixFound) {
      console.log('Target Lost');
    }

    anchor.visible = matrixFound;

    if (matrixFound) {
      const postMatrix = marker.postMatrix;
      const updatedMatrix = new THREE.Matrix4();
      updatedMatrix.elements = worldMatrixUpdate as THREE.Matrix4Tuple;
      updatedMatrix.multiply(postMatrix);
      anchor.matrix = updatedMatrix;
    }
  };

  /**
   * Creates a new AR Controller for MindAR and sets mutable ref.
   */
  const initController = () => {
    const arController = new window.MINDAR.IMAGE.Controller({
      inputWidth: window.innerWidth,
      inputHeight: window.innerHeight,
      onUpdate: (data: {
        type: string,
        targetIndex: number,
        worldMatrix: number[]
      }) => {
        if (data.type === 'updateMatrix') {
          const { targetIndex, worldMatrix } = data;
          let candidate = markerRef.current as ARMarker;
          if (candidate.targetIndex === targetIndex) {
            candidate.updateWorldMatrix(worldMatrix);
          }
        }
      }
    });

    controllerRef.current = arController;
    return arController;
  };

  /**
   * Registers marker with controller then sets marker dimensions.
   */
  const registerMarker = async (arController: any) => {
    const marker = markerRef.current as ARMarker;
    const data = await arController.addImageTargets(marker.targetSrc);
    marker.setupMarker(data.dimensions[0]);
  };

  /**
   * Creates a new ThreeJS camera.
   */
  const setupCamera = (arController: any) => {
    const camera = new THREE.PerspectiveCamera();
    const proj = arController.getProjectionMatrix();

    camera.fov = 2 * Math.atan(1 / proj[5]) * 180 / Math.PI;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.near = proj[14] / (proj[10] - 1.0);
    camera.far = proj[14] / (proj[10] + 1.0);
    camera.updateProjectionMatrix();

    cameraRef.current = camera;
  };

  /**
   * Creates a new ThreeJS Scene, adds a cube, lighting and AR marker anchor.
   */
  const composeScene = () => {
    const scene = new THREE.Scene();
    const marker = markerRef.current as ARMarker;
    const anchor = marker.anchor;

    const material = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const cube = new THREE.Mesh(geometry, material);

    const light = new THREE.DirectionalLight(0xff0000, 0.5);
    light.rotation.x = Math.PI / 2;
    light.position.set(1, 1, 1);

    anchor.add(cube);
    scene.add(anchor, light);

    sceneRef.current = scene;
  };

  useEffect(() => {
    const startAR = async () => {
      // Generic webcam and ThreeJS canvas init
      await startVideo();
      startCanvas();

      // MindAR init
      initMarker();
      const controller = initController();
      await registerMarker(controller);

      // ThreeJS Camera and Scene init
      setupCamera(controller);
      composeScene();

      // AR Controller needs to warm up GPU (dummyRun)
      await controller.dummyRun(videoRef.current!);

      // This triggers AR processing and scene render
      setARReady(true);
    };

    startAR();
  }, [initMarker]);

  useEffect(() => {
    if (arReady) {
      const animateScene = () => {
        const renderer = rendererRef.current as THREE.WebGLRenderer;
        const camera = cameraRef.current as THREE.PerspectiveCamera;
        const scene = sceneRef.current as THREE.Scene;

        renderer.render(scene, camera);
        animationFrameRef.current = window.requestAnimationFrame(() => {
          animateScene();
        });
      };

      controllerRef.current.processVideo(videoRef.current!);
      animateScene();
    }
  }, [arReady]);

  // CSS styles
  const appStyle: CSSProperties = {
    width: '100vw',
    height: '100vh',
    overflow: 'hidden',
    position: 'relative'
  };

  const arVideoStyle: CSSProperties = {
    maxWidth: '100%',
  };

  const arCanvasStyle: CSSProperties = {
    width: '100%',
    height: '100%',
    position: 'absolute',
    top: '0',
    left: '0',
  };

  return (
    <div style={appStyle}>
      <video ref={videoRef} style={arVideoStyle} />
      <canvas ref={canvasRef} style={arCanvasStyle} />
    </div>
  );
}

export default MindAR;
