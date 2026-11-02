/**
 * Pure state derivation for the /pipeline inspector.
 *
 * Every stage panel and every model card resolves to one of:
 *   { kind: 'loading' | 'empty' | 'error' | 'warning', title, body, hint? }
 * or `null` when the content itself should render. Keeping this out of the
 * JSX means each state is unit-tested (pipelineStates.test.js) and the copy
 * lives in one place.
 */

export function modelName(model) {
  return model || 'This model';
}

/**
 * Friendly, actionable copy for a missing model score.
 * @param {string|null} model
 * @param {{ kind: string, status?: number|null, message?: string, retryAfter?: number|null }} error
 */
export function modelErrorCopy(model, error) {
  const name = modelName(model);
  switch (error?.kind) {
    case 'rate_limit': {
      const wait = error.retryAfter ? `about ${error.retryAfter}s` : 'a minute';
      return {
        kind: 'error',
        title: `${name} hit its rate limit (429)`,
        body: `The provider rejected the request because too many were in flight at once. Wait ${wait} and re-run. Scores that already succeeded are cached, so only the misses are re-billed.`,
        hint: 'Lower LLM_CONCURRENCY in server/.env if this keeps happening.',
      };
    }
    case 'not_cached':
      return {
        kind: 'empty',
        title: `No cached score from ${name}`,
        body: 'This demo only replays precomputed results, and there was no cached result for this model on this photo. The live pipeline would score it on the next run.',
      };
    case 'failed':
    default: {
      const detail = error?.message ? `${error.message}${error.status ? ` (HTTP ${error.status})` : ''}. ` : '';
      return {
        kind: 'error',
        title: `${name} didn’t return a score`,
        body: `${detail}This is usually a timeout or a reply that wasn’t valid JSON. Re-run to retry — failures are never cached.`,
      };
    }
  }
}

/**
 * Stage-level state for the aesthetic (vision model) stage.
 * Returns null when there are scores to show and nothing to warn about.
 */
export function aestheticStageState(snap) {
  if (!snap) return null;
  const status = snap.status;

  if (status === 'not_bundled') {
    return {
      kind: 'empty',
      title: 'Model results aren’t bundled in this build',
      body: 'This build was generated without the score cache, so there is nothing to compare yet. Every other stage is real output from the bundled sample photos.',
    };
  }
  if (status === 'demo') {
    return {
      kind: 'empty',
      title: 'Vision scoring is off in demo mode',
      body: 'Demo mode never calls a paid model API. Precomputed scores are shown on /pipeline.',
    };
  }
  if (status === 'unconfigured') {
    return {
      kind: 'empty',
      title: 'The proxy is running but no model is configured',
      body: 'Heroes fell back to the classical sharpness heuristic.',
      hint: 'Set LLM_BASE_URL, LLM_API_KEY and LLM_MODEL (and the _2 variants for a comparison) in server/.env, then re-run.',
    };
  }
  if (status === 'unreachable') {
    return {
      kind: 'empty',
      title: 'The vision proxy isn’t running',
      body: 'No scores this run — heroes fell back to the classical sharpness heuristic.',
      hint: 'Start it with `cd server && npm run dev` (see docs/ai-aesthetic-proxy.md) and re-run.',
    };
  }
  if (status === 'empty' || ((snap.candidateCount ?? 0) === 0 && (snap.scoredCount ?? 0) === 0)) {
    return {
      kind: 'empty',
      title: 'Nothing to score',
      body: 'No photos survived dedup and clustering, so no candidates were sent to a model.',
    };
  }

  const rl = snap.rateLimitedCount ?? 0;
  const failed = snap.failedCount ?? 0;
  const modelErrors = snap.modelErrorCount ?? 0;
  if ((snap.scoredCount ?? 0) === 0 && (rl > 0 || failed > 0)) {
    return rl >= failed
      ? {
        kind: 'error',
        title: 'Every scoring request was rate-limited (429)',
        body: 'The model provider capped concurrent requests. Wait a minute and re-run — nothing was cached for these photos, so they will be retried.',
        hint: 'Lower LLM_CONCURRENCY in server/.env if this keeps happening.',
      }
      : {
        kind: 'error',
        title: 'Scoring failed for every photo',
        body: 'The proxy answered but no model returned a usable score. Check the server log for the provider error, then re-run.',
      };
  }
  if (rl > 0 || failed > 0 || modelErrors > 0) {
    const parts = [];
    if (rl > 0) parts.push(`${rl} photo${rl !== 1 ? 's were' : ' was'} rate-limited (429)`);
    if (failed > 0) parts.push(`${failed} photo${failed !== 1 ? 's' : ''} failed to score`);
    if (!parts.length) parts.push(`${modelErrors} individual model score${modelErrors !== 1 ? 's are' : ' is'} missing`);
    return {
      kind: 'warning',
      title: 'Some scores are missing',
      body: `${parts.join(' and ')}. Select a photo to see which model and why; re-run to retry the misses.`,
    };
  }
  return null;
}

/**
 * Stage-level state for any stage.
 * @param {{ stage: string, snapshots: object, running: boolean, progress?: {stage:string, progress:number, total:number}|null, stageOrder: string[] }} args
 */
export function stageViewState({ stage, snapshots, running, progress, stageOrder }) {
  const snap = snapshots?.[stage];

  if (!snap) {
    if (running) {
      const isCurrent = progress?.stage === stage;
      const pct = isCurrent && progress.total > 0
        ? Math.round((progress.progress / progress.total) * 100)
        : null;
      const idx = stageOrder?.indexOf(stage) ?? -1;
      const prev = idx > 0 ? stageOrder[idx - 1] : null;
      return {
        kind: 'loading',
        title: isCurrent ? 'Running this stage…' : 'Waiting for earlier stages…',
        body: isCurrent
          ? (pct != null ? `${progress.progress} of ${progress.total} done` : 'Starting…')
          : (prev ? `Starts after ${prev} finishes.` : 'Starting…'),
        pct,
      };
    }
    if (stage === 'embedding') {
      return {
        kind: 'empty',
        title: 'Semantic clustering was off for this run',
        body: 'Photos were grouped by calendar day instead of by visual content.',
        hint: 'Turn on “Semantic clustering” and start the CLIP server (docs/ai-embedding-server.md) to compare.',
      };
    }
    return { kind: 'empty', title: 'This stage didn’t run', body: 'An earlier stage stopped the pipeline before it got here.' };
  }

  if (stage === 'aestheticScore') return aestheticStageState(snap);

  if (stage === 'embedding') {
    if (snap.embeddedCount == null || (snap.embeddedCount === 0 && snap.nullCount === 0)) {
      return {
        kind: 'empty',
        title: 'Semantic clustering was off for this run',
        body: 'Photos were grouped by calendar day instead of by visual content.',
      };
    }
    if (snap.embeddedCount === 0) {
      return {
        kind: 'empty',
        title: 'The CLIP embedding server isn’t running',
        body: 'No embeddings this run — clustering fell back to calendar day.',
        hint: 'Start it per docs/ai-embedding-server.md and re-run.',
      };
    }
    return null;
  }

  const count = snap.perPhoto ? Object.keys(snap.perPhoto).length : null;
  if (count === 0) {
    return { kind: 'empty', title: 'No photos reached this stage', body: 'Every photo was filtered out upstream.' };
  }
  return null;
}

/**
 * Head-to-head summary across every photo both models scored: per-model
 * average, how often they agree on keep/skip, and the mean score gap.
 * Only photos where *both* of the first two models returned a score count
 * toward agreement and gap, so a rate-limited slot can't skew the numbers.
 */
export function compareModels(snap) {
  const labels = snap?.modelLabels ?? [];
  const perModel = labels.map((label) => ({ label, n: 0, sum: 0 }));
  let paired = 0;
  let agree = 0;
  let gapSum = 0;
  for (const p of Object.values(snap?.perPhoto ?? {})) {
    const models = p.models ?? [];
    for (const m of models) {
      const row = perModel.find((r) => r.label === m?.model);
      if (row && m.score != null) { row.n++; row.sum += m.score; }
    }
    if (labels.length >= 2) {
      const a = models.find((m) => m?.model === labels[0]);
      const b = models.find((m) => m?.model === labels[1]);
      if (a?.score != null && b?.score != null) {
        paired++;
        gapSum += Math.abs(a.score - b.score);
        if (a.keep != null && b.keep != null && a.keep === b.keep) agree++;
      }
    }
  }
  return {
    models: perModel.map(({ label, n, sum }) => ({ label, n, avg: n ? sum / n : null })),
    paired,
    agree,
    meanGap: paired ? gapSum / paired : null,
  };
}
