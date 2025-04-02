// src/components/DebugConsole.tsx
import React, { useState } from 'react';

interface DebugConsoleProps {
    logs: string[];
}

const DebugConsole: React.FC<DebugConsoleProps> = ({ logs }) => {
    const [visible, setVisible] = useState(true);

    const toggleVisible = () => {
        setVisible(!visible);
    };

    const containerStyle: React.CSSProperties = {
        position: 'fixed',
        bottom: 0,
        left: 0,
        width: '100%',
        maxHeight: '40%',
        backgroundColor: 'rgba(0,0,0,0.8)',
        color: 'white',
        overflowY: 'auto',
        fontSize: '0.8em',
        padding: '0.5em',
        zIndex: 10000,
        display: visible ? 'block' : 'none'
    };

    const buttonStyle: React.CSSProperties = {
        position: 'fixed',
        bottom: visible ? '42%' : '0',
        right: 0,
        zIndex: 10001,
        padding: '0.5em',
        backgroundColor: 'rgba(0,0,0,0.8)',
        color: 'white',
        border: 'none',
        cursor: 'pointer'
    };

    return (
        <>
            <div style={containerStyle}>
                <h4>Debug Console</h4>
                {logs.map((log, index) => (
                    <div key={index}>{log}</div>
                ))}
            </div>
            <button style={buttonStyle} onClick={toggleVisible}>
                {visible ? 'Hide' : 'Show'} Debug
            </button>
        </>
    );
};

export default DebugConsole;
