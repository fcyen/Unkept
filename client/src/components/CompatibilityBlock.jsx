import { CHECK_LABELS } from '../lib/compatibility.js';

export default function CompatibilityBlock({ checks }) {
  const failed = Object.entries(checks).filter(([, ok]) => !ok);

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-8">
      <div className="max-w-md w-full text-center">
        <h1 className="font-serif text-3xl font-semibold text-ink mb-4">
          This browser can&rsquo;t run PhotoStory
        </h1>
        <div className="w-12 h-px bg-faint mx-auto mb-6" />
        <p className="font-sans text-sm text-muted leading-relaxed mb-8">
          PhotoStory processes your photos entirely on your device, which needs
          a modern browser and enough hardware to keep up. The following
          requirements aren&rsquo;t met:
        </p>
        <ul className="text-left font-sans text-sm text-ink space-y-2 mb-8">
          {failed.map(([key]) => (
            <li key={key} className="flex items-start gap-2">
              <span className="text-red-600">&times;</span>
              <span>{CHECK_LABELS[key] || key}</span>
            </li>
          ))}
        </ul>
        <p className="font-sans text-xs text-faint tracking-wide">
          Try a recent version of Chrome, Edge, or Safari on a desktop or laptop.
        </p>
      </div>
    </div>
  );
}
