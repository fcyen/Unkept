export default function TableOfContents({ chapters, onSelect }) {
  // Group by date
  const grouped = [];
  let currentDate = null;
  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i];
    if (ch.date !== currentDate) {
      currentDate = ch.date;
      grouped.push({ date: ch.date, chapters: [] });
    }
    grouped[grouped.length - 1].chapters.push({ ...ch, globalIndex: i });
  }

  return (
    <section className="max-w-2xl mx-auto px-8 py-24 border-t border-faint/30">
      <p className="font-sans text-xs tracking-[0.3em] uppercase text-faint mb-8">
        Contents
      </p>
      <div className="space-y-8">
        {grouped.map((group) => (
          <div key={group.date || 'other'}>
            {group.date && (
              <p className="font-sans text-xs text-faint uppercase tracking-wider mb-3">
                {formatDate(group.date)}
              </p>
            )}
            <div className="space-y-2">
              {group.chapters.map((ch) => (
                <button
                  key={ch.id}
                  onClick={() => onSelect(ch.globalIndex)}
                  className="block w-full text-left group"
                >
                  <span className="flex items-baseline gap-4">
                    <span className="font-sans text-xs text-faint tabular-nums shrink-0">
                      {String(ch.globalIndex + 1).padStart(2, '0')}
                    </span>
                    <span className="font-serif text-xl text-ink group-hover:text-muted transition-colors">
                      {ch.activity}
                    </span>
                    {ch.venue && (
                      <span className="font-sans text-xs text-faint ml-auto hidden sm:inline">
                        {ch.venue}
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}
