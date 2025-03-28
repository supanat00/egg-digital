/// <reference types="vite/client" />
// aframe-react.d.ts
declare module 'aframe-react';

declare namespace JSX {
    interface IntrinsicElements {
        'a-scene': any;
        'a-assets': any;
        'a-camera': any;
        'a-entity': any;
        'a-plane': any;
        'a-gltf-model': any;
        'a-asset-item': any;
    }
}
