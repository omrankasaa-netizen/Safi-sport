import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { TRPCProvider } from '@/providers/trpc'
import { initAnalytics } from '@/lib/analytics'
import './index.css'
import App from './App.jsx'

/**
 * Only anchor the router to a basename when the entry document was hit by
 * its literal filename ("/.../index.html") — the signature of a sandbox
 * preview proxy serving one static file with no server-side SPA fallback.
 * Real app routes ("/shop", "/story", ...) never end in ".html", so a
 * normal domain deploy with server-side fallback routing (see boot.ts's
 * serveStaticFiles) is completely unaffected and keeps basename "" —
 * deep links to any route still resolve exactly as before.
 */
const basename = window.location.pathname.endsWith('/index.html')
  ? window.location.pathname
  : ''

// Defer pixel scripts until after the first paint so they never compete
// with the initial render for bandwidth on slow connections (4G Lebanon).
if (typeof window !== 'undefined') {
  window.requestIdleCallback ? window.requestIdleCallback(initAnalytics) : window.setTimeout(initAnalytics, 1500)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TRPCProvider>
      <BrowserRouter basename={basename}>
        <App />
      </BrowserRouter>
    </TRPCProvider>
  </StrictMode>,
)
