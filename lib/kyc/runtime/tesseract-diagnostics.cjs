'use strict';

const initializationStages = new Map([
  ['loading tesseract core', 'worker_core_load'],
  ['initializing tesseract', 'worker_wasm_initialize'],
  ['loading language traineddata', 'worker_language_load'],
  ['initializing api', 'worker_api_initialize'],
]);

function initializationStageForTesseractStatus(status) {
  return typeof status === 'string' ? initializationStages.get(status) : undefined;
}

function createTesseractInitializationReporter(reportPhase) {
  let isActive = false;
  const reportedStages = new Set();
  const reportOnce = (stage) => {
    if (reportedStages.has(stage)) return;
    reportedStages.add(stage);
    reportPhase(stage);
  };

  return {
    begin() { isActive = true; },
    finish() { isActive = false; },
    onProgress(event) {
      if (!isActive || !event || typeof event !== 'object') return;
      const stage = initializationStageForTesseractStatus(event.status);
      if (stage) reportOnce(stage);
    },
    onError() {
      if (isActive && reportedStages.size === 0) reportOnce('worker_error_callback');
    },
  };
}

module.exports = { initializationStageForTesseractStatus, createTesseractInitializationReporter };
