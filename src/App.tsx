// App.tsx
import { useState, useEffect } from 'react';
import liff from '@line/liff';
import MindAR from './components/MindAR';
import './App.css';

function App() {
  const [liffInitialized, setLiffInitialized] = useState(false);
  const [showAR, setShowAR] = useState(false);

  useEffect(() => {
    const initLiff = async () => {
      try {
        // อ่าน LIFF ID จาก environment variable (.env) โดยใช้ prefix VITE_
        const liffId = import.meta.env.VITE_LIFF_ID;
        if (!liffId) {
          throw new Error('VITE_LIFF_ID is not defined in .env file');
        }
        await liff.init({ liffId });
        setLiffInitialized(true);
        console.log('LIFF initialized successfully');
      } catch (error) {
        console.error('Error initializing LIFF:', error);
      }
    };
    initLiff();
  }, []);

  const handleStart = () => {
    setShowAR(true);
  };

  return (
    <>
      {!showAR && (
        <>
          <h1>My LIFF & MindAR App</h1>
          <button onClick={handleStart}>Start</button>
          <p className="read-the-docs">
            {liffInitialized ? 'LIFF initialized successfully.' : 'Loading LIFF...'}
          </p>
        </>
      )}
      {showAR && <MindAR />}
    </>
  );
}

export default App;
