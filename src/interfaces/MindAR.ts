import { THREE } from "aframe";

/** Helpful interface to deal with AR markers in MindAR */
export interface ARMarker {
    postMatrix: THREE.Matrix4
    targetIndex: number;
    targetSrc: string;
    anchor: THREE.Object3D;
    updateWorldMatrix: (worldMatrix: number[] | null) => void;
    setupMarker: (dimensions: [number, number]) => void;
}