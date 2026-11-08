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
    const { toOcrLines, toOcrLayoutV1, extractKycFields, passportFieldRegions } = require('./ocr-fields.cjs');
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
    let recognitionPasses = 0;
    try {
      const data = (await worker.recognize(images[0], {}, { text: false, blocks: true })).data;
      recognitionPasses += 1;
      const front = toOcrLines(data);
      const frontLayout = message.documentType === 'passport' ? toOcrLayoutV1(data, await sharp(images[0]).metadata()) : undefined;
      const back = requiredSides.includes('back')
        ? toOcrLines((await worker.recognize(images[1], {}, { text: false, blocks: true })).data)
        : [];
      if (requiredSides.includes('back')) recognitionPasses += 1;
      sides = { front, back, ...(frontLayout ? { frontLayout } : {}) };
    } catch (error) { return fail(error instanceof Error && error.message === 'invalid_response' ? 'invalid_response' : 'service_unavailable', !(error instanceof Error && error.message === 'invalid_response')); }
    let fields = extractKycFields(sides, message.documentType);
    if (message.documentType === 'passport' && sides.frontLayout && fields.visualMissingFields?.length) {
      const regions = passportFieldRegions(sides.frontLayout, fields.visualMissingFields);
      if (regions.length) {
        await worker.reinitialize('eng', 1);
        await worker.setParameters({ tessedit_pageseg_mode: 7, user_defined_dpi: '300' });
        for (const { bbox } of regions) {
          const crop = await sharp(images[0]).extract({ left: bbox.x0, top: bbox.y0, width: bbox.x1-bbox.x0, height: bbox.y1-bbox.y0 })
            .resize({ width: Math.min(2400, (bbox.x1-bbox.x0)*3) }).png().toBuffer();
          try {
            const meta = await sharp(crop).metadata();
            const data = (await worker.recognize(crop, {}, { text: false, blocks: true })).data;
            recognitionPasses += 1;
            const layout = toOcrLayoutV1(data, meta);
            const sx = (bbox.x1-bbox.x0)/layout.width, sy = (bbox.y1-bbox.y0)/layout.height;
            const transform = (box) => ({ x0: bbox.x0+box.x0*sx, y0: bbox.y0+box.y0*sy, x1: bbox.x0+box.x1*sx, y1: bbox.y0+box.y1*sy });
            for (const line of layout.lines) sides.frontLayout.lines.push({ ...line, bbox: transform(line.bbox),
              ...(line.words ? { words: line.words.map((word)=>({...word,bbox:transform(word.bbox)})) } : {}) });
          } finally { crop.fill(0); }
        }
        fields = extractKycFields(sides, message.documentType);
      }
    }
    send({ ok: true, fields, metrics: { initializationMs, recognitionPasses, childRssBytes: process.memoryUsage().rss, cpu: process.cpuUsage(), manifest } });
    // process.exit after IPC flush ends the worker as well. A terminate Promise
    // alone does not prove that the underlying native thread has stopped.
  } catch { fail('service_unavailable', true); }
});
