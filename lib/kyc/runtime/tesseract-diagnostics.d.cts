export type TesseractInitializationStage = 'worker_core_load' | 'worker_wasm_initialize' | 'worker_language_load' |
  'worker_api_initialize' | 'worker_set_parameters' | 'worker_error_callback';
export type TesseractFailureReason = 'module_not_found' | 'invalid_worker_path' | 'tesseract_rejected' | 'unknown';

export function classifyTesseractFailure(error: unknown): TesseractFailureReason;
export function initializationStageForTesseractStatus(status: unknown): Exclude<TesseractInitializationStage, 'worker_set_parameters' | 'worker_error_callback'> | undefined;
export function createTesseractInitializationReporter(reportPhase: (stage: TesseractInitializationStage) => void): {
  begin(): void;
  finish(): void;
  onProgress(event: unknown): void;
  onError(_error?: unknown): void;
};
