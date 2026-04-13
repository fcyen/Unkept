/**
 * Story Skeleton Schema Validator
 *
 * Validates that a Story Skeleton JSON object conforms to the expected schema.
 * Used in tests and in dev-mode runtime assertions to catch pipeline bugs early.
 *
 * Returns { valid: true } or { valid: false, errors: string[] }.
 */

/**
 * @param {object} skeleton
 * @returns {{ valid: boolean, errors?: string[] }}
 */
export function isValidSkeleton(skeleton) {
  const errors = [];

  if (!skeleton || typeof skeleton !== 'object') {
    return { valid: false, errors: ['Skeleton must be a non-null object'] };
  }

  // Version
  if (typeof skeleton.version !== 'string') {
    errors.push('Missing or invalid "version" (expected string)');
  }

  // generatedAt
  if (typeof skeleton.generatedAt !== 'string') {
    errors.push('Missing or invalid "generatedAt" (expected ISO date string)');
  }

  // Photos
  if (!skeleton.photos || typeof skeleton.photos !== 'object') {
    errors.push('Missing or invalid "photos" (expected object map)');
  } else {
    for (const [id, photo] of Object.entries(skeleton.photos)) {
      const photoErrors = validatePhoto(id, photo);
      errors.push(...photoErrors);
    }
  }

  // Chapters
  const allPhotoIds = skeleton.photos ? new Set(Object.keys(skeleton.photos)) : new Set();

  if (!Array.isArray(skeleton.chapters)) {
    errors.push('Missing or invalid "chapters" (expected array)');
  } else {
    for (let i = 0; i < skeleton.chapters.length; i++) {
      const chapterErrors = validateChapter(skeleton.chapters[i], i, allPhotoIds);
      errors.push(...chapterErrors);
    }
  }

  // Burst groups (optional — defaults to empty array)
  if (skeleton.burstGroups !== undefined) {
    if (!Array.isArray(skeleton.burstGroups)) {
      errors.push('"burstGroups" must be an array');
    } else {
      const seenIds = new Set(); // a photo can appear in at most one burst group
      for (let i = 0; i < skeleton.burstGroups.length; i++) {
        const groupErrors = validateBurstGroup(skeleton.burstGroups[i], i, allPhotoIds, seenIds);
        errors.push(...groupErrors);
      }
    }
  }

  // Meta
  if (!skeleton.meta || typeof skeleton.meta !== 'object') {
    errors.push('Missing or invalid "meta" (expected object)');
  } else {
    if (typeof skeleton.meta.totalPhotosInput !== 'number') {
      errors.push('meta.totalPhotosInput must be a number');
    }
    if (typeof skeleton.meta.totalChapters !== 'number') {
      errors.push('meta.totalChapters must be a number');
    }
  }

  // No File objects or blob URLs
  const json = JSON.stringify(skeleton);
  if (json.includes('blob:')) {
    errors.push('Skeleton contains blob: URLs — must be fully serialisable');
  }

  return errors.length === 0
    ? { valid: true }
    : { valid: false, errors };
}

function validatePhoto(id, photo) {
  const errors = [];
  const prefix = `photos["${id}"]`;

  if (photo.id !== id) {
    errors.push(`${prefix}.id does not match key`);
  }

  if (typeof photo.name !== 'string') {
    errors.push(`${prefix}.name must be a string`);
  }

  // timestamp: string | null
  if (photo.timestamp !== null && typeof photo.timestamp !== 'string') {
    errors.push(`${prefix}.timestamp must be string or null`);
  }

  // coords: { lat, lng } | null
  if (photo.coords !== null) {
    if (typeof photo.coords !== 'object' || typeof photo.coords.lat !== 'number' || typeof photo.coords.lng !== 'number') {
      errors.push(`${prefix}.coords must be { lat: number, lng: number } or null`);
    }
  }

  // thumbnailUrl: data URL string | null
  if (photo.thumbnailUrl !== null && typeof photo.thumbnailUrl !== 'string') {
    errors.push(`${prefix}.thumbnailUrl must be string (data URL) or null`);
  }
  if (photo.thumbnailUrl && !photo.thumbnailUrl.startsWith('data:')) {
    errors.push(`${prefix}.thumbnailUrl must be a data URL, not a blob URL`);
  }

  // thumbnailHeroUrl: data URL string | null
  if (photo.thumbnailHeroUrl !== null && typeof photo.thumbnailHeroUrl !== 'string') {
    errors.push(`${prefix}.thumbnailHeroUrl must be string (data URL) or null`);
  }

  // thumbnailFailed: boolean
  if (typeof photo.thumbnailFailed !== 'boolean') {
    errors.push(`${prefix}.thumbnailFailed must be a boolean`);
  }

  // qualityScore: number (0-1) | null
  if (photo.qualityScore !== null) {
    if (typeof photo.qualityScore !== 'number' || photo.qualityScore < 0 || photo.qualityScore > 1) {
      errors.push(`${prefix}.qualityScore must be a number 0-1 or null`);
    }
  }

  // No File object references
  if (photo.file !== undefined) {
    errors.push(`${prefix} still contains a File reference — must be stripped`);
  }

  return errors;
}

function validateBurstGroup(group, index, allPhotoIds, seenIds) {
  const errors = [];
  const prefix = `burstGroups[${index}]`;

  if (!group || typeof group !== 'object') {
    errors.push(`${prefix} must be an object`);
    return errors;
  }

  if (typeof group.representativeId !== 'string') {
    errors.push(`${prefix}.representativeId must be a string`);
  } else if (!allPhotoIds.has(group.representativeId)) {
    errors.push(`${prefix}.representativeId "${group.representativeId}" not found in photos`);
  } else if (seenIds.has(group.representativeId)) {
    errors.push(`${prefix}.representativeId "${group.representativeId}" appears in another burst group`);
  } else {
    seenIds.add(group.representativeId);
  }

  if (!Array.isArray(group.candidateIds) || group.candidateIds.length === 0) {
    errors.push(`${prefix}.candidateIds must be a non-empty array`);
  } else {
    for (const cid of group.candidateIds) {
      if (typeof cid !== 'string') {
        errors.push(`${prefix}.candidateIds contains a non-string value`);
        continue;
      }
      if (!allPhotoIds.has(cid)) {
        errors.push(`${prefix}.candidateIds references unknown photo "${cid}"`);
      }
      if (seenIds.has(cid)) {
        errors.push(`${prefix}.candidateIds "${cid}" appears in another burst group`);
      } else {
        seenIds.add(cid);
      }
      if (cid === group.representativeId) {
        errors.push(`${prefix}.candidateIds must not include the representative itself`);
      }
    }
  }

  return errors;
}

function validateChapter(chapter, index, allPhotoIds) {
  const errors = [];
  const prefix = `chapters[${index}]`;

  if (typeof chapter.id !== 'string') {
    errors.push(`${prefix}.id must be a string`);
  }

  if (!Array.isArray(chapter.photoIds) || chapter.photoIds.length === 0) {
    errors.push(`${prefix}.photoIds must be a non-empty array`);
  } else {
    for (const photoId of chapter.photoIds) {
      if (!allPhotoIds.has(photoId)) {
        errors.push(`${prefix}.photoIds references unknown photo "${photoId}"`);
      }
    }
  }

  if (typeof chapter.heroPhotoId !== 'string') {
    errors.push(`${prefix}.heroPhotoId must be a string`);
  } else if (!chapter.photoIds?.includes(chapter.heroPhotoId)) {
    errors.push(`${prefix}.heroPhotoId "${chapter.heroPhotoId}" is not in photoIds`);
  }

  // date: string | null
  if (chapter.date !== null && typeof chapter.date !== 'string') {
    errors.push(`${prefix}.date must be string or null`);
  }

  // coords: { lat, lng } | null
  if (chapter.coords !== null && chapter.coords !== undefined) {
    if (typeof chapter.coords !== 'object' || typeof chapter.coords.lat !== 'number' || typeof chapter.coords.lng !== 'number') {
      errors.push(`${prefix}.coords must be { lat: number, lng: number } or null`);
    }
  }

  return errors;
}
