import { CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { ARMarker } from "../interfaces/MindAR";
import DebugConsole from "./DebugConsole";
import * as THREE from "three";
import 'mind-ar/dist/mindar-image.prod';

interface ResolutionOption {
  label: string;
  width: number;
  height: number;
}

const resolutionOptions: ResolutionOption[] = [
  { label: "1280x720", width: 1280, height: 720 },
  { label: "1920x1080", width: 1920, height: 1080 },
  { label: "3840x2160", width: 3840, height: 2160 },
  { label: "default", width: window.innerWidth, height: window.innerHeight },
];

function MindAR() {
  // General app state
  const [arReady, setARReady] = useState(false);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>("");
  const [selectedResolution, setSelectedResolution] = useState<ResolutionOption>(resolutionOptions[1]);
  const [startAR, setStartAR] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  // ฟังก์ชันสำหรับเพิ่ม log
  const addLog = (message: string) => {
    setLogs(prev => [...prev, message]);
    console.log(message);
  };

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

  // Request permission and list cameras on mount (รวมเป็น useEffect เดียวกันเพื่อลดความซ้ำซ้อน)
  useEffect(() => {
    const setupCameras = async () => {
      try {
        // ขอสิทธิ์กล้องแบบ minimal
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        stream.getTracks().forEach(track => track.stop());
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        setCameras(videoDevices);
        if (videoDevices.length > 0) {
          setSelectedCameraId(videoDevices[0].deviceId);
          addLog(`Camera permission granted. Found ${videoDevices.length} cameras: ${videoDevices.map(v => v.label).join(", ")}`);
        }
      } catch (error) {
        addLog("Error requesting camera permission: " + (error instanceof Error ? error.message : "Unknown error"));
        console.error("Error requesting camera permission:", error);
      }
    };

    setupCameras();
  }, []);

  // เพิ่ม listener เพื่อ update renderer และ camera เมื่อหน้าจอถูก resize
  useEffect(() => {
    const handleResize = () => {
      if (rendererRef.current) {
        rendererRef.current.setSize(window.innerWidth, window.innerHeight);
      }
      if (cameraRef.current) {
        cameraRef.current.aspect = window.innerWidth / window.innerHeight;
        cameraRef.current.updateProjectionMatrix();
      }
      addLog(`Window resized: ${window.innerWidth}x${window.innerHeight}`);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  /**
   * Starts webcam using getUserMedia with selected camera and resolution.
   */
  const startVideo = async () => {
    const video = videoRef.current;
    if (!video) {
      addLog("Missing video DOM element");
      return;
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === "videoinput");
      // เลือกกล้องตามค่า selectedCameraId ถ้ามี; ถ้าไม่มีให้ใช้ตัวแรก
      const selectedCamera =
        videoDevices.find(device => device.deviceId === selectedCameraId) || videoDevices[0];
      if (!selectedCamera) {
        addLog("No video devices found");
        return;
      }
      addLog("Selected camera: " + (selectedCamera.label || selectedCamera.deviceId));

      try {
        // ใช้ constraints แบบ exact หากรองรับ
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            deviceId: { ideal: selectedCamera.deviceId },
            facingMode: { ideal: "environment" },
            width: { ideal: selectedResolution.width },
            height: { ideal: selectedResolution.height },
          }
        });
        video.srcObject = stream;
        addLog("Video stream started with exact constraints.");
      } catch (error) {
        if (error instanceof Error && error.name === "OverconstrainedError") {
          addLog("OverconstrainedError: Falling back to ideal constraints");
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              deviceId: { ideal: selectedCamera.deviceId },
              facingMode: { ideal: "environment" },
              width: { ideal: selectedResolution.width },
              height: { ideal: selectedResolution.height }
            }
          });
          video.srcObject = stream;
          addLog("Video stream started with ideal constraints fallback.");
        } else {
          addLog("Error starting video: " + (error instanceof Error ? error.message : "Unknown error"));
          console.error("Error starting video:", error);
        }
      }
      video.width = selectedResolution.width;
      video.height = selectedResolution.height;
      video.play();
    } catch (err) {
      addLog("Failed to start video stream.");
    }
  };

  // const startVideo = async () => {
  //   const video = videoRef.current;
  //   if (!video) {
  //     addLog("Missing video DOM element");
  //     return;
  //   }

  //   try {
  //     const devices = await navigator.mediaDevices.enumerateDevices();
  //     const videoDevices = devices.filter(device => device.kind === "videoinput");
  //     // เลือกกล้องตามค่า selectedCameraId ถ้ามี; ถ้าไม่มีให้ใช้ตัวแรก
  //     const selectedCamera =
  //       videoDevices.find(device => device.deviceId === selectedCameraId) || videoDevices[0];
  //     if (!selectedCamera) {
  //       addLog("No video devices found");
  //       return;
  //     }
  //     addLog("Selected camera: " + (selectedCamera.label || selectedCamera.deviceId));

  //     try {
  //       // ใช้ constraints แบบ exact หากรองรับ
  //       const stream = await navigator.mediaDevices.getUserMedia({
  //         audio: false,
  //         video: {
  //           deviceId: { ideal: selectedCamera.deviceId },
  //           facingMode: { ideal: "environment" },
  //         }
  //       });
  //       video.srcObject = stream;
  //       addLog("Video stream started with exact constraints.");
  //     } catch (error) {
  //       if (error instanceof Error && error.name === "OverconstrainedError") {
  //         addLog("OverconstrainedError: Falling back to ideal constraints");
  //         const stream = await navigator.mediaDevices.getUserMedia({
  //           audio: false,
  //           video: {
  //             deviceId: { ideal: selectedCamera.deviceId },
  //             facingMode: { ideal: "environment" },
  //             width: { ideal: selectedResolution.width },
  //             height: { ideal: selectedResolution.height }
  //           }
  //         });
  //         video.srcObject = stream;
  //         addLog("Video stream started with ideal constraints fallback.");
  //       } else {
  //         addLog("Error starting video: " + (error instanceof Error ? error.message : "Unknown error"));
  //         console.error("Error starting video:", error);
  //       }
  //     }

  //     video.width = window.innerWidth
  //      video.height = window.innerHeight
  //     video.play();
  //   } catch (err) {
  //     addLog("Failed to start video stream.");
  //   }
  // };

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
    addLog("Canvas and renderer started.");
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
    addLog("Marker initialized.");
  }, []);

  /**
   * Creates a 3D anchor using target image dimensions.
   */
  const setupMarker = (dimensions: [number, number]) => {
    const [width, height] = dimensions;
    const marker = markerRef.current as ARMarker;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3(width / 2, width / 2 + (height - width) / 2);
    const scale = new THREE.Vector3(width, width, width);
    const quaternion = new THREE.Quaternion();
    matrix.compose(position, quaternion, scale);
    marker.postMatrix = matrix;
    addLog("Marker setup with dimensions: " + dimensions.join("x"));
  };

  // Update your updateWorldMatrix function to include more debugging
  const updateWorldMatrix = (worldMatrixUpdate: number[] | null) => {
    const matrixFound = worldMatrixUpdate !== null;
    const marker = markerRef.current as ARMarker;
    const anchor = marker.anchor;

    if (matrixFound) {
      console.log("TARGET FOUND!", worldMatrixUpdate);
      addLog("Target Acquired: Rendering 3D model.");
    } else {
      console.log("Target lost");
      addLog("Target Lost: 3D model deactivated.");
    }

    // Ensure the anchor is in the scene
    if (!sceneRef.current?.children.includes(anchor)) {
      console.warn("Anchor not in scene!");
      if (sceneRef.current) sceneRef.current.add(anchor);
    }

    anchor.visible = matrixFound;

    if (matrixFound) {
      const postMatrix = marker.postMatrix;
      const updatedMatrix = new THREE.Matrix4();
      updatedMatrix.elements = worldMatrixUpdate as THREE.Matrix4Tuple;
      updatedMatrix.multiply(postMatrix);
      anchor.matrix = updatedMatrix;

      // Force an update if needed
      if (rendererRef.current) {
        rendererRef.current.render(sceneRef.current as THREE.Scene, cameraRef.current as THREE.PerspectiveCamera);
      }
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
          addLog(`Controller update: targetIndex ${targetIndex}`);
        }
      },
    });
    controllerRef.current = arController;
    addLog("Controller initialized.");
    return arController;
  };

  /**
   * Registers marker with controller and sets dimensions.
   */
  const registerMarker = async (arController: any) => {
    const marker = markerRef.current as ARMarker;
    const data = await arController.addImageTargets(marker.targetSrc);
    marker.setupMarker(data.dimensions[0]);
    addLog("Marker registered. Dimensions: " + data.dimensions[0].join("x"));
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
    addLog("Camera setup complete.");
  };

  // Update your composeScene function to create a more visible model
  const composeScene = () => {
    const scene = new THREE.Scene();
    const marker = markerRef.current as ARMarker;
    const anchor = marker.anchor;

    // Create a more visible cube
    const material = new THREE.MeshStandardMaterial({
      color: 0xff0000,  // Bright red
      emissive: 0x222222, // Slight emissive glow
      roughness: 0.5
    });
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const cube = new THREE.Mesh(geometry, material);

    // Make the cube larger
    cube.scale.set(0.5, 0.5, 0.5);

    // Add ambient light for better visibility
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);

    // Add directional light
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(1, 1, 1);

    // Add everything to the scene
    anchor.add(cube);
    scene.add(anchor);
    scene.add(light);
    scene.add(ambientLight);

    sceneRef.current = scene;
    addLog("Scene composed with enhanced cube and lighting.");
  };

  /**
   * Handler to start AR process.
   */

  useEffect(() => {
    const startAR = async () => {
      // Generic webcam and ThreeJS canvas init
      await startVideo()
      startCanvas()

      // MindAR init
      initMarker()
      const controller = initController()
      await registerMarker(controller)

      // ThreeJS Camera and Scene init
      setupCamera(controller)
      composeScene()

      // AR Controller needs to warm up gpu
      // Check MindAR source for more info
      // https://github.com/hiukim/mind-ar-js/blob/master/src/image-target/controller.js#L106-L112
      await controller.dummyRun(videoRef.current)

      // This triggers AR processing and scene render
      setARReady(true)
    }

    startAR()
  }, [initMarker])

  // Combine all initialization steps in a single handler
  const handleStartAR = async () => {
    addLog("Starting AR process...");

    try {
      // Step 1: Start video and canvas
      await startVideo();
      startCanvas();

      // Step 2: Initialize MindAR components
      initMarker();
      const controller = initController();
      await registerMarker(controller);

      // Step 3: Setup ThreeJS components
      setupCamera(controller);
      composeScene();

      // Step 4: Run dummy process for GPU warmup
      if (videoRef.current) {
        await controller.dummyRun(videoRef.current);

        // Step 5: Start animation and processing
        controllerRef.current.processVideo(videoRef.current);
        setARReady(true);

        // Add extra logging to verify marker detection is working
        addLog("AR is ready. Looking for markers...");
      } else {
        addLog("Error: Video element not found");
      }
    } catch (error) {
      addLog("Error initializing AR: " + (error instanceof Error ? error.message : "Unknown error"));
      console.error("Error initializing AR:", error);
    }
  };

  // Create a separate animation function that runs when arReady changes
  useEffect(() => {
    if (!arReady) return;

    addLog("Starting animation loop");

    const animateScene = () => {
      if (!rendererRef.current || !cameraRef.current || !sceneRef.current) {
        console.error("Missing ThreeJS components");
        return;
      }

      const renderer = rendererRef.current;
      const camera = cameraRef.current;
      const scene = sceneRef.current;

      // Add logging to check if animation loop is running
      console.log("Rendering frame");

      renderer.render(scene, camera);
      animationFrameRef.current = window.requestAnimationFrame(animateScene);
    };

    animateScene();

    // Cleanup function
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      // Stop video streams
      if (videoRef.current && videoRef.current.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
        tracks.forEach(track => track.stop());
      }

      // Cleanup controller if needed
      if (controllerRef.current) {
        // Add controller cleanup if the library provides one
      }
    };
  }, [arReady]);

  const appStyle: CSSProperties = {
    width: "100vw",
    height: "100vh",
    overflow: "hidden",
    position: "relative",
  };

  const arVideoStyle: CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  };

  const arCanvasStyle: CSSProperties = {
    width: "100%",
    height: "100%",
    position: "absolute",
    top: "0",
    left: "0",
  };

  // Update your UI to include a debug option to verify marker detection
  return (
    <div style={appStyle}>
      {!startAR && (
        <div
          style={{
            position: "absolute",
            zIndex: 10,
            background: "rgba(0,0,0,0.5)",
            padding: "1rem",
          }}
        >
          {/* Camera and resolution selectors */}
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
                  const [w, h] = e.target.value.split("x").map(Number);
                  const found = resolutionOptions.find(
                    (res) => res.width === w && res.height === h
                  );
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
          <button
            onClick={() => {
              setStartAR(true);
              handleStartAR();
            }}
          >
            Start AR
          </button>
        </div>
      )}

      {/* Add a status indicator */}
      {startAR && !arReady && (
        <div style={{
          position: "absolute",
          top: "10px",
          left: "10px",
          background: "rgba(0,0,0,0.7)",
          color: "white",
          padding: "5px",
          zIndex: 15
        }}>
          Initializing AR...
        </div>
      )}

      {startAR && arReady && (
        <div style={{
          position: "absolute",
          top: "10px",
          left: "10px",
          background: "rgba(0,0,0,0.7)",
          color: "white",
          padding: "5px",
          zIndex: 15
        }}>
          AR Ready - Point camera at marker
        </div>
      )}

      <video ref={videoRef} style={arVideoStyle} />
      <canvas ref={canvasRef} style={arCanvasStyle} />
      <DebugConsole logs={logs} />
    </div>
  );
}

export default MindAR;
