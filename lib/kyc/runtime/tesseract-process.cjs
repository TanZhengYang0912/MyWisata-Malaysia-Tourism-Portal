/* eslint-disable @typescript-eslint/no-require-imports */
'use strict';
// Register ownership before loading native libraries or model code.
process.once('disconnect', () => process.exit(1));
process.once('SIGTERM', () => process.exit(1));
process.on('uncaughtException', () => process.exit(1));
process.on('unhandledRejection', () => process.exit(1));
let watchdog = setTimeout(() => process.exit(1), 2000);
let started = false;
process.on('message', async (message) => {
  if (started) return;
  started = true;
  const send = (result) => {
    if (!process.connected) return process.exit(1);
    process.send(result, () => process.exit(0));
  };
  const fail = (failureCode, retryable = false) => send({ ok: false, failureCode, retryable });
  try {
    if (!message || !Number.isSafeInteger(message.timeoutMs) || message.timeoutMs < 1 || message.timeoutMs > 20000) return fail('configuration');
    clearTimeout(watchdog);
    watchdog = setTimeout(() => process.exit(1), message.timeoutMs);
    const { disableNetwork, modelManifest, codes } = require('./tesseract-worker.cjs');
    disableNetwork();
    const sharp = require('sharp');
    const { toOcrLines, extractKycFields } = require('./ocr-fields.cjs');
    const formats = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' };
    const images = [];
    if (!['national_id', 'passport', 'driving_license'].includes(message.documentType)) return fail('evidence_invalid');
    const requiredSides = message.documentType === 'passport' ? ['front'] : ['front', 'back'];
    try {
      for (const sideName of requiredSides) {
        const side = message[sideName];
        if (!side || !formats[side.mimeType] || !(side.bytes instanceof Uint8Array) || !side.bytes.length || side.bytes.length > 5 * 1024 * 1024) return fail('evidence_invalid');
        const decoder = sharp(Buffer.from(side.bytes), { limitInputPixels: 20000000, animated: false });
        const meta = await decoder.metadata();
        if (meta.format !== formats[side.mimeType] || (meta.pages ?? 1) !== 1 || !meta.width || !meta.height || meta.width * meta.height > 20000000) return fail('evidence_invalid');
        images.push(await decoder.rotate().png().toBuffer());
      }
    } catch { return fail('evidence_invalid'); }
    let worker, manifest;
    const begin = performance.now();
    try {
      manifest = await modelManifest();
      const { createWorker, PSM } = require('tesseract.js');
      worker = await createWorker(codes, 1, { workerPath: require.resolve('./tesseract-worker.cjs'),
        langPath: __dirname, cacheMethod: 'none', gzip: true, logging: false, logger: () => {}, errorHandler: () => {} });
      await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO, user_defined_dpi: '150' });
    } catch { return fail('configuration'); }
    const initializationMs = performance.now() - begin;
    let sides;
    try {
      const front = toOcrLines((await worker.recognize(images[0], {}, { text: false, blocks: true })).data);
      const back = requiredSides.includes('back')
        ? toOcrLines((await worker.recognize(images[1], {}, { text: false, blocks: true })).data)
        : [];
      sides = { front, back };
    } catch (error) { return fail(error instanceof Error && error.message === 'invalid_response' ? 'invalid_response' : 'service_unavailable', !(error instanceof Error && error.message === 'invalid_response')); }
    const fields = extractKycFields(sides, message.documentType);
    send({ ok: true, fields, metrics: { initializationMs, childRssBytes: process.memoryUsage().rss, cpu: process.cpuUsage(), manifest } });
    // process.exit after IPC flush ends the worker as well. A terminate Promise
    // alone does not prove that the underlying native thread has stopped.
  } catch { fail('service_unavailable', true); }
});
