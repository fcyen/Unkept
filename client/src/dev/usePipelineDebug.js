import { useCallback, useRef, useState } from 'react';
import { PHASES, runPhase1 } from '../lib/pipeline/orchestrator.js';
import { dedupStage } from '../lib/pipeline/stages/dedup.js';

export const STAGE_ORDER = [
  'exif', 'dedup', 'embedding', 'cluster', 'aestheticScore', 'heroSelect', 'chapterBuilder', 'thumbnail', 'qualityScore',
];

export const STAGE_LABELS = {
  exif: 'EXIF',
  dedup: 'Dedup',
  embedding: 'Embed',
  cluster: 'Cluster',
  aestheticScore: 'Aesthetic',
  heroSelect: 'Hero',
  chapterBuilder: 'Chapters',
  thumbnail: 'Thumbnail',
  qualityScore: 'Quality',
};

export function usePipelineDebug() {
  const [phase, setPhase] = useState(PHASES.IDLE);
  const [progress, setProgress] = useState(null);
  const [snapshots, setSnapshots] = useState({});
  const [error, setError] = useState(null);
  const [useSemanticClustering, setUseSemanticClustering] = useState(false);

  // Object URLs created from File refs right after exif; revoked once thumbnails arrive.
  const previewUrlsRef = useRef(new Map());
  const capturedRef = useRef({});

  const getPreviewUrl = useCallback((id) => previewUrlsRef.current.get(id) ?? null, []);

  const revokeAll = useCallback(() => {
    for (const url of previewUrlsRef.current.values()) URL.revokeObjectURL(url);
    previewUrlsRef.current.clear();
  }, []);

  const reset = useCallback(() => {
    revokeAll();
    setPhase(PHASES.IDLE);
    setProgress(null);
    setSnapshots({});
    setError(null);
    capturedRef.current = {};
  }, [revokeAll]);

  const run = useCallback(async (files) => {
    revokeAll();
    setPhase(PHASES.RUNNING);
    setProgress(null);
    setSnapshots({});
    setError(null);
    capturedRef.current = {};

    const stageStartTimes = {};

    const onStageStart = (name) => {
      stageStartTimes[name] = Date.now();
    };

    const onStageComplete = (name, output) => {
      const timing = stageStartTimes[name] != null ? Date.now() - stageStartTimes[name] : null;

      if (name === 'exif') {
        for (const photo of output) {
          if (photo.file) {
            previewUrlsRef.current.set(photo.id, URL.createObjectURL(photo.file));
          }
        }
      }

      if (name === 'thumbnail') {
        for (const [id, p] of output.photos) {
          if (p.thumbnailUrl && previewUrlsRef.current.has(id)) {
            URL.revokeObjectURL(previewUrlsRef.current.get(id));
            previewUrlsRef.current.delete(id);
          }
        }
      }

      const snapshot = extractSnapshot(name, output);
      snapshot.timing = timing;
      capturedRef.current = { ...capturedRef.current, [name]: snapshot };
      setSnapshots({ ...capturedRef.current });
    };

    try {
      await runPhase1(files, {
        onPhase: setPhase,
        onProgress: (ev) => {
          setProgress(ev);
        },
        onStageStart,
        onStageComplete,
        useSemanticClustering,
      });
    } catch (err) {
      setError(err);
      setPhase(PHASES.ERROR);
    }
  }, [revokeAll, useSemanticClustering]);

  return { phase, progress, snapshots, error, run, reset, getPreviewUrl, revokeAll, useSemanticClustering, setUseSemanticClustering };
}

function extractSnapshot(name, output) {
  switch (name) {
    case 'exif': {
      const perPhoto = {};
      for (const p of output) {
        perPhoto[p.id] = {
          name: p.name,
          size: p.size ?? null,
          timestamp: p.timestamp ?? null,
          date: p.timestamp ? fmtDate(p.timestamp) : null,
          hasGPS: p.coords != null,
          coords: p.coords ?? null,
          make: p.make ?? null,
          model: p.model ?? null,
          lensModel: p.lensModel ?? null,
          iso: p.iso ?? null,
          fNumber: p.fNumber ?? null,
          exposureTime: p.exposureTime ?? null,
          width: p.width ?? null,
          height: p.height ?? null,
          orientation: p.orientation ?? null,
        };
      }
      return { count: output.length, perPhoto };
    }

    case 'dedup': {
      const perPhoto = {};
      const candidatesByRep = {};
      for (const p of output.burstCandidates) {
        const repId = p._matchedRepId ?? null;
        perPhoto[p.id] = {
          status: 'burst',
          score: p._hammingDistance ?? null,
          matchedRepId: repId,
          dHashThumbnailUrl: p._dHashThumbnailUrl ?? null,
        };
        if (repId) {
          if (!candidatesByRep[repId]) candidatesByRep[repId] = [];
          candidatesByRep[repId].push({ id: p.id, dist: p._hammingDistance ?? null });
        }
      }
      for (const p of (output.rejectedExact ?? [])) {
        perPhoto[p.id] = { status: 'exact', score: null };
      }
      for (const p of output.photos) {
        perPhoto[p.id] = {
          status: 'kept',
          score: p._nearestDistance ?? null,
          candidates: candidatesByRep[p.id] ?? null,
          dHashThumbnailUrl: p._dHashThumbnailUrl ?? null,
        };
      }
      return {
        keptCount: output.photos.length,
        exactCount: (output.rejectedExact ?? []).length,
        burstCount: output.burstCandidates.length,
        perPhoto,
      };
    }

    case 'embedding': {
      const photos = output.photos ?? [];
      const perPhoto = {};
      let embeddedCount = 0;
      let nullCount = 0;
      for (const p of photos) {
        const hasEmbed = p.embedding != null;
        if (hasEmbed) embeddedCount++; else nullCount++;
        perPhoto[p.id] = { embedded: hasEmbed };
      }
      return { embeddedCount, nullCount, perPhoto };
    }

    case 'cluster': {
      const clusters = Array.isArray(output) ? output : output.clusters;
      const perPhoto = {};
      for (let i = 0; i < clusters.length; i++) {
        for (const p of clusters[i]) {
          perPhoto[p.id] = {
            clusterIdx: i,
            clusterSize: clusters[i].length,
            date: p.timestamp ? fmtDate(p.timestamp) : null,
          };
        }
      }
      return { clusterCount: clusters.length, perPhoto };
    }

    case 'aestheticScore': {
      const clusters = output.clusters ?? [];
      const perPhoto = {};
      const scores = [];
      const modelLabels = [];
      let scoredCount = 0;
      let skippedCount = 0;
      for (const cluster of clusters) {
        for (const p of cluster) {
          const hasScore = p.aestheticScore != null;
          const models = p.aestheticModels ?? null;
          perPhoto[p.id] = {
            score: p.aestheticScore ?? null,
            keep: p.aestheticKeep ?? null,
            reason: p.aestheticReason ?? null,
            models,
          };
          // Collect the distinct model labels (in first-seen order) so the
          // comparison panel can show stable column headers.
          if (models) {
            for (const m of models) {
              if (m?.model && !modelLabels.includes(m.model)) modelLabels.push(m.model);
            }
          }
          if (hasScore) {
            scoredCount++;
            scores.push(p.aestheticScore);
          } else {
            skippedCount++;
          }
        }
      }
      scores.sort((a, b) => a - b);
      const avg = scores.length
        ? Math.round((scores.reduce((s, v) => s + v, 0) / scores.length) * 1000) / 1000
        : null;
      return {
        scoredCount,
        skippedCount,
        avgScore: avg,
        minScore: scores.length ? scores[0] : null,
        maxScore: scores.length ? scores[scores.length - 1] : null,
        modelLabels,
        perPhoto,
      };
    }

    case 'heroSelect': {
      const { heroIds, clusters } = output;
      const perPhoto = {};
      for (const cluster of clusters) {
        for (const p of cluster) {
          perPhoto[p.id] = { isHero: heroIds.has(p.id) };
        }
      }
      return { heroCount: heroIds.size, perPhoto };
    }

    case 'chapterBuilder': {
      const perPhoto = {};
      const chapterPhotoIds = new Set();
      for (let i = 0; i < output.chapters.length; i++) {
        const ch = output.chapters[i];
        for (const id of ch.photoIds) {
          perPhoto[id] = {
            chapterIdx: i,
            chapterId: ch.id,
            isHero: id === ch.heroPhotoId,
            role: 'selected',
          };
          chapterPhotoIds.add(id);
        }
      }
      for (const [id] of output.photos) {
        if (!perPhoto[id]) {
          perPhoto[id] = { chapterIdx: null, chapterId: null, isHero: false, role: 'burst-only' };
        }
      }
      return {
        chapterCount: output.chapters.length,
        selectedCount: chapterPhotoIds.size,
        perPhoto,
      };
    }

    case 'thumbnail': {
      const perPhoto = {};
      for (const [id, p] of output.photos) {
        perPhoto[id] = {
          status: p.thumbnailFailed ? 'failed' : 'ok',
          thumbnailUrl: p.thumbnailUrl ?? null,
          // Capture _rawVariance here — qualityScore stage deletes it during its run.
          rawVariance: p._rawVariance ?? null,
        };
      }
      const vals = Object.values(perPhoto);
      return {
        generatedCount: vals.filter((v) => v.status === 'ok').length,
        failedCount: vals.filter((v) => v.status === 'failed').length,
        perPhoto,
      };
    }

    case 'qualityScore': {
      const perPhoto = {};
      const scores = [];
      for (const [id, p] of output.photos) {
        perPhoto[id] = { score: p.qualityScore ?? null };
        if (p.qualityScore != null) scores.push(p.qualityScore);
      }
      scores.sort((a, b) => a - b);
      const avg = scores.length
        ? Math.round((scores.reduce((s, v) => s + v, 0) / scores.length) * 1000) / 1000
        : null;
      return {
        scoredCount: scores.length,
        avgScore: avg,
        minScore: scores.length ? scores[0] : null,
        maxScore: scores.length ? scores[scores.length - 1] : null,
        perPhoto,
      };
    }

    default:
      return {};
  }
}

function fmtDate(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
