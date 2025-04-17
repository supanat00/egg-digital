import { CSSProperties, useCallback, useEffect, useRef, useState } from "react";
// Removed conflicting import: import { ARMarker } from "../interfaces/MindAR";
// Removed conflicting import: import DebugConsole from "./DebugConsole";
import * as THREE from "three";
// Ensure MindAR library is loaded (attaches to window.MINDAR)
import 'mind-ar/dist/mindar-image.prod';

// --- Local Type Definitions (Used instead of imports) ---

// Namespaced ARMarker interface to avoid global conflicts
namespace MindARInterfaces {
  export interface ARMarker {
    postMatrix: THREE.Matrix4;
    anchor: THREE.Object3D;
    targetIndex: number;
    targetSrc: string;
    setupMarker: (dimensions: [number, number]) => void;
    updateWorldMatrix: (worldMatrix: number[] | null) => void;
  }
}
// Make the namespaced type available locally
type ARMarker = MindARInterfaces.ARMarker;

// Local DebugConsole component definition
const DebugConsole: React.FC<{ logs: string[] }> = ({ logs }) => {
  const consoleStyle: CSSProperties = {
    position: 'absolute',
    bottom: '10px',
    left: '10px',
    width: 'calc(100% - 30px)', // Adjust width as needed
    maxHeight: '50px', // Limit height
    overflowY: 'auto',
    background: 'rgba(0, 0, 0, 0.7)',
    color: '#0f0', // Green text
    fontFamily: 'monospace',
    fontSize: '10px',
    padding: '5px',
    zIndex: 20,
    border: '1px solid #555',
    borderRadius: '3px',
    opacity: 0.8,
  };
  const logStyle: CSSProperties = {
    margin: 0,
    padding: 0,
    whiteSpace: 'nowrap',
  };

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Scroll to top when new logs arrive
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [logs]);

  return (
    <div style={consoleStyle} ref={scrollRef}>
      {logs.map((log, index) => (
        // Use a more stable key if logs can be rearranged, but index is fine for append-only
        <p key={index} style={logStyle}>{`[${logs.length - 1 - index}] ${log}`}</p> // Show newest first
      ))}
    </div>
  );
};


// --- Global Augmentation for window.MINDAR ---
// This tells TypeScript that window.MINDAR exists and is of type 'any'
// You could create more specific types if needed.
declare global {
  interface Window {
    MINDAR: any; // Define MINDAR on window
  }
}

// --- Resolution Options ---
interface ResolutionOption {
  label: string;
  width: number;
  height: number;
}

const resolutionOptions: ResolutionOption[] = [
  { label: "Default (Fit Screen)", width: 0, height: 0 },
  { label: "640x480", width: 640, height: 480 },
  { label: "1280x720", width: 1280, height: 720 },
  { label: "1920x1080", width: 1920, height: 1080 },
];

// --- MindAR Component ---
function MindAR() {
  // General app state
  const [arReady, setARReady] = useState(false);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>("");
  const [selectedResolution, setSelectedResolution] = useState<ResolutionOption>(resolutionOptions[0]);
  const [startAR, setStartAR] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  // Logging function
  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [`${timestamp}: ${message}`, ...prev].slice(0, 100));
    console.log(`[MindAR Log] ${message}`);
  }, []);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const markerRef = useRef<ARMarker | null>(null);
  const controllerRef = useRef<any>(null); // Consider creating a MindARController interface

  // Request permission and list cameras on mount
  useEffect(() => {
    const setupCameras = async () => {
      addLog("Requesting camera permission...");
      try {
        // Request permission first
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        stream.getTracks().forEach(track => track.stop()); // Stop stream immediately after getting permission
        addLog("Camera permission granted.");

        // Enumerate devices
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        setCameras(videoDevices);

        if (videoDevices.length > 0) {
          // Try to find a rear camera first
          const rearCamera = videoDevices.find(device => /back|rear|environment/i.test(device.label));
          const defaultCameraId = rearCamera ? rearCamera.deviceId : videoDevices[0].deviceId;
          setSelectedCameraId(defaultCameraId);
          addLog(`Found ${videoDevices.length} cameras. Default: ${videoDevices.find(v => v.deviceId === defaultCameraId)?.label || `Camera ${defaultCameraId.substring(0, 6)}...`}`);
        } else {
          addLog("No video devices found.");
          alert("No video devices found. Please ensure you have a camera and grant permission.");
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        addLog(`Error requesting camera permission: ${errorMessage}`);
        console.error("Error requesting camera permission:", error);
        alert(`Error accessing camera: ${errorMessage}. Please check browser permissions.`);
      }
    };

    setupCameras();
  }, [addLog]); // Add addLog to dependency array

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (!rendererRef.current || !cameraRef.current) return;

      const width = window.innerWidth;
      const height = window.innerHeight;

      rendererRef.current.setSize(width, height);
      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix(); // Update projection matrix after aspect change

      addLog(`Window resized: ${width}x${height}. Renderer and camera updated.`);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [addLog]); // Add addLog to dependency array

  // Start webcam stream
  const startVideo = async (): Promise<boolean> => {
    const video = videoRef.current;
    if (!video) {
      addLog("Error: Video element not found.");
      return false;
    }
    if (!selectedCameraId) {
      addLog("Error: No camera selected.");
      return false;
    }

    addLog(`Attempting to start video with Camera ID: ${selectedCameraId.substring(0, 6)}...`);
    const mediaDevices = navigator.mediaDevices;

    const constraints: MediaStreamConstraints = {
      audio: false,
      video: {
        deviceId: { exact: selectedCameraId },
        // facingMode: 'environment', // Let deviceId handle selection primarily
      }
    };

    const useSpecificResolution = selectedResolution.width > 0 && selectedResolution.height > 0;
    if (useSpecificResolution && typeof constraints.video === 'object') {
      constraints.video.width = { ideal: selectedResolution.width };
      constraints.video.height = { ideal: selectedResolution.height };
      addLog(`Requesting resolution (ideal): ${selectedResolution.width}x${selectedResolution.height}`);
    } else {
      addLog("Requesting default resolution (letting browser/device decide).");
    }

    // Stop any existing stream before starting a new one
    if (video.srcObject) {
      addLog("Stopping existing video stream...");
      (video.srcObject as MediaStream).getTracks().forEach(track => track.stop());
      video.srcObject = null;
    }

    try {
      const stream = await mediaDevices.getUserMedia(constraints);
      video.srcObject = stream;

      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => {
          const actualWidth = video.videoWidth;
          const actualHeight = video.videoHeight;
          addLog(`Video metadata loaded. Actual resolution: ${actualWidth}x${actualHeight}`);
          resolve();
        };
        video.onerror = (e) => {
          addLog(`Video error event: ${e}`);
          reject(new Error("Video element error"));
        }
      });

      await video.play();
      addLog(`Video playing (Res: ${video.videoWidth}x${video.videoHeight}).`);
      return true;

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      addLog(`Error starting video stream: ${errorMsg}`);
      console.error("getUserMedia error:", error);

      // Retry logic ONLY if a specific resolution failed
      if (useSpecificResolution && typeof constraints.video === 'object') {
        addLog("Retrying with default resolution...");
        delete constraints.video.width;
        delete constraints.video.height;
        try {
          const stream = await mediaDevices.getUserMedia(constraints);
          video.srcObject = stream;
          await new Promise<void>((resolve) => { video.onloadedmetadata = () => resolve(); });
          await video.play();
          addLog(`Video playing with default resolution after retry (Res: ${video.videoWidth}x${video.videoHeight}).`);
          return true;
        } catch (retryError) {
          const retryErrorMsg = retryError instanceof Error ? retryError.message : String(retryError);
          addLog(`Error starting video stream (retry): ${retryErrorMsg}`);
          console.error("getUserMedia retry error:", retryError);
          alert(`Failed to start camera${useSpecificResolution ? ' with selected resolution' : ''}. Please check permissions or try a different camera/resolution. Error: ${retryErrorMsg}`);
          return false;
        }
      }
      alert(`Failed to start camera. Please check permissions or try a different camera/resolution. Error: ${errorMsg}`);
      return false;
    }
  };


  // Initialize ThreeJS canvas and renderer
  const startCanvas = () => {
    addLog("Initializing ThreeJS Canvas and Renderer...");
    const canvas = canvasRef.current;
    if (!canvas) {
      addLog("Error: Canvas element not found.");
      return false;
    }

    try {
      const renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true, // Transparent background
        antialias: true,
        preserveDrawingBuffer: false, // Can improve performance if not needed
      });
      renderer.setPixelRatio(window.devicePixelRatio); // Better quality on high DPI screens
      renderer.setSize(window.innerWidth, window.innerHeight); // Match display size
      renderer.outputColorSpace = THREE.SRGBColorSpace; // Correct color space
      rendererRef.current = renderer;
      addLog("ThreeJS Renderer initialized.");
      return true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      addLog(`Error initializing WebGL Renderer: ${errorMsg}`);
      console.error("WebGL Renderer Error:", error);
      alert(`Failed to initialize WebGL: ${errorMsg}. Your browser/device might not support it.`);
      return false;
    }
  };

  // Memoized marker setup functions
  const setupMarker = useCallback((dimensions: [number, number]) => {
    if (!markerRef.current) return;
    const [width, height] = dimensions; // These are dimensions from the .mind file
    const marker = markerRef.current;
    const matrix = new THREE.Matrix4();

    // Example: Center a plane matching the marker's aspect ratio
    // Adjust position and scale based on your 3D model and marker image
    const position = new THREE.Vector3(0, 0, 0); // Center on the marker
    const scale = new THREE.Vector3(width, height, Math.min(width, height)); // Scale relative to marker dimensions
    const quaternion = new THREE.Quaternion();
    // Example: Rotate if your marker image's "up" isn't the same as the world's "up"
    // quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

    matrix.compose(position, quaternion, scale);
    marker.postMatrix = matrix; // This matrix transforms from marker space to your desired anchor space
    addLog(`Marker setup with dimensions: ${width.toFixed(3)}x${height.toFixed(3)}`);
  }, [addLog]); // addLog dependency

  const updateWorldMatrix = useCallback((worldMatrixUpdate: number[] | null) => {
    if (!markerRef.current) return;
    const matrixFound = worldMatrixUpdate !== null;
    const marker = markerRef.current;
    const anchor = marker.anchor;

    if (anchor.visible !== matrixFound) {
      addLog(`Target ${matrixFound ? 'Found' : 'Lost'}`);
    }
    anchor.visible = matrixFound;

    if (matrixFound && worldMatrixUpdate) {
      const postMatrix = marker.postMatrix; // Your custom offset/scale matrix
      const updatedMatrix = new THREE.Matrix4();
      updatedMatrix.fromArray(worldMatrixUpdate); // World matrix from MindAR

      // Apply postMatrix: worldMatrix * postMatrix
      // This means the anchor represents the origin defined by postMatrix,
      // positioned and oriented according to the detected marker.
      updatedMatrix.multiply(postMatrix);

      anchor.matrix.copy(updatedMatrix); // Update the anchor's matrix
    }
  }, [addLog]); // addLog dependency

  // Initialize the marker structure
  const initMarker = useCallback(() => {
    addLog("Initializing AR Marker structure...");
    const postMatrix = new THREE.Matrix4(); // Identity initially
    const anchor = new THREE.Object3D();
    anchor.visible = false;
    anchor.matrixAutoUpdate = false; // Crucial: MindAR controls the matrix

    markerRef.current = {
      postMatrix,
      anchor,
      targetIndex: 0, // Assuming the first target in targets.mind
      targetSrc: './data/targets.mind', // Verify this path is correct relative to public folder
      setupMarker,
      updateWorldMatrix,
    };
    addLog("Marker structure initialized.");
  }, [addLog, setupMarker, updateWorldMatrix]); // Dependencies

  // Initialize MindAR Controller
  const initController = () => {
    addLog("Initializing MindAR Controller...");
    const video = videoRef.current;
    if (!video || video.readyState < video.HAVE_METADATA) { // Check if video metadata is loaded
      addLog("Error: Video element not ready (no metadata) for Controller init.");
      return null;
    }

    let inputWidth: number;
    let inputHeight: number;

    if (selectedResolution.width > 0 && selectedResolution.height > 0) {
      // Prefer the selected resolution if set
      inputWidth = selectedResolution.width;
      inputHeight = selectedResolution.height;
      addLog(`MindAR Controller using specified resolution hint: ${inputWidth}x${inputHeight}`);
    } else {
      // Fallback to actual video dimensions if available, otherwise screen dimensions
      inputWidth = video.videoWidth || window.innerWidth;
      inputHeight = video.videoHeight || window.innerHeight;
      addLog(`MindAR Controller using detected/fallback resolution: ${inputWidth}x${inputHeight}`);
    }

    try {
      const arController = new window.MINDAR.IMAGE.Controller({
        inputWidth,
        inputHeight,
        maxTrack: 1, // Track only one marker
        // warmupTolerance: 5, // Optional: Adjust if needed
        // missTolerance: 5,   // Optional: Adjust if needed
        filterMinCF: 0.001, // Optional: Filtering parameters
        filterBeta: 10,     // Optional: Filtering parameters
        onUpdate: (data: any) => { // Consider typing 'data' more strictly
          if (data.type === 'updateMatrix' && markerRef.current) {
            const { targetIndex, worldMatrix } = data;
            if (markerRef.current.targetIndex === targetIndex) {
              markerRef.current.updateWorldMatrix(worldMatrix);
            }
          }
        }
      });
      controllerRef.current = arController;
      addLog("MindAR Controller initialized successfully.");
      return arController;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      addLog(`Error initializing MindAR Controller: ${errorMsg}`);
      console.error("MindAR Controller Init Error:", error);
      alert(`Failed to initialize MindAR: ${errorMsg}`);
      return null;
    }
  };

  // Register marker with the controller
  const registerMarker = async (arController: any) => {
    addLog("Registering AR marker with controller...");
    if (!markerRef.current || !arController) {
      addLog("Error: Marker or Controller not initialized for registration.");
      return false;
    }
    const marker = markerRef.current;

    try {
      // addImageTargets returns a promise containing target info including dimensions
      const targetData = await arController.addImageTargets(marker.targetSrc);
      if (!targetData || !targetData.dimensions || !Array.isArray(targetData.dimensions[marker.targetIndex])) {
        addLog(`Error: Invalid data returned from addImageTargets for target index ${marker.targetIndex}. Check targets.mind file and path.`);
        return false;
      }
      // Setup marker using dimensions from the loaded target
      marker.setupMarker(targetData.dimensions[marker.targetIndex]);
      addLog(`Marker registered successfully from ${marker.targetSrc}`);
      return true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      addLog(`Error registering marker (${marker.targetSrc}): ${errorMsg}`);
      console.error("Error loading image targets:", error);
      alert(`Failed to load AR marker from ${marker.targetSrc}. Please ensure the file exists and is accessible. Error: ${errorMsg}`);
      return false;
    }
  };

  // Setup ThreeJS camera using MindAR's projection matrix
  const setupCamera = (arController: any) => {
    addLog("Setting up ThreeJS Camera...");
    if (!arController) {
      addLog("Error: AR Controller not available for camera setup.");
      return false;
    }

    const camera = new THREE.PerspectiveCamera();
    try {
      const projMatrix = arController.getProjectionMatrix();
      camera.projectionMatrix.fromArray(projMatrix);
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();

      // Set aspect ratio based on *display* size for correct rendering *onto the canvas*
      camera.aspect = window.innerWidth / window.innerHeight;
      // camera.updateProjectionMatrix(); // Call this AFTER setting aspect ratio if not using direct matrix setting, but since we set projectionMatrix directly, it might not be strictly needed unless aspect changes later without re-running setupCamera. Redundant here.

      cameraRef.current = camera;
      addLog("ThreeJS Camera setup complete using MindAR projection matrix.");
      return true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      addLog(`Error setting up camera projection: ${errorMsg}`);
      console.error("Camera Setup Error:", error);
      alert(`Failed to setup AR camera: ${errorMsg}`);
      return false;
    }
  };

  // Compose the ThreeJS scene with marker anchor and 3D content
  const composeScene = () => {
    addLog("Composing ThreeJS Scene...");
    if (!markerRef.current) {
      addLog("Error: Marker not ready for scene composition.");
      return false;
    }

    const scene = new THREE.Scene();
    const anchor = markerRef.current.anchor; // The Object3D linked to the marker

    // --- Add 3D Model ---
    const geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5); // Size relative to marker scale (set in setupMarker)
    const material = new THREE.MeshStandardMaterial({
      color: 0xff0000, // Red
      metalness: 0.3,
      roughness: 0.6,
    });
    const cube = new THREE.Mesh(geometry, material);
    cube.position.set(0, 0.25, 0); // Position the cube slightly above the marker center (Y-up)
    anchor.add(cube); // Add the cube to the anchor
    addLog("Added red cube model to the anchor.");

    // --- Add Lighting ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 3, 2); // Position light relative to the world/camera
    scene.add(directionalLight);
    addLog("Added ambient and directional lights.");

    scene.add(anchor); // Add the marker's anchor to the scene
    sceneRef.current = scene;
    addLog("ThreeJS Scene composed successfully.");
    return true;
  };

  // --- Main AR Start Handler ---
  const handleStartAR = async () => {
    setARReady(false); // Reset AR state
    setStartAR(true);  // Indicate AR process is starting
    addLog("--- AR START PROCESS INITIATED ---");

    // 1. Start Video
    const videoStarted = await startVideo();
    if (!videoStarted || !videoRef.current) {
      addLog("AR ABORTED: Failed to start video.");
      setStartAR(false);
      return;
    }

    // 2. Start Canvas & Renderer
    const canvasStarted = startCanvas();
    if (!canvasStarted) {
      addLog("AR ABORTED: Failed to start canvas/renderer.");
      setStartAR(false);
      // Stop video if it was started
      (videoRef.current?.srcObject as MediaStream)?.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
      return;
    }

    // 3. Initialize Marker Structure
    initMarker(); // This is synchronous
    if (!markerRef.current) {
      addLog("AR ABORTED: Failed to initialize marker structure.");
      setStartAR(false);
      (videoRef.current?.srcObject as MediaStream)?.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
      return;
    }

    // 4. Initialize MindAR Controller (Requires video metadata)
    const controller = initController();
    if (!controller) {
      addLog("AR ABORTED: Failed to initialize MindAR Controller.");
      setStartAR(false);
      (videoRef.current?.srcObject as MediaStream)?.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
      return;
    }

    // 5. Register Marker with Controller (Asynchronous)
    const markerRegistered = await registerMarker(controller);
    if (!markerRegistered) {
      addLog("AR ABORTED: Failed to register marker.");
      setStartAR(false);
      (videoRef.current?.srcObject as MediaStream)?.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
      return;
    }

    // 6. Setup ThreeJS Camera (Requires controller)
    const cameraSetup = setupCamera(controller);
    if (!cameraSetup) {
      addLog("AR ABORTED: Failed to setup camera.");
      setStartAR(false);
      (videoRef.current?.srcObject as MediaStream)?.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
      return;
    }

    // 7. Compose ThreeJS Scene (Requires marker anchor)
    const sceneComposed = composeScene();
    if (!sceneComposed) {
      addLog("AR ABORTED: Failed to compose scene.");
      setStartAR(false);
      (videoRef.current?.srcObject as MediaStream)?.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
      return;
    }

    // // 8. Optional MindAR Warmup (dummyRun) - Can sometimes help stabilize initial tracking
    // try {
    //   addLog("Running MindAR warmup (dummyRun)...");
    //   await controller.dummyRun(videoRef.current);
    //   addLog("MindAR warmup complete.");
    // } catch (e) {
    //   addLog(`MindAR dummyRun failed (continuing anyway): ${e instanceof Error ? e.message : String(e)}`);
    // }

    // 9. AR is Ready! Trigger animation loop.
    addLog("--- AR INITIALIZATION COMPLETE ---");
    setARReady(true); // This will trigger the animation loop useEffect
  };


  // --- Animation Loop Effect ---
  useEffect(() => {
    if (!arReady) {
      // Stop animation if AR is not ready
      if (animationFrameRef.current) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
        addLog("Animation loop stopped (AR not ready).");
      }
      return; // Exit effect
    }

    // Check for essential components
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    const scene = sceneRef.current;
    const arController = controllerRef.current;
    const video = videoRef.current;

    if (!renderer || !camera || !scene || !arController || !video || video.paused || video.ended) {
      addLog("Animation loop cannot start: Missing components or video not playing.");
      setARReady(false); // Turn off arReady if components are missing
      return;
    }

    addLog("Starting Animation Loop...");
    let isLooping = true; // Flag to control the loop

    const animateScene = () => {
      if (!isLooping) {
        addLog("Animation loop breaking.");
        return; // Exit if flag is false
      }

      try {
        // Process video frame for marker tracking
        arController.processVideo(video); // This triggers onUpdate -> updateWorldMatrix

        // Render the scene
        renderer.render(scene, camera);

        // Request next frame
        animationFrameRef.current = window.requestAnimationFrame(animateScene);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        addLog(`Error in animation loop: ${errorMsg}`);
        console.error("Animation Loop Error:", error);
        isLooping = false; // Stop the loop on error
        animationFrameRef.current = null;
        setARReady(false); // Indicate AR stopped due to error
        alert(`AR stopped due to an error during rendering: ${errorMsg}`);
      }
    };

    // Start the loop
    animationFrameRef.current = window.requestAnimationFrame(animateScene);

    // Cleanup function for this effect
    return () => {
      isLooping = false; // Signal the loop to stop
      if (animationFrameRef.current) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
        addLog("Animation loop stopped on cleanup (arReady changed or unmount).");
      }
    };

  }, [arReady, addLog]); // Effect Dependencies


  // --- Component Unmount Cleanup ---
  useEffect(() => {
    return () => {
      addLog("MindAR component unmounting. Cleaning up all resources...");

      // 1. Stop Animation Loop (should already be stopped by arReady effect, but ensure)
      if (animationFrameRef.current) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      // 2. Stop Video Stream
      if (videoRef.current?.srcObject) {
        try {
          const stream = videoRef.current.srcObject as MediaStream;
          stream.getTracks().forEach(track => track.stop());
          videoRef.current.srcObject = null;
          addLog("Video stream stopped.");
        } catch (e) {
          addLog(`Error stopping video stream on unmount: ${e}`);
        }
      }

      // 3. Dispose ThreeJS Resources
      if (rendererRef.current) {
        rendererRef.current.dispose(); // Release WebGL context and resources
        rendererRef.current = null;
        addLog("ThreeJS Renderer disposed.");
      }
      if (sceneRef.current) {
        // Optionally dispose geometries, materials, textures in the scene
        // sceneRef.current.traverse(object => { ... dispose logic ... });
        sceneRef.current = null;
      }
      cameraRef.current = null;

      // 4. Clear Refs
      markerRef.current = null;
      controllerRef.current = null; // Release controller reference
      addLog("Refs cleared.");
    };
  }, [addLog]); // Include addLog


  // --- Styles ---
  const appStyle: CSSProperties = {
    width: "100vw",
    height: "100vh",
    overflow: "hidden",
    position: "relative",
    background: "#222",
  };

  const arVideoStyle: CSSProperties = {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover", // Use 'cover' to fill screen, 'contain' to show whole video
    zIndex: 1,
    transform: 'scaleX(-1)', // Mirror video for "selfie" view if needed (usually for front cam)
  };

  const arCanvasStyle: CSSProperties = {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    zIndex: 5,
  };

  const uiContainerStyle: CSSProperties = {
    position: "absolute",
    top: "15px",
    left: "15px",
    zIndex: 10,
    background: "rgba(0, 0, 0, 0.7)",
    color: "white",
    padding: "12px",
    borderRadius: "8px",
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    maxWidth: 'calc(100% - 30px)', // Prevent overflow on small screens
  };

  const statusIndicatorStyle: CSSProperties = {
    position: "absolute",
    bottom: "70px", // Position above the debug console
    left: "50%",
    transform: "translateX(-50%)",
    background: "rgba(0, 0, 0, 0.75)",
    color: "white",
    padding: "10px 18px",
    borderRadius: "5px",
    zIndex: 15,
    textAlign: "center",
    fontSize: "0.9em",
    whiteSpace: 'nowrap',
  };

  // --- Render ---
  return (
    <div style={appStyle}>
      {/* --- Control UI (Only before AR starts) --- */}
      {!startAR && (
        <div style={uiContainerStyle}>
          <h3 style={{ margin: 0, marginBottom: '5px', borderBottom: '1px solid #555', paddingBottom: '5px' }}>AR Configuration</h3>
          {/* Camera Selector */}
          <div>
            <label htmlFor="cameraSelect" style={{ marginRight: '5px' }}>Camera:</label>
            <select
              id="cameraSelect"
              value={selectedCameraId}
              onChange={(e) => setSelectedCameraId(e.target.value)}
              disabled={cameras.length === 0 || startAR}
              style={{ padding: '4px', minWidth: '150px' }}
            >
              {cameras.map((cam) => (
                <option key={cam.deviceId} value={cam.deviceId}>
                  {cam.label || `Camera ${cam.deviceId.substring(0, 8)}`}
                </option>
              ))}
              {cameras.length === 0 && <option>Searching for cameras...</option>}
            </select>
          </div>
          {/* Resolution Selector */}
          <div>
            <label htmlFor="resolutionSelect" style={{ marginRight: '5px' }}>Resolution:</label>
            <select
              id="resolutionSelect"
              value={`${selectedResolution.width}x${selectedResolution.height}`}
              onChange={(e) => {
                const [w, h] = e.target.value.split("x").map(Number);
                const found = resolutionOptions.find(res => res.width === w && res.height === h);
                if (found) {
                  setSelectedResolution(found);
                  addLog(`Selected resolution: ${found.label}`);
                }
              }}
              disabled={startAR}
              style={{ padding: '4px', minWidth: '150px' }}
            >
              {resolutionOptions.map((res, index) => (
                <option key={index} value={`${res.width}x${res.height}`}>
                  {res.label}
                </option>
              ))}
            </select>
          </div>
          {/* Start Button */}
          <button
            onClick={handleStartAR}
            disabled={!selectedCameraId || startAR}
            style={{ padding: '8px 15px', cursor: (!selectedCameraId || startAR) ? 'not-allowed' : 'pointer', fontSize: '1em' }}
          >
            {startAR ? "Initializing..." : "Start AR"}
          </button>
        </div>
      )}

      {/* --- Status Indicator --- */}
      {startAR && !arReady && (
        <div style={statusIndicatorStyle}>
          ⏳ Initializing AR... Please wait.
        </div>
      )}
      {startAR && arReady && (
        <div style={statusIndicatorStyle}>
          ✅ AR Ready! Point camera at the target.
        </div>
      )}

      {/* --- AR Viewport --- */}
      {/* `playsInline` is crucial for iOS Safari */}
      {/* `muted` is often required for autoplay */}
      <video ref={videoRef} style={arVideoStyle} playsInline muted />
      <canvas ref={canvasRef} style={arCanvasStyle} />

      {/* --- Debug Console --- */}
      <DebugConsole logs={logs} />
    </div>
  );
}

export default MindAR;