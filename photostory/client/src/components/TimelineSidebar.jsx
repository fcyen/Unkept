export default function TimelineSidebar({ chapters, activeIndex, onSelect, tripName, onBack }) {
  // Group chapters by date
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
    <div className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col h-screen shrink-0">
      <div className="p-4 border-b border-gray-800">
        <button
          onClick={onBack}
          className="text-gray-400 hover:text-white text-sm flex items-center gap-1 mb-2"
        >
          ← Back
        </button>
        <h2 className="text-lg font-bold text-white truncate">{tripName}</h2>
      </div>

      <nav className="flex-1 overflow-y-auto p-4 space-y-4">
        {grouped.map((group) => (
          <div key={group.date || 'other'}>
            {group.date && (
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                {formatDate(group.date)}
              </p>
            )}
            <div className="space-y-1">
              {group.chapters.map((ch) => {
                const isActive = ch.globalIndex === activeIndex;
                return (
                  <button
                    key={ch.id}
                    onClick={() => onSelect(ch.globalIndex)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                      isActive
                        ? 'bg-blue-600/20 text-blue-400 border border-blue-600/30'
                        : 'text-gray-400 hover:text-white hover:bg-gray-800'
                    }`}
                  >
                    <span className="block truncate font-medium">{ch.activity}</span>
                    <span className="block text-xs text-gray-500 truncate">
                      {ch.start_time && ch.end_time
                        ? `${ch.start_time} – ${ch.end_time}`
                        : ''}
                      {ch.photoCount > 0 && ` · ${ch.photoCount} photos`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </div>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
