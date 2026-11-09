import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'katex/dist/katex.min.css'
import './index.css'
import App from './App.tsx'
import { recoverAndPurgeCorruptedKeys } from './utils/storageKeys'

// Purga inmediata de claves legacy pesadas para garantizar 5MB libres en LocalStorage
recoverAndPurgeCorruptedKeys();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
