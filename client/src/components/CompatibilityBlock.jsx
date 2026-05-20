import { CHECK_LABELS, isIOS } from '../lib/compatibility.js';

export default function CompatibilityBlock({ checks }) {
  const failed = Object.entries(checks).filter(([, ok]) => !ok);
  const onIOS = isIOS();

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-8">
      <div className="max-w-md w-full text-center">
        <h1 className="font-serif text-3xl font-semibold text-ink mb-4">
          This browser can&rsquo;t run Unkept
        </h1>
        <div className="w-12 h-px bg-faint mx-auto mb-6" />
        {onIOS ? (
          <p className="font-sans text-sm text-muted leading-relaxed mb-8">
            On iPhone and iPad, Unkept requires Safari. Other browsers on iOS
            restrict access to hardware APIs that Unkept needs to process your
            photos on-device.
          </p>
        ) : (
          <>
            <p className="font-sans text-sm text-muted leading-relaxed mb-8">
              Unkept processes your photos entirely on your device, which needs
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
          </>
        )}
        <p className="font-sans text-xs text-faint tracking-wide">
          {onIOS
            ? 'Open this page in Safari to continue.'
            : 'Try a recent version of Chrome, Edge, or Safari on a desktop or laptop.'}
        </p>
      </div>
    </div>
  );
}
