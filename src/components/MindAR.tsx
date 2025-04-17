import { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
// Ensure MindAR library is loaded and attaches to window.MINDAR
import 'mind-ar/dist/mindar-image.prod';

// --- Local Type Definitions ---

// Namespaced ARMarker interface to avoid global conflicts if needed elsewhere
namespace MindARInterfaces {
  export interface ARMarker {
    postMatrix: THREE.Matrix4; // Matrix to apply AFTER MindAR's world matrix
    anchor: THREE.Object3D;    // The Three.js object whose transform is controlled by the marker
    targetIndex: number;       // Index of the target in the .mind file
    targetSrc: string;         // Path to the .mind file
    setupMarker: (dimensions: [number, number]) => void; // Function called when marker dimensions are known
    updateWorldMatrix: (worldMatrix: number[] | null) => void; // Function to update the anchor's matrix
  }
}
// Make the namespaced type available locally within this file
type ARMarker = MindARInterfaces.ARMarker;

// --- Debug Console Component Definition ---
const DebugConsole: React.FC<{ logs: string[] }> = ({ logs }) => {
  const consoleStyle: CSSProperties = {
    position: 'absolute',
    bottom: '10px',
    left: '10px',
    width: 'calc(100% - 30px)', // Adjust width as needed
    maxHeight: '50px', // Limit height
    overflowY: 'auto', // Enable scroll if logs exceed maxHeight
    background: 'rgba(0, 0, 0, 0.7)',
    color: '#0f0', // Green text for visibility
    fontFamily: 'monospace',
    fontSize: '10px',
    padding: '5px',
    zIndex: 20, // Ensure it's above other elements
    border: '1px solid #555',
    borderRadius: '3px',
    opacity: 0.8, // Slightly transparent
    boxSizing: 'border-box',
  };
  const logStyle: CSSProperties = {
    margin: 0,
    padding: '0 2px', // Small padding for readability
    whiteSpace: 'nowrap', // Prevent wrapping
    textOverflow: 'ellipsis', // Add ellipsis if text overflows horizontally (though width is usually sufficient)
    overflow: 'hidden',
  };

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Auto-scroll to the top (most recent log) when new logs arrive
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [logs]); // Dependency array ensures this runs when logs change

  return (
    <div style={consoleStyle} ref={scrollRef}>
      {logs.map((log, index) => (
        // Using index as key is acceptable here since logs are append-only (newest added to front)
        // Displaying newest log first (index 0)
        <p key={index} style={logStyle}>{`[${logs.length - 1 - index}] ${log}`}</p>
      ))}
    </div>
  );
};


// --- Global Augmentation for window.MINDAR ---
// This informs TypeScript that window.MINDAR exists and assigns it a basic 'any' type.
// For stricter typing, you could define a more detailed interface for MINDAR's Controller, etc.
declare global {
  interface Window {
    MINDAR: any; // Define MINDAR property on the global Window object
  }
}

// --- Resolution Options Interface and Data ---
interface ResolutionOption {
  label: string;
  width: number;
  height: number;
}

const resolutionOptions: ResolutionOption[] = [
  { label: "Default (Fit Screen)", width: 0, height: 0 }, // Special value for default behavior
  { label: "640x480", width: 640, height: 480 },
  { label: "1280x720", width: 1280, height: 720 }, // 720p
  { label: "1920x1080", width: 1920, height: 1080 }, // 1080p
  // Higher resolutions might be too demanding for mobile devices
];

// --- Main MindAR React Component ---
function MindAR() {
  // --- State Hooks ---
  const [arReady, setARReady] = useState(false); // Is the AR system fully initialized and running?
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]); // List of available video input devices
  const [selectedCameraId, setSelectedCameraId] = useState<string>(""); // ID of the currently selected camera
  const [selectedResolution, setSelectedResolution] = useState<ResolutionOption>(resolutionOptions[0]); // Selected video resolution option
  const [startAR, setStartAR] = useState(false); // Flag indicating the AR startup process has begun (shows loading state)
  const [logs, setLogs] = useState<string[]>([]); // Array of log messages for the debug console

  // --- Refs for DOM Elements and Three.js/MindAR Objects ---
  const videoRef = useRef<HTMLVideoElement>(null); // Ref for the <video> element
  const canvasRef = useRef<HTMLCanvasElement>(null); // Ref for the <canvas> element
  const animationFrameRef = useRef<number | null>(null); // Ref for the requestAnimationFrame ID
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null); // Ref for the Three.js WebGLRenderer
  const sceneRef = useRef<THREE.Scene | null>(null); // Ref for the Three.js Scene
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null); // Ref for the Three.js Camera
  const markerRef = useRef<ARMarker | null>(null); // Ref for our custom ARMarker data structure
  const controllerRef = useRef<any>(null); // Ref for the MindAR Controller instance (typed as 'any' for simplicity)

  // --- Logging Function ---
  // useCallback ensures the function identity remains stable across renders unless dependencies change
  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString(); // Add a timestamp for context
    // Update logs state, keeping only the latest 100 messages
    setLogs(prev => [`${timestamp}: ${message}`, ...prev].slice(0, 100));
    // Also log to the browser console for easier debugging
    console.log(`[MindAR Log] ${timestamp}: ${message}`);
  }, []); // No dependencies, so this function is created once

  // --- Effect Hook for Initial Camera Setup ---
  useEffect(() => {
    const setupCameras = async () => {
      addLog("Requesting camera permissions and enumerating devices...");
      try {
        // 1. Request User Media to get permission
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        // Stop the tracks immediately after permission is granted; we'll start the desired stream later
        stream.getTracks().forEach(track => track.stop());
        addLog("Camera permission granted.");

        // 2. Enumerate devices to get the list of cameras
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        setCameras(videoDevices); // Update state with the found cameras

        if (videoDevices.length > 0) {
          // 3. Select a default camera (prefer rear-facing)
          const rearCamera = videoDevices.find(device => /back|rear|environment/i.test(device.label));
          const defaultCameraId = rearCamera ? rearCamera.deviceId : videoDevices[0].deviceId; // Fallback to the first camera
          setSelectedCameraId(defaultCameraId);
          const defaultCamLabel = videoDevices.find(v => v.deviceId === defaultCameraId)?.label || `Camera ${defaultCameraId.substring(0, 6)}...`;
          addLog(`Found ${videoDevices.length} cameras. Defaulting to: ${defaultCamLabel}`);
        } else {
          addLog("Error: No video input devices found.");
          alert("No video devices found. Please ensure you have a camera and grant permission.");
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        addLog(`Error accessing camera: ${errorMessage}`);
        console.error("Error requesting camera permission:", error);
        alert(`Error accessing camera: ${errorMessage}. Please check browser permissions and ensure HTTPS is used.`);
      }
    };

    setupCameras();
  }, [addLog]); // Dependency: addLog (stable)

  // --- Effect Hook for Handling Window Resize ---
  useEffect(() => {
    const handleResize = () => {
      // Ensure renderer and camera are initialized
      if (!rendererRef.current || !cameraRef.current) return;

      const width = window.innerWidth;
      const height = window.innerHeight;

      // Update renderer size to match the window
      rendererRef.current.setSize(width, height);

      // Update camera aspect ratio to match the window for correct rendering proportions
      cameraRef.current.aspect = width / height;
      // IMPORTANT: Update the camera's projection matrix after changing aspect ratio
      cameraRef.current.updateProjectionMatrix();

      addLog(`Window resized: ${width}x${height}. Renderer and camera aspect updated.`);
    };

    window.addEventListener("resize", handleResize);
    // Cleanup function: remove the event listener when the component unmounts
    return () => window.removeEventListener("resize", handleResize);
  }, [addLog]); // Dependency: addLog (stable)


  // --- Core AR Initialization Functions ---

  /**
   * Starts the webcam video stream with the selected camera and resolution.
   * Returns true if successful, false otherwise.
   */
  const startVideo = async (): Promise<boolean> => {
    const video = videoRef.current;
    if (!video) {
      addLog("Error starting video: Video element ref is missing.");
      return false;
    }
    if (!selectedCameraId) {
      addLog("Error starting video: No camera selected.");
      return false;
    }

    addLog(`Attempting to start video with Camera ID: ${selectedCameraId.substring(0, 6)}...`);
    const mediaDevices = navigator.mediaDevices;

    // --- Build MediaStream Constraints ---
    const constraints: MediaStreamConstraints = {
      audio: false, // No audio needed
      video: {
        deviceId: { exact: selectedCameraId }, // Use the exactly specified camera
        // facingMode: 'environment', // Usually let deviceId handle it, but could be added as a preference
      }
    };

    // Add resolution constraints if a specific resolution (not "Default") is selected
    const useSpecificResolution = selectedResolution.width > 0 && selectedResolution.height > 0;
    if (useSpecificResolution && typeof constraints.video === 'object') {
      // Use 'ideal' to allow the browser some flexibility if the exact resolution isn't supported
      constraints.video.width = { ideal: selectedResolution.width };
      constraints.video.height = { ideal: selectedResolution.height };
      addLog(`Requesting resolution (ideal): ${selectedResolution.width}x${selectedResolution.height}`);
    } else {
      addLog("Requesting default resolution (letting browser/device decide).");
    }

    // --- Stop any existing video stream before starting a new one ---
    if (video.srcObject) {
      addLog("Stopping existing video stream before starting new one...");
      try {
        (video.srcObject as MediaStream).getTracks().forEach(track => track.stop());
      } catch (e) {
        addLog(`Minor error stopping previous stream: ${e}`);
      }
      video.srcObject = null;
    }

    // --- Get User Media ---
    try {
      const stream = await mediaDevices.getUserMedia(constraints);
      video.srcObject = stream; // Assign the stream to the video element

      // Wait for video metadata to load to get actual dimensions
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => {
          const actualWidth = video.videoWidth;
          const actualHeight = video.videoHeight;
          addLog(`Video metadata loaded. Actual resolution: ${actualWidth}x${actualHeight}`);
          resolve();
        };
        // Handle potential errors during video loading
        video.onerror = (e) => {
          addLog(`Video element error event: ${e}`);
          reject(new Error("Video element encountered an error during loading."));
        };
      });

      // Play the video
      await video.play();
      addLog(`Video playback started (Res: ${video.videoWidth}x${video.videoHeight}).`);
      return true; // Success

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      addLog(`Error starting video stream: ${errorMsg}`);
      console.error("getUserMedia error:", error);

      // --- Retry Logic (Optional but recommended) ---
      // If a specific resolution failed, try again with default constraints
      if (useSpecificResolution && typeof constraints.video === 'object') {
        addLog("Retrying video start with default resolution...");
        delete constraints.video.width;
        delete constraints.video.height;
        try {
          const stream = await mediaDevices.getUserMedia(constraints);
          video.srcObject = stream;
          await new Promise<void>((resolve) => { video.onloadedmetadata = () => resolve(); });
          await video.play();
          addLog(`Video playing with default resolution after retry (Res: ${video.videoWidth}x${video.videoHeight}).`);
          return true; // Success on retry
        } catch (retryError) {
          const retryErrorMsg = retryError instanceof Error ? retryError.message : String(retryError);
          addLog(`Error starting video stream (retry): ${retryErrorMsg}`);
          console.error("getUserMedia retry error:", retryError);
          alert(`Failed to start camera, even after retry. Please check permissions or try a different camera/resolution. Error: ${retryErrorMsg}`);
          return false; // Failure on retry
        }
      }

      // Alert user if initial attempt (or non-resolution-specific attempt) failed
      alert(`Failed to start camera. Please check permissions or try a different camera/resolution. Error: ${errorMsg}`);
      return false; // Failure
    }
  };

  /**
   * Initializes the Three.js WebGLRenderer and attaches it to the canvas.
   * Returns true if successful, false otherwise.
   */
  const startCanvas = () => {
    addLog("Initializing ThreeJS Canvas and Renderer...");
    const canvas = canvasRef.current;
    if (!canvas) {
      addLog("Error initializing canvas: Canvas element ref is missing.");
      return false;
    }

    try {
      const renderer = new THREE.WebGLRenderer({
        canvas,                // Use the specified canvas element
        alpha: true,           // Allow transparent background to see the video underneath
        antialias: true,       // Enable anti-aliasing for smoother edges
        preserveDrawingBuffer: false, // Setting to false can improve performance if not needed (e.g., for screenshots)
      });
      // Set pixel ratio for high-density displays (like Retina)
      renderer.setPixelRatio(window.devicePixelRatio);
      // Set renderer size to fill the window
      renderer.setSize(window.innerWidth, window.innerHeight);
      // Ensure correct color output
      renderer.outputColorSpace = THREE.SRGBColorSpace;

      rendererRef.current = renderer; // Store the renderer instance in the ref
      addLog("ThreeJS Renderer initialized successfully.");
      return true; // Success
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      addLog(`Error initializing WebGL Renderer: ${errorMsg}`);
      console.error("WebGL Renderer Error:", error);
      alert(`Failed to initialize WebGL: ${errorMsg}. Your browser or device might not support it, or graphics drivers may need an update.`);
      return false; // Failure
    }
  };

  /**
   * Callback for MindAR controller to setup marker-specific properties
   * once the marker dimensions are loaded from the .mind file.
   * Uses useCallback for performance optimization.
   */
  const setupMarker = useCallback((dimensions: [number, number]) => {
    if (!markerRef.current) {
      addLog("Error in setupMarker: Marker ref is not set.");
      return;
    }
    const [width, height] = dimensions; // Dimensions from the compiled .mind file
    const marker = markerRef.current;

    addLog(`Marker setup callback executed. Dimensions from .mind file: Width=${width.toFixed(4)}, Height=${height.toFixed(4)}`);

    // --- Define the Post-Matrix ---
    // This matrix is applied *after* MindAR calculates the marker's world matrix.
    // It's used to adjust the coordinate system or orientation relative to the raw marker detection.
    const postMatrix = new THREE.Matrix4(); // Start with an identity matrix (no change)

    // --- Optional Adjustments ---
    // Example 1: Rotate if the marker image's "up" is not aligned with Three.js Y-up
    // const quaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    // postMatrix.makeRotationFromQuaternion(quaternion);
    // addLog("Applied rotation to postMatrix.");

    // Example 2: Add a small vertical offset if needed
    // postMatrix.setPosition(0, 0.1, 0); // Move origin slightly up
    // addLog("Applied position offset to postMatrix.");

    // Example 3: Scale the coordinate system (Less common now, model scaling is preferred)
    // postMatrix.scale(new THREE.Vector3(width, height, 1)); // Scale anchor based on .mind dimensions
    // addLog("Applied scaling to postMatrix based on .mind dimensions.");

    // --- Assign the calculated matrix ---
    marker.postMatrix = postMatrix;
    addLog(`Marker postMatrix configured (currently: ${postMatrix.elements.every((val, i) => val === (i % 5 === 0 ? 1 : 0)) ? 'Identity' : 'Custom'}).`);

  }, [addLog]); // Dependency: addLog

  /**
   * Callback for MindAR controller to update the anchor's world matrix
   * when the marker is detected or its position changes.
   * Uses useCallback for performance optimization.
   */
  const updateWorldMatrix = useCallback((worldMatrixUpdate: number[] | null) => {
    if (!markerRef.current) {
      // This might happen briefly during initialization/cleanup
      // addLog("Warning in updateWorldMatrix: Marker ref is not set.");
      return;
    }

    const matrixFound = worldMatrixUpdate !== null; // Is the marker currently detected?
    const marker = markerRef.current;
    const anchor = marker.anchor; // The Three.js Object3D representing the marker

    // Log target found/lost events only when the state changes
    if (anchor.visible !== matrixFound) {
      addLog(`Marker Target ${matrixFound ? 'Found' : 'Lost'}`);
    }

    anchor.visible = matrixFound; // CRITICAL: Make the anchor (and its children) visible/invisible

    // If the marker is found, update the anchor's matrix
    if (matrixFound && worldMatrixUpdate) {
      const postMatrix = marker.postMatrix; // Get the custom post-processing matrix
      const worldMatrix = new THREE.Matrix4();
      worldMatrix.fromArray(worldMatrixUpdate); // Create matrix from MindAR's data

      // Apply the postMatrix: finalMatrix = worldMatrix * postMatrix
      // This transforms the anchor according to MindAR's detection AND our custom adjustments.
      const finalMatrix = worldMatrix.multiply(postMatrix);

      // Apply the calculated matrix to the anchor object
      // We copy the matrix directly because anchor.matrixAutoUpdate is false
      anchor.matrix.copy(finalMatrix);

      // Optional: Log matrix details for debugging (can be verbose)
      // if (anchor.visible) {
      //   const pos = new THREE.Vector3();
      //   anchor.matrix.decompose(pos, new THREE.Quaternion(), new THREE.Vector3());
      //   console.log(`Anchor Updated: Pos(x=${pos.x.toFixed(2)}, y=${pos.y.toFixed(2)}, z=${pos.z.toFixed(2)})`);
      // }
    }
  }, [addLog]); // Dependency: addLog

  /**
   * Initializes the local ARMarker data structure.
   * Uses useCallback for performance optimization.
   */
  const initMarker = useCallback(() => {
    addLog("Initializing local AR Marker data structure...");
    const postMatrix = new THREE.Matrix4(); // Default to identity matrix
    const anchor = new THREE.Object3D(); // Create the Three.js anchor object
    anchor.visible = false; // Initially invisible
    anchor.matrixAutoUpdate = false; // VERY IMPORTANT: Disable auto-update; MindAR will set the matrix directly

    markerRef.current = {
      postMatrix,
      anchor,
      targetIndex: 0, // Assume we're using the first target defined in the .mind file
      targetSrc: './data/targets.mind', // <<< VERY IMPORTANT: Ensure this path is correct relative to your PUBLIC folder!
      setupMarker,       // Assign the setup callback
      updateWorldMatrix, // Assign the update callback
    };
    addLog("Marker structure initialized. Target source: " + markerRef.current.targetSrc);
  }, [addLog, setupMarker, updateWorldMatrix]); // Dependencies

  /**
   * Initializes the MindAR Controller instance.
   * Must be called AFTER the video element has metadata loaded.
   * Returns the controller instance or null on failure.
   */
  const initController = () => {
    addLog("Initializing MindAR Controller...");
    const video = videoRef.current;

    // Check if video element is ready (has dimensions)
    if (!video || video.readyState < video.HAVE_METADATA || video.videoWidth === 0) {
      addLog("Error initializing controller: Video element not ready or has no dimensions yet.");
      return null;
    }

    // Determine input dimensions for MindAR (use specified resolution or fallback)
    let inputWidth: number;
    let inputHeight: number;
    if (selectedResolution.width > 0 && selectedResolution.height > 0) {
      inputWidth = selectedResolution.width;
      inputHeight = selectedResolution.height;
      addLog(`MindAR Controller using specified resolution hint: ${inputWidth}x${inputHeight}`);
    } else {
      // Fallback to actual video dimensions (most reliable) or window dimensions
      inputWidth = video.videoWidth || window.innerWidth;
      inputHeight = video.videoHeight || window.innerHeight;
      addLog(`MindAR Controller using detected/fallback resolution: ${inputWidth}x${inputHeight}`);
    }

    try {
      // Instantiate the MindAR Image Controller
      const arController = new window.MINDAR.IMAGE.Controller({
        inputWidth,     // Provide width hint
        inputHeight,    // Provide height hint
        maxTrack: 1,    // Track only one marker at a time
        // --- Optional parameters for tuning ---
        // warmupTolerance: 5, // Number of frames to wait before starting tracking after warmup
        // missTolerance: 5,   // Number of frames to keep tracking before declaring marker lost
        // filterMinCF: 0.001, // Cutoff frequency for filtering marker movement (lower = smoother, more lag)
        // filterBeta: 10,     // Beta value for filtering (higher = more smoothing)
        // --- Callback for tracking updates ---
        onUpdate: (data: any) => { // 'data' contains tracking info; consider defining a stricter type
          if (data.type === 'updateMatrix' && markerRef.current) {
            const { targetIndex, worldMatrix } = data;
            // If tracking multiple targets, ensure this update matches our marker's index
            if (markerRef.current.targetIndex === targetIndex) {
              markerRef.current.updateWorldMatrix(worldMatrix); // Pass matrix data to our update function
            }
          }
        }
      });
      controllerRef.current = arController; // Store the controller instance
      addLog("MindAR Controller initialized successfully.");
      return arController; // Return the instance
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      addLog(`FATAL Error initializing MindAR Controller: ${errorMsg}`);
      console.error("MindAR Controller Init Error:", error);
      alert(`Failed to initialize MindAR Engine: ${errorMsg}. Check console for details.`);
      return null; // Failure
    }
  };

  /**
   * Loads the .mind file image targets and registers them with the controller.
   * Calls the marker's setupMarker callback upon success.
   * Returns true if successful, false otherwise.
   */
  const registerMarker = async (arController: any) => {
    addLog("Registering AR marker target with controller...");
    if (!markerRef.current || !arController) {
      addLog("Error registering marker: Marker ref or Controller instance is missing.");
      return false;
    }
    const marker = markerRef.current;

    try {
      // Load the target(s) defined in the .mind file
      // This returns a promise containing target info, including dimensions
      const targetData = await arController.addImageTargets(marker.targetSrc);

      // Validate the returned data for the specific target index we care about
      if (!targetData || !targetData.dimensions || !Array.isArray(targetData.dimensions[marker.targetIndex])) {
        addLog(`Error: Invalid data returned from addImageTargets for target index ${marker.targetIndex}. Check targets.mind file, path, and compilation.`);
        alert(`Error loading marker data from ${marker.targetSrc}. Please ensure the file is compiled correctly and exists at the specified path.`);
        return false;
      }

      // Call the setup function with the dimensions for our target index
      marker.setupMarker(targetData.dimensions[marker.targetIndex]);
      addLog(`Marker registered successfully using ${marker.targetSrc}`);
      return true; // Success
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      addLog(`Error registering marker (${marker.targetSrc}): ${errorMsg}`);
      console.error("Error loading image targets:", error);
      alert(`Failed to load AR marker from ${marker.targetSrc}. Please ensure the file exists, is accessible, and compiled correctly. Error: ${errorMsg}`);
      return false; // Failure
    }
  };

  /**
   * Sets up the Three.js camera using the projection matrix provided by MindAR.
   * Returns true if successful, false otherwise.
   */
  const setupCamera = (arController: any) => {
    addLog("Setting up ThreeJS Camera using MindAR projection...");
    if (!arController) {
      addLog("Error setting up camera: AR Controller instance is missing.");
      return false;
    }

    const camera = new THREE.PerspectiveCamera(); // Create a new perspective camera
    try {
      // Get the projection matrix calculated by MindAR based on input dimensions/camera params
      const projMatrix = arController.getProjectionMatrix();
      // Apply this matrix directly to the Three.js camera
      camera.projectionMatrix.fromArray(projMatrix);
      // Calculate the inverse matrix, needed for some Three.js operations (like raycasting)
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();

      // Set camera's aspect ratio based on the *display window* size for correct rendering proportions
      // MindAR's projection matrix handles the video aspect internally.
      camera.aspect = window.innerWidth / window.innerHeight;
      // Note: updateProjectionMatrix() is usually needed after changing fov, aspect, near, far,
      // but since we set projectionMatrix directly, it might be redundant unless aspect changes later.

      cameraRef.current = camera; // Store the camera instance
      addLog("ThreeJS Camera setup complete using MindAR projection matrix.");
      return true; // Success
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      addLog(`Error setting up camera projection: ${errorMsg}`);
      console.error("Camera Setup Error:", error);
      alert(`Failed to setup AR camera using MindAR projection: ${errorMsg}`);
      return false; // Failure
    }
  };

  /**
   * Creates the Three.js scene, adds lighting, the marker anchor, and 3D content.
   * Returns true if successful, false otherwise.
   */
  const composeScene = () => {
    addLog("Composing ThreeJS Scene...");
    if (!markerRef.current) {
      addLog("Error composing scene: Marker ref is not ready.");
      return false;
    }

    const scene = new THREE.Scene(); // Create a new scene
    const anchor = markerRef.current.anchor; // Get the Object3D controlled by the marker

    // --- Add Your 3D Content Here ---
    // The size/position is relative to the marker's coordinate system (center is 0,0,0).
    // Adjust geometry size based on testing.
    const geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5); // Example: A cube of size 0.5 units
    const material = new THREE.MeshStandardMaterial({
      color: 0xff0000, // Bright Red
      metalness: 0.3,  // Slightly metallic
      roughness: 0.6,  // Somewhat rough surface
      // wireframe: true, // Uncomment for debugging visibility/size
    });
    const cube = new THREE.Mesh(geometry, material);
    // Position the cube slightly above the marker's center (Y is typically up in Three.js)
    cube.position.set(0, 0.25, 0);
    anchor.add(cube); // CRITICAL: Add the 3D model as a child of the anchor
    addLog(`Added red cube model (Size: ${geometry.parameters.width}) to the anchor at position Y=${cube.position.y}.`);

    // --- Add Lighting ---
    // Ambient light provides overall illumination
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); // White light, moderate intensity
    scene.add(ambientLight);
    // Directional light provides highlights and shadows
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8); // White light, higher intensity
    directionalLight.position.set(1, 3, 2); // Position the light source relative to the world/camera
    scene.add(directionalLight);
    addLog("Added ambient and directional lights to the scene.");

    // --- Add the Anchor to the Scene ---
    // The anchor itself is added to the scene. When the marker is found,
    // MindAR updates the anchor's matrix, moving it (and its children, like the cube) correctly.
    scene.add(anchor);

    sceneRef.current = scene; // Store the scene instance
    addLog("ThreeJS Scene composed successfully. Anchor (with cube) added.");
    return true; // Success
  };


  // --- Main AR Start Process Handler ---
  /**
   * Orchestrates the entire AR initialization sequence.
   */
  const handleStartAR = async () => {
    setARReady(false); // Ensure AR is marked as not ready initially
    setStartAR(true);  // Indicate the start process has begun (for UI feedback)
    addLog("--- AR START PROCESS INITIATED ---");

    // Sequence of initialization steps:
    // 1. Start Video Stream
    addLog("Step 1/7: Starting video stream...");
    const videoStarted = await startVideo();
    if (!videoStarted || !videoRef.current) {
      addLog("AR ABORTED at Step 1: Failed to start video.");
      setStartAR(false); // Reset start flag
      return; // Stop the process
    }

    // 2. Initialize Canvas & Renderer
    addLog("Step 2/7: Initializing ThreeJS canvas and renderer...");
    const canvasStarted = startCanvas();
    if (!canvasStarted) {
      addLog("AR ABORTED at Step 2: Failed to start canvas/renderer.");
      setStartAR(false);
      // Clean up video if it was started
      (videoRef.current?.srcObject as MediaStream)?.getTracks().forEach(track => track.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
      return;
    }

    // 3. Initialize Local Marker Structure
    addLog("Step 3/7: Initializing local marker data structure...");
    initMarker(); // This is synchronous
    if (!markerRef.current) {
      // This should theoretically not happen if initMarker is correct, but check anyway
      addLog("AR ABORTED at Step 3: Failed to initialize marker structure.");
      setStartAR(false);
      (videoRef.current?.srcObject as MediaStream)?.getTracks().forEach(track => track.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
      return;
    }

    // 4. Initialize MindAR Controller (Requires video metadata to be ready)
    addLog("Step 4/7: Initializing MindAR Controller...");
    const controller = initController();
    if (!controller) {
      addLog("AR ABORTED at Step 4: Failed to initialize MindAR Controller.");
      setStartAR(false);
      (videoRef.current?.srcObject as MediaStream)?.getTracks().forEach(track => track.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
      return;
    }

    // 5. Register Marker with Controller (Asynchronous)
    addLog("Step 5/7: Registering marker target with controller...");
    const markerRegistered = await registerMarker(controller);
    if (!markerRegistered) {
      addLog("AR ABORTED at Step 5: Failed to register marker.");
      setStartAR(false);
      (videoRef.current?.srcObject as MediaStream)?.getTracks().forEach(track => track.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
      return;
    }

    // 6. Setup ThreeJS Camera (Requires controller for projection matrix)
    addLog("Step 6/7: Setting up ThreeJS camera...");
    const cameraSetup = setupCamera(controller);
    if (!cameraSetup) {
      addLog("AR ABORTED at Step 6: Failed to setup camera.");
      setStartAR(false);
      (videoRef.current?.srcObject as MediaStream)?.getTracks().forEach(track => track.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
      return;
    }

    // 7. Compose ThreeJS Scene (Requires marker anchor)
    addLog("Step 7/7: Composing ThreeJS scene...");
    const sceneComposed = composeScene();
    if (!sceneComposed) {
      addLog("AR ABORTED at Step 7: Failed to compose scene.");
      setStartAR(false);
      (videoRef.current?.srcObject as MediaStream)?.getTracks().forEach(track => track.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
      return;
    }

    // --- Initialization Complete ---
    addLog("--- AR INITIALIZATION COMPLETE ---");
    // Set arReady to true, which will trigger the animation loop effect
    setARReady(true);
    // Note: startAR remains true while AR is active
  };


  // --- Animation Loop Effect ---
  // This effect runs when `arReady` becomes true, starting the render loop.
  // It stops when `arReady` becomes false or the component unmounts.
  useEffect(() => {
    if (!arReady) {
      // If AR is not ready, ensure any existing animation frame is cancelled
      if (animationFrameRef.current) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
        addLog("Animation loop stopped (AR not ready).");
      }
      return; // Exit the effect if AR is not ready
    }

    // --- Check for essential components before starting the loop ---
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    const scene = sceneRef.current;
    const arController = controllerRef.current;
    const video = videoRef.current;

    if (!renderer || !camera || !scene || !arController || !video || video.paused || video.ended || video.readyState < video.HAVE_CURRENT_DATA) {
      addLog("Animation loop cannot start: Missing components or video not in a playable state.");
      setARReady(false); // Turn off arReady if prerequisites are missing
      return; // Exit the effect
    }

    addLog("Starting AR Animation Loop...");
    let isLooping = true; // Flag to control the loop execution

    // --- The Animation Function ---
    const animateScene = () => {
      // Check if the loop should continue
      if (!isLooping) {
        addLog("Animation loop breaking (isLooping=false).");
        animationFrameRef.current = null; // Clear ref just in case
        return;
      }

      try {
        // 1. Process the current video frame with MindAR to detect markers
        // This internally triggers the onUpdate callback (updateWorldMatrix) if a marker is found/moved.
        arController.processVideo(video);

        // 2. Render the Three.js scene using the configured camera
        renderer.render(scene, camera);

        // 3. Request the next frame to continue the loop
        animationFrameRef.current = window.requestAnimationFrame(animateScene);
      } catch (error) {
        // --- Error Handling within the loop ---
        const errorMsg = error instanceof Error ? error.message : String(error);
        addLog(`FATAL Error in animation loop: ${errorMsg}`);
        console.error("Animation Loop Error:", error);
        isLooping = false; // Stop the loop immediately on error
        animationFrameRef.current = null;
        setARReady(false); // Indicate AR stopped due to error
        setStartAR(false); // Also reset the start flag to potentially allow restart
        alert(`AR stopped due to an error during rendering: ${errorMsg}. Check console for details.`);
      }
    };

    // --- Start the animation loop ---
    animationFrameRef.current = window.requestAnimationFrame(animateScene);

    // --- Cleanup function for this effect ---
    // This runs when `arReady` changes to false or when the component unmounts.
    return () => {
      isLooping = false; // Signal the loop to stop on the next iteration
      if (animationFrameRef.current) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
        addLog("Animation loop stopped on cleanup (arReady changed or unmount).");
      }
    };

  }, [arReady, addLog]); // Dependencies: Run when arReady or addLog changes


  // --- Component Unmount Cleanup Effect ---
  // This effect runs only once when the component is unmounted.
  useEffect(() => {
    return () => {
      addLog("MindAR component unmounting. Cleaning up all resources...");

      // 1. Ensure Animation Loop is stopped
      if (animationFrameRef.current) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
        addLog("Animation loop stopped on unmount.");
      }

      // 2. Stop Video Stream Tracks
      if (videoRef.current?.srcObject) {
        try {
          const stream = videoRef.current.srcObject as MediaStream;
          stream.getTracks().forEach(track => track.stop());
          videoRef.current.srcObject = null; // Clear srcObject
          addLog("Video stream tracks stopped.");
        } catch (e) {
          addLog(`Minor error stopping video stream on unmount: ${e}`);
        }
      }

      // 3. Dispose ThreeJS Resources
      if (rendererRef.current) {
        rendererRef.current.dispose(); // Release WebGL context and related resources
        addLog("ThreeJS Renderer disposed.");
      }
      // Optionally dispose geometries, materials, textures stored in refs or the scene if needed
      // sceneRef.current?.traverse(object => { ... dispose logic ... });

      // 4. Clear Refs (helps garbage collection)
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      markerRef.current = null;
      controllerRef.current = null; // Release reference to the MindAR controller
      addLog("Component refs cleared.");
    };
  }, [addLog]); // Dependency: addLog (stable)


  // --- Calculate Video Mirroring based on Selected Camera ---
  // useMemo prevents recalculating on every render, only when dependencies change.
  const isMirrored = useMemo(() => {
    if (!selectedCameraId || cameras.length === 0) {
      return true; // Default to mirrored if camera info isn't available yet
    }
    const selectedCamera = cameras.find(cam => cam.deviceId === selectedCameraId);
    if (!selectedCamera || !selectedCamera.label) {
      // If camera not found or has no label, assume front-facing (safer default)
      // addLog("Mirroring Check: Camera not found or has no label, defaulting to mirrored.");
      return true;
    }
    // Check if the label indicates a rear-facing camera
    const isLikelyRear = /back|rear|environment/i.test(selectedCamera.label);
    // Mirror the video IF IT'S NOT likely a rear camera (i.e., if it's likely front or unknown)
    const shouldMirror = !isLikelyRear;
    addLog(`Mirroring Check: Label='${selectedCamera.label}', isLikelyRear=${isLikelyRear}, Applying Mirror=${shouldMirror}`);
    return shouldMirror;
  }, [selectedCameraId, cameras, addLog]); // Dependencies: Recalculate when these change


  // --- Component Styles ---
  // Using objects for CSSProperties for type safety and easier management
  const styles: { [key: string]: CSSProperties } = {
    appContainer: {
      width: "100vw", // Fill viewport width
      height: "100vh", // Fill viewport height
      overflow: "hidden", // Prevent scrollbars
      position: "relative", // Establish positioning context for absolute children
      background: "#222", // Dark background during loading/fallback
    },
    arVideo: {
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      objectFit: "cover", // Cover the container, potentially cropping video edges
      zIndex: 1, // Behind the canvas and UI
      // Apply horizontal flip conditionally based on isMirrored calculation
      transform: isMirrored ? 'scaleX(-1)' : 'none',
    },
    arCanvas: {
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      zIndex: 5, // Above the video, below the UI
      pointerEvents: 'none', // Allow clicks/touches to potentially pass through to video/other layers if needed
    },
    uiContainer: {
      position: "absolute",
      top: "15px",
      left: "15px",
      zIndex: 10, // Above canvas and video
      background: "rgba(0, 0, 0, 0.7)",
      color: "white",
      padding: "12px",
      borderRadius: "8px",
      display: 'flex',
      flexDirection: 'column',
      gap: '10px', // Spacing between UI elements
      maxWidth: 'calc(100% - 30px)', // Prevent overflow on small screens
      boxSizing: 'border-box',
    },
    statusIndicator: {
      position: "absolute",
      bottom: "70px", // Position above the debug console
      left: "50%",
      transform: "translateX(-50%)", // Center horizontally
      background: "rgba(0, 0, 0, 0.75)",
      color: "white",
      padding: "10px 18px",
      borderRadius: "5px",
      zIndex: 15, // Above canvas, potentially below specific UI controls if needed
      textAlign: "center",
      fontSize: "0.9em",
      whiteSpace: 'nowrap', // Prevent wrapping
      pointerEvents: 'none', // Does not capture clicks
    },
    button: {
      padding: '8px 15px',
      fontSize: '1em',
      cursor: 'pointer',
      backgroundColor: '#4CAF50', // Green
      color: 'white',
      border: 'none',
      borderRadius: '4px',
      transition: 'background-color 0.2s ease',
    },
    buttonDisabled: {
      padding: '8px 15px',
      fontSize: '1em',
      cursor: 'not-allowed',
      backgroundColor: '#aaa', // Greyed out
      color: '#eee',
      border: 'none',
      borderRadius: '4px',
    },
    select: {
      padding: '4px 8px',
      minWidth: '180px', // Give selects some base width
      maxWidth: '100%',
    },
    label: {
      marginRight: '5px',
      display: 'inline-block', // Ensure label and select align well
      minWidth: '70px', // Align labels somewhat
    },
  };

  // --- JSX Render ---
  return (
    <div style={styles.appContainer}>
      {/* --- Configuration UI (Shown only before AR starts) --- */}
      {!startAR && (
        <div style={styles.uiContainer}>
          <h3 style={{ margin: 0, marginBottom: '10px', borderBottom: '1px solid #555', paddingBottom: '5px' }}>
            AR Configuration
          </h3>
          {/* Camera Selector */}
          <div>
            <label htmlFor="cameraSelect" style={styles.label}>Camera:</label>
            <select
              id="cameraSelect"
              value={selectedCameraId}
              onChange={(e) => setSelectedCameraId(e.target.value)}
              disabled={cameras.length === 0 || startAR} // Disable if no cameras or AR starting/started
              style={styles.select}
            >
              {cameras.length === 0 && <option>Searching...</option>}
              {cameras.map((cam) => (
                <option key={cam.deviceId} value={cam.deviceId}>
                  {/* Display camera label or a truncated ID */}
                  {cam.label || `Camera ${cam.deviceId.substring(0, 8)}...`}
                </option>
              ))}
            </select>
          </div>
          {/* Resolution Selector */}
          <div>
            <label htmlFor="resolutionSelect" style={styles.label}>Resolution:</label>
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
              disabled={startAR} // Disable once AR starts
              style={styles.select}
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
            disabled={!selectedCameraId || startAR} // Disable if no camera selected or AR starting/started
            style={(!selectedCameraId || startAR) ? styles.buttonDisabled : styles.button}
          >
            {startAR ? "Initializing..." : "Start AR"}
          </button>
        </div>
      )}

      {/* --- Status Indicator (Shown during/after AR start) --- */}
      {startAR && !arReady && (
        <div style={styles.statusIndicator}>
          ⏳ Initializing AR... Please wait.
        </div>
      )}
      {/* Show ready message only when fully initialized */}
      {arReady && (
        <div style={styles.statusIndicator}>
          ✅ AR Ready! Point camera at the target marker.
        </div>
      )}

      {/* --- AR Viewport Elements --- */}
      {/* Video element: playsInline and muted are often required for autoplay on mobile */}
      <video ref={videoRef} style={styles.arVideo} playsInline muted />
      {/* Canvas element for Three.js rendering */}
      <canvas ref={canvasRef} style={styles.arCanvas} />

      {/* --- Debug Console --- */}
      <DebugConsole logs={logs} />
    </div>
  );
}

export default MindAR; // Export the component for use in your application