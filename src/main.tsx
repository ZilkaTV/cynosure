import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { LanguageProvider } from './i18n/LanguageContext'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LanguageProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </LanguageProvider>
  </React.StrictMode>,
)

// No longer registering a service worker for new visitors - see
// public/sw.js's own comment for why (its fetch() proxying broke page
// loads outright for a real visitor, in a way no HTTP Cache-Control header
// could fix or even see). That file still ships as a self-unregistering
// kill switch for browsers that already have the old version installed.
