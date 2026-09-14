// Tour content. Each step names its anchor by `data-tour` id — the attribute
// lives on the real element, so moving a control around the layout doesn't
// break the tour, and deleting one simply drops its step (see visibleSteps).

export const UPLOAD_TOUR = [
  {
    id: 'upload-drop',
    anchor: 'upload-dropzone',
    placement: 'bottom',
    title: 'Start with the messy folder',
    body: 'Drop in everything from a trip — a few hundred photos is normal. '
      + 'No pre-sorting, no deleting the bad ones first.',
  },
  {
    id: 'upload-pass',
    anchor: 'upload-cta',
    placement: 'top',
    title: 'We take the first pass',
    body: 'Photos get sorted by capture time, split into a chapter per day, '
      + 'de-duplicated and scored. You land in a review screen with our picks '
      + 'already made, and keep or drop from there.',
  },
  {
    id: 'upload-privacy',
    anchor: 'upload-privacy',
    placement: 'top',
    title: 'And it stays on your device',
    body: 'Reading, scoring and choosing all happen in this tab — your photos '
      + 'are never uploaded. Only place names are looked up online, from '
      + 'coordinates alone. Your curated set downloads at full resolution.',
  },
];

export const CURATION_TOUR = [
  {
    id: 'curation-chapters',
    anchor: 'curation-chapters',
    placement: 'bottom',
    title: 'One chapter per day',
    body: 'Your trip, split by capture date. Tap a day to jump to it — the '
      + 'number beside each is how many photos you have kept there so far.',
  },
  {
    id: 'curation-main',
    anchor: 'curation-main',
    placement: 'bottom',
    padding: 4,
    title: 'Keep or pass, one at a time',
    body: 'Drag the photo down to keep it, up to drop it again — or use the '
      + 'buttons below. Photos we pre-picked start out kept.',
  },
  {
    id: 'curation-strip',
    anchor: 'curation-strip',
    placement: 'left',
    title: 'Its neighbours in time',
    body: 'Everything shot either side of this photo. Tap any of them to '
      + 'judge it instead — bracketed tiles were part of the same burst.',
  },
  {
    id: 'curation-kept',
    anchor: 'curation-kept',
    placement: 'top',
    title: 'The set you are building',
    body: 'Your keepers, coloured by day. Empty slots show how many more that '
      + 'day is asking for; tap any photo to go back to it.',
  },
  {
    id: 'curation-finish',
    anchor: 'curation-finish',
    placement: 'top',
    title: 'Finish whenever it feels right',
    body: 'There is no wrong number — the target is a suggestion. Finish to '
      + 'see the set you chose and download the originals.',
  },
];

/**
 * Drop steps whose anchor is not currently on screen, so the tour never
 * spotlights something that isn't there (a chapter rail with one chapter, a
 * control behind a feature flag). Steps without an anchor always survive and
 * render as centred cards.
 *
 * @param {Array} steps
 * @param {(anchor: string) => boolean} exists
 */
export function visibleSteps(steps, exists) {
  return steps.filter((s) => !s.anchor || exists(s.anchor));
}

/** Default `exists` for the browser: does any element carry this data-tour id? */
export function anchorExists(anchor) {
  if (typeof document === 'undefined') return false;
  return Boolean(document.querySelector(`[data-tour="${anchor}"]`));
}
