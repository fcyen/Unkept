export const STORY_INTENTS = Object.freeze([
  {
    id: 'balanced',
    label: 'Balanced',
    description: 'A bit of everything',
  },
  {
    id: 'people',
    label: 'People',
    description: 'The companions in my journey',
  },
  {
    id: 'placesAndFood',
    label: 'Places & Food',
    description: 'Good views and good meals',
  },
  {
    id: 'cinematic',
    label: 'Cinematic',
    description: 'The most beautiful shots',
  },
]);

export const DEFAULT_STORY_INTENT = 'balanced';

export function normalizeStoryIntent(intent) {
  return STORY_INTENTS.some((item) => item.id === intent)
    ? intent
    : DEFAULT_STORY_INTENT;
}
