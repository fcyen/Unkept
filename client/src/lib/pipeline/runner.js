/**
 * Pipeline runner — chains processing stages in order, emitting progress events.
 *
 * Each stage is a function: (input, options, onProgress) => output
 * The runner passes the output of one stage as input to the next.
 */

/**
 * @param {Array<{ name: string, fn: Function, options?: object }>} stages
 * @param {*} initialInput - input to the first stage
 * @param {(event: { stage: string, stageIndex: number, totalStages: number, progress: number, total: number }) => void} onProgress
 * @returns {Promise<*>} - output of the last stage
 */
export async function runPipeline(stages, initialInput, onProgress) {
  let data = initialInput;
  const totalStages = stages.length;

  for (let i = 0; i < stages.length; i++) {
    const { name, fn, options = {} } = stages[i];

    const stageProgress = (progress, total) => {
      if (onProgress) {
        onProgress({ stage: name, stageIndex: i, totalStages, progress, total });
      }
    };

    data = await fn(data, options, stageProgress);
  }

  return data;
}
