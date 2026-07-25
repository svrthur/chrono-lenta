import { createRoot } from 'react-dom/client';
import { setBaseUrl } from '@workspace/api-client-react';

import App from './App';

import './index.css';

// In production the API lives on a separate Render service.
// Set VITE_API_BASE_URL in Render's static site environment variables
// to point at the API server (e.g. https://chrono-lenta-ap.onrender.com).
const apiBase = import.meta.env.VITE_API_BASE_URL as string | undefined;
if (apiBase) {
  setBaseUrl(apiBase);
}

createRoot(document.getElementById('root')!).render(<App />);
