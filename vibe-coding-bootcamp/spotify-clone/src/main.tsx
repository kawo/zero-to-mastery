import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '@/App';
// Imported early so the install prompt event is captured before any component mounts.
import '@/hooks/useBrowser';
import '@/styles/tailwind.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
