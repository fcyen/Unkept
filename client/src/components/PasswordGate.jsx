import { useState } from 'react';

// Soft access gate — not real security. The expected value is shipped in
// the bundle, so anyone willing to read the JS can find it. The point is
// to keep the URL un-shareable during private beta. To rotate it, set
// VITE_APP_PASSWORD at build time (Netlify env var) or change the default.
const EXPECTED = import.meta.env.VITE_APP_PASSWORD || 'unkept2026';
const STORAGE_KEY = 'unkept_access_v1';

export function isUnlocked() {
  try {
    return localStorage.getItem(STORAGE_KEY) === EXPECTED;
  } catch {
    return false;
  }
}

export default function PasswordGate({ onUnlock }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (value === EXPECTED) {
      try { localStorage.setItem(STORAGE_KEY, EXPECTED); } catch { /* private mode */ }
      onUnlock();
      return;
    }
    setError(true);
  };

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-8">
      <div className="max-w-md w-full text-center">
        <h1 className="font-serif text-5xl md:text-6xl font-semibold text-ink mb-3">
          Unkept
        </h1>
        <div className="w-12 h-px bg-faint mx-auto mb-6" />
        <p className="font-sans text-sm text-muted leading-relaxed mb-8">
          This is a private beta. Enter the access code to continue.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            autoFocus
            value={value}
            onChange={(e) => { setValue(e.target.value); setError(false); }}
            aria-label="Access code"
            aria-invalid={error}
            className="w-full border border-faint/40 rounded-sm bg-transparent px-4 py-3 font-sans text-sm text-ink text-center tracking-wide focus:outline-none focus:border-ink/40 transition-colors"
            placeholder="access code"
          />
          {error && (
            <p className="font-sans text-xs text-red-600 tracking-wide" role="alert">
              That code didn&rsquo;t work. Try again.
            </p>
          )}
          <button
            type="submit"
            className="w-full font-sans text-sm tracking-wide border border-ink/80 text-ink py-3 hover:bg-ink hover:text-cream transition-colors"
          >
            Continue
          </button>
        </form>
      </div>
    </div>
  );
}
