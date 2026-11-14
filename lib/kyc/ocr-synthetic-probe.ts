import 'server-only';
import sharp from 'sharp';
import { fixtureSvg } from './runtime/ocr-synthetic-fixtures.cjs';
import { prepareKycEvidenceImage } from './evidence-image';
import { extractKycFieldsInNode, type NodeKycOcrOutcome } from './node-ocr-engine';
import { kycOcrRuntimeConfiguration } from './ocr';

export async function runKycSyntheticProbe() {
  const configuration = kycOcrRuntimeConfiguration();
  if (configuration?.engine !== 'tesseract-js') throw new Error('probe_unconfigured');
  const begin = performance.now();
  const image = async (side: 'front' | 'back') => ({ mimeType: 'image/png', bytes: new Uint8Array((await prepareKycEvidenceImage(
    await sharp(fixtureSvg(side, 'SYNTHETIC PERSON', '990101-14-0001')).png().toBuffer(), 'image/png')).stored) });
  const result = await extractKycFieldsInNode({ documentType: 'national_id', front: await image('front'), back: await image('back') }, configuration.timeoutMs);
  if (!result.ok) return { ok: false, failureCode: result.failureCode,
    ...(result.failureStage ? { failureStage: result.failureStage } : {}),
    ...(result.failureReason ? { failureReason: result.failureReason } : {}) } satisfies Pick<Extract<NodeKycOcrOutcome, { ok: false }>, 'ok' | 'failureCode' | 'failureStage' | 'failureReason'>;
  const fieldsRead = result.fields.documentNumber === '990101140001' && result.fields.holderName === 'SYNTHETIC PERSON';
  return { ok: fieldsRead, fieldsRead, node: process.version, manifest: result.metrics.manifest,
    initializationMs: result.metrics.initializationMs, totalMs: performance.now() - begin,
    parentRssBytes: process.memoryUsage().rss, childRssBytes: result.metrics.childRssBytes,
    cpuMicroseconds: result.metrics.cpu.user + result.metrics.cpu.system, successes: fieldsRead ? 1 : 0, errors: fieldsRead ? 0 : 1 };
}
