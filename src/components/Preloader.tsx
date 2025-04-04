import React from 'react';

interface PreloaderProps {
    loadingMessage?: string;
}

const Preloader: React.FC<PreloaderProps> = ({ loadingMessage = "Loading..." }) => {
    const preloaderStyle: React.CSSProperties = {
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        background: "#000",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        fontSize: "1.5em"
    };

    return <div style={preloaderStyle}>{loadingMessage}</div>;
};

export default Preloader;
