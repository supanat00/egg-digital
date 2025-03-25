// App.tsx
import { useState, useEffect } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import liff from '@line/liff'

function App() {
  const [count, setCount] = useState(0)
  const [liffInitialized, setLiffInitialized] = useState(false)

  useEffect(() => {
    const initLiff = async () => {
      try {
        // อ่าน LIFF ID จาก environment variable
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

  return (
    <>
      <div>
        <a href="https://vite.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>Vite + React + LIFF</h1>
      <div className="card">
        <button onClick={() => setCount((prev) => prev + 1)}>
          count is {count}
        </button>
        <p>Edit <code>src/App.tsx</code> and save to test HMR</p>
      </div>
      <p className="read-the-docs">
        {liffInitialized ? 'LIFF initialized successfully.' : 'Loading LIFF...'}
      </p>
    </>
  )
}

export default App
