// App.tsx
import { useState, useEffect } from 'react'
import liff from '@line/liff'
import MindAR from './MindAR'

function App() {
  const [liffInitialized, setLiffInitialized] = useState(false)
  const [showAR, setShowAR] = useState(false)

  useEffect(() => {
    const initLiff = async () => {
      try {
        // อ่าน LIFF ID จาก environment variable (.env) โดยใช้ prefix VITE_
        const liffId = import.meta.env.VITE_LIFF_ID
        if (!liffId) {
          throw new Error('VITE_LIFF_ID is not defined in .env file')
        }
        await liff.init({ liffId })
        setLiffInitialized(true)
        console.log('LIFF initialized successfully')
      } catch (error) {
        console.error('Error initializing LIFF:', error)
      }
    }
    initLiff()
  }, [])

  const handleStart = () => {
    setShowAR(true)
  }

  return (
    <div>
      <h1>My LIFF & MindAR App</h1>
      <button onClick={handleStart}>Start</button>
      {showAR && <MindAR />}
      <p>{liffInitialized ? 'LIFF initialized successfully.' : 'Loading LIFF...'}</p>
    </div>
  )
}

export default App
