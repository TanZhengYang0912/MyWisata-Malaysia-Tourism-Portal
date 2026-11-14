'use strict';

const initializationStages = new Map([
  ['loading tesseract core', 'worker_core_load'],
  ['initializing tesseract', 'worker_wasm_initialize'],
  ['loading language traineddata', 'worker_language_load'],
  ['initializing api', 'worker_api_initialize'],
]);
function classifyTesseractFailure(error) {
  const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : '';
  const message = typeof error === 'string' ? error : error instanceof Error ? error.message : '';
  if (code === 'ERR_WORKER_PATH' || /ERR_WORKER_PATH/.test(message)) return 'invalid_worker_path';
  if (code === 'MODULE_NOT_FOUND' || code === 'ERR_MODULE_NOT_FOUND' || /Cannot find (?:module|package)|MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND/.test(message)) return 'module_not_found';
  if (/initialization failed/i.test(message)) return 'tesseract_rejected';
  return 'unknown';
}

function initializationStageForTesseractStatus(status) {
  return typeof status === 'string' ? initializationStages.get(status) : undefined;
}

function bridgeTesseractWorkerEvents(worker, reportPhase) {
  let hasFailed = false;
  const fail = (error) => {
    if (hasFailed) return;
    hasFailed = true;
    reportPhase('worker_error_callback');
    if (typeof worker.onerror === 'function') worker.onerror(error);
  };

  worker.once('error', fail);
  worker.once('exit', (code) => {
    if (code !== 0) fail(new Error('worker_thread_exit'));
  });
  return worker;
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

module.exports = { bridgeTesseractWorkerEvents, classifyTesseractFailure, initializationStageForTesseractStatus, createTesseractInitializationReporter };
