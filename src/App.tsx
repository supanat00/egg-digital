import { useState, useEffect } from 'react';
import liff from '@line/liff';
import CameraPermission from './components/CameraPermission';
import Preloader from './components/Preloader';
import MindAR from './components/MindAR';
import './App.css';

function App() {
  const [liffInitialized, setLiffInitialized] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [startAR, setStartAR] = useState(false);

  useEffect(() => {
    const initLiff = async () => {
      try {
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

  return (
    <>
      {/* หน้าแรกของแอพ */}
      {!startAR && (
        <div className="home">
          <h1>My LIFF & MindAR App</h1>
          <button onClick={() => setStartAR(true)}>Start</button>
          <p className="read-the-docs">
            {liffInitialized ? 'LIFF initialized successfully.' : 'Loading LIFF...'}
          </p>
        </div>
      )}

      {/* แสดง CameraPermission และ Preloader ในขณะที่ยังไม่ได้รับ permission */}
      {!permissionGranted && (
        <>
          <CameraPermission onPermissionGranted={() => setPermissionGranted(true)} />
          <Preloader loadingMessage="Preparing AR..." />
        </>
      )}

      {/* เมื่อกด Start AR, แสดง MindAR component */}
      {startAR && <MindAR />}
    </>
  );
}

export default App;
