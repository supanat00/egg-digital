import { CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { ARMarker } from "../interfaces/MindAR";
import * as THREE from "three";
import 'mind-ar/dist/mindar-image.prod';

// Global declaration สำหรับ window.MINDAR
declare global {
  interface Window {
    MINDAR: any;
  }
}

interface ResolutionOption {
  label: string;
  width: number;
  height: number;
}

const resolutionOptions: ResolutionOption[] = [
  { label: "1280x720", width: 1280, height: 720 },
  { label: "1920x1080", width: 1920, height: 1080 },
  { label: "3840x2160", width: 3840, height: 2160 },
];

function MindAR() {
  // General app state
  const [arReady, setARReady] = useState(false);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>("");
  const [selectedResolution, setSelectedResolution] = useState<ResolutionOption>(resolutionOptions[1]); // Default 1920x1080
  const [startAR, setStartAR] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);

  // ThreeJS refs
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  // MindAR refs
  const markerRef = useRef<ARMarker | null>(null);
  const controllerRef = useRef<any>(null);

  useEffect(() => {
    const requestPermissionAndListCameras = async () => {
      try {
        // ขอสิทธิ์กล้องแบบ minimal
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        // ปิด stream ทันทีเพื่อไม่ให้เปิดกล้องตลอด
        stream.getTracks().forEach(track => track.stop());
        // จากนั้น enumerate devices
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        setCameras(videoDevices);
        if (videoDevices.length > 0) {
          setSelectedCameraId(videoDevices[0].deviceId);
        }
      } catch (error) {
        console.error("Error requesting camera permission:", error);
      }
    };

    requestPermissionAndListCameras();
  }, []);


  // ดึงรายชื่อกล้องเมื่อ component mount
  useEffect(() => {
    const listCameras = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        setCameras(videoDevices);
        if (videoDevices.length > 0) {
          setSelectedCameraId(videoDevices[0].deviceId);
        }
      } catch (error) {
        console.error("Error listing cameras:", error);
      }
    };
    listCameras();
  }, []);

  /**
   * Starts webcam using getUserMedia with selected camera and resolution.
   * ใช้ selectedCameraId และ selectedResolution จาก UI
   */
  const startVideo = async () => {
    const video = videoRef.current;
    if (!video) {
      console.error("Missing video DOM element");
      return;
    }

    // ดึงรายชื่ออุปกรณ์วิดีโอทั้งหมด
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(device => device.kind === "videoinput");

    // เลือกกล้องตามค่า selectedCameraId ถ้ามี; ถ้าไม่มีให้ใช้ตัวแรก
    const selectedCamera =
      videoDevices.find(device => device.deviceId === selectedCameraId) || videoDevices[0];

    if (!selectedCamera) {
      console.error("No video devices found");
      return;
    }

    // ใช้ selectedResolution จาก state (ที่ผู้ใช้เลือก)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          deviceId: { exact: selectedCamera.deviceId },
          facingMode: { ideal: "environment" },
          width: { exact: selectedResolution.width },
          height: { exact: selectedResolution.height }
        }
      });
      video.srcObject = stream;
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === "OverconstrainedError") {
          console.warn("OverconstrainedError: Falling back to ideal constraints");
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              deviceId: { exact: selectedCamera.deviceId },
              facingMode: { ideal: "environment" },
              width: { ideal: selectedResolution.width },
              height: { ideal: selectedResolution.height }
            }
          });
          video.srcObject = stream;
        } else {
          console.error("Error starting video:", error.message);
        }
      } else {
        console.error("Unknown error starting video");
      }
    }

    video.width = selectedResolution.width;
    video.height = selectedResolution.height;
    video.play();
  };

  /**
   * Starts canvas and renderer for ThreeJS.
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
   * Initializes a single MindAR marker.
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
      updateWorldMatrix,
    };
  }, []);

  /**
   * Creates a 3D anchor using target image dimensions.
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
   * Updates the world matrix of the marker.
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
   * Creates a new AR Controller for MindAR.
   */
  const initController = () => {
    const arController = new window.MINDAR.IMAGE.Controller({
      inputWidth: window.innerWidth,
      inputHeight: window.innerHeight,
      onUpdate: (data: { type: string; targetIndex: number; worldMatrix: number[] }) => {
        if (data.type === 'updateMatrix') {
          const { targetIndex, worldMatrix } = data;
          let candidate = markerRef.current as ARMarker;
          if (candidate.targetIndex === targetIndex) {
            candidate.updateWorldMatrix(worldMatrix);
          }
        }
      },
    });
    controllerRef.current = arController;
    return arController;
  };

  /**
   * Registers marker with controller and sets dimensions.
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
   * Creates a new ThreeJS scene, adds objects, and sets scene ref.
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

  /**
   * Handler to start AR process.
   */
  const handleStartAR = async () => {
    await startVideo();
    startCanvas();
    initMarker();
    const controller = initController();
    await registerMarker(controller);
    setupCamera(controller);
    composeScene();
    await controller.dummyRun(videoRef.current!);
    setARReady(true);
  };

  useEffect(() => {
    if (arReady) {
      const animateScene = () => {
        const renderer = rendererRef.current as THREE.WebGLRenderer;
        const camera = cameraRef.current as THREE.PerspectiveCamera;
        const scene = sceneRef.current as THREE.Scene;
        renderer.render(scene, camera);
        animationFrameRef.current = window.requestAnimationFrame(animateScene);
      };

      controllerRef.current.processVideo(videoRef.current!);
      animateScene();
    }
  }, [arReady]);

  // CSS styles: Container covers full viewport; canvas is full-screen overlay.
  const appStyle: CSSProperties = {
    width: '100vw',
    height: '100vh',
    overflow: 'hidden',
    position: 'relative',
  };

  const arVideoStyle: CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
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
      {!startAR && (
        <div style={{ position: 'absolute', zIndex: 10, background: 'rgba(0,0,0,0.5)', padding: '1rem' }}>
          <div>
            <label>
              Camera:&nbsp;
              <select
                value={selectedCameraId}
                onChange={(e) => setSelectedCameraId(e.target.value)}
              >
                {cameras.map((cam, index) => (
                  <option key={index} value={cam.deviceId}>
                    {cam.label || `Camera ${index + 1}`}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div>
            <label>
              Resolution:&nbsp;
              <select
                value={`${selectedResolution.width}x${selectedResolution.height}`}
                onChange={(e) => {
                  const [w, h] = e.target.value.split('x').map(Number);
                  const found = resolutionOptions.find(res => res.width === w && res.height === h);
                  if (found) setSelectedResolution(found);
                }}
              >
                {resolutionOptions.map((res, index) => (
                  <option key={index} value={`${res.width}x${res.height}`}>
                    {res.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button onClick={() => { setStartAR(true); handleStartAR(); }}>Start AR</button>
        </div>
      )}
      <video ref={videoRef} style={arVideoStyle} />
      <canvas ref={canvasRef} style={arCanvasStyle} />
    </div>
  );
}

export default MindAR;
