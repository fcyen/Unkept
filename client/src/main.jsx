import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// Debug builds expose a tour reset on the console — `__unkept.resetTours()`
// then reload — so the first-run walkthrough can be replayed from scratch
// while iterating on its copy. The literal MODE check lets Rollup drop the
// dynamic import (and the module) from production builds entirely.
if (import.meta.env.MODE === 'debug') {
  import('./components/onboarding/tourState.js').then(({ resetTours }) => {
    window.__unkept = { ...(window.__unkept || {}), resetTours };
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
