/** Local application-stage experiment, not a host/OCR-model capacity certificate. */
import { afterEach, expect, it, vi } from 'vitest';
import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { summarizeMeasurements } from '../lib/kyc-capacity-evaluation.mjs';

const boundary = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('@/backend/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => boundary.db }));
import { GET } from '@/app/api/search/route';
import { prepareKycEvidenceImage } from '@/lib/kyc/evidence-image';
import { processKycPrescreening } from '@/lib/kyc/prescreening';
import { extractKycFieldsInNode } from '@/lib/kyc/node-ocr-engine';
import { fixtureSvg } from '@/lib/kyc/runtime/ocr-synthetic-fixtures.cjs';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
type Row = Record<string, unknown>;

function ilikeMatch(value: unknown, pattern: string) {
  return String(value ?? '').toLowerCase().includes(pattern.replace(/%/g, '').toLowerCase());
}

function syntheticCatalogue() {
  const outlet = { id: 'synthetic-outlet', vendor_id: 'synthetic-vendor', name: 'Penang outlet',
    city: 'George Town', state: 'Penang', status: 'active', review_status: 'approved',
    lat: 5.4, lng: 100.3, operating_hours: null, vendors: { name: 'Synthetic vendor', slug: 'synthetic', status: 'approved' } };
  const products = Array.from({ length: 500 }, (_, index) => ({ id: `synthetic-${index}`, vendor_id: 'synthetic-vendor',
    outlet_id: outlet.id, name: `Penang synthetic activity ${index}`, base_price: 12, requires_booking: true,
    status: 'active', review_status: 'approved', created_at: '2026-01-01', categories: { name: 'Activity', slug: 'activity' },
    outlet_offers: [], product_variants: [], price_rules: [] }));
  const rows: Record<string, Row[]> = { products, outlets: [outlet], outlet_offers: [],
    categories: [{ id: 'synthetic-category', name: 'Activity', slug: 'activity' }],
    vendors: [{ id: 'synthetic-vendor', name: 'Penang synthetic vendor', kind: 'shop', status: 'approved', outlets: [outlet] }],
    product_review_metrics: products.map(product => ({ product_id: product.id, rating: 4, reviews: 1 })) };
  let queries = 0;
  return {
    count: () => queries,
    from(table: string) {
      if (!rows[table]) throw new Error(`unexpected synthetic table: ${table}`);
      let result = rows[table];
      let rangeStart = 0;
      let rangeEnd = Number.POSITIVE_INFINITY;
      const builder = {
        select: (_fields: string) => builder,
        eq: (key: string, value: unknown) => { result = result.filter(row => row[key] === value); return builder; },
        in: (key: string, values: unknown[]) => { result = result.filter(row => values.includes(row[key])); return builder; },
        // Global search narrows candidates with ilike filters before loading them.
        ilike: (key: string, pattern: string) => { result = result.filter(row => ilikeMatch(row[key], pattern)); return builder; },
        or: (filters: string) => {
          const conditions = filters.split(',').map(part => part.split('.ilike.'));
          result = result.filter(row => conditions.some(([key, pattern]) => ilikeMatch(row[key], pattern)));
          return builder;
        },
        limit: (count: number) => { rangeEnd = Math.min(rangeEnd, rangeStart + count - 1); return builder; },
        order: (key: string, options?: { ascending?: boolean }) => {
          const direction = options?.ascending === false ? -1 : 1;
          result = [...result].sort((left, right) => String(left[key]).localeCompare(String(right[key])) * direction);
          return builder;
        },
        range: (from: number, to: number) => { rangeStart = from; rangeEnd = to; return builder; },
        then: async (resolve: (value: { data: Row[]; error: null }) => unknown) => {
          queries += 1;
          await sleep(2); // Explicit fixture delay; never presented as DB measurement.
          return resolve({ data: result.slice(rangeStart, rangeEnd + 1), error: null });
        },
      };
      return builder;
    },
  };
}

it('measures bounded browsing with real image preparation/worker and synthetic external boundaries', async () => {
  const settings = {
    KYC_PRESCREENING_ENABLED: 'true', KYC_PRESCREENING_BATCH_SIZE: '1', KYC_PRESCREENING_MAX_RUNNING: '1',
    KYC_PRESCREENING_LEASE_SECONDS: '60', KYC_PRESCREENING_MAX_ATTEMPTS: '2', KYC_PRESCREENING_RETRY_SECONDS: '60',
    KYC_PRESCREENING_DRAIN_ENABLED: 'false', KYC_IC_HMAC_KEY: 'synthetic-local-hmac-key',
    KYC_PRIVATE_OCR_URL: 'http://127.0.0.1:1/synthetic-ocr', KYC_PRIVATE_OCR_TOKEN: 'synthetic-local-token-only',
    KYC_PRIVATE_OCR_TIMEOUT_MS: '1000', KYC_PRIVATE_OCR_MIN_CONFIDENCE: '',
  };
  for (const [key, value] of Object.entries(settings)) vi.stubEnv(key, value);
  let ocrCalls = 0;
  vi.stubGlobal('fetch', async (input: string | URL, init?: RequestInit) => {
    expect(String(input)).toBe(settings.KYC_PRIVATE_OCR_URL);
    expect(init?.method).toBe('POST');
    ocrCalls += 1;
    return Response.json({ unreadable: true, confidence: 0 });
  });
  const image = await sharp({ create: { width: 5000, height: 4000, channels: 3, background: '#e8edf2' } }).jpeg().toBuffer();

  async function phase(withKyc: boolean) {
    const catalogue = syntheticCatalogue();
    boundary.db = catalogue;
    const latencies: number[] = [];
    const preparation: number[] = [];
    let completedJobs = 0;
    let peakRss = process.memoryUsage().rss;
    const sampler = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss); }, 20);
    const start = performance.now();
    const summaries: Awaited<ReturnType<typeof processKycPrescreening>>[] = [];
    const kyc = async () => {
      for (let index = 0; index < 4; index += 1) {
        const before = performance.now();
        const [front, back] = await Promise.all([
          prepareKycEvidenceImage(image, 'image/jpeg'), prepareKycEvidenceImage(image, 'image/jpeg'),
        ]);
        preparation.push(performance.now() - before);
        let claimed = false;
        const service = {
          rpc: async (name: string, args: Record<string, unknown>) => {
            if (name === 'claim_kyc_prescreening_jobs') {
              expect(claimed).toBe(false);
              expect(args.p_limit).toBe(1);
              claimed = true;
              return { data: [{ id: `synthetic-job-${index}`, submissionId: `synthetic-case-${index}`, leaseToken: 'synthetic-lease',
                documentType: 'national_id', expectedDocumentNumberHmac: 'a'.repeat(64), expectedHolderName: null,
                documents: [{ side: 'front', path: 'synthetic/front', mimeType: 'image/jpeg' }, { side: 'back', path: 'synthetic/back', mimeType: 'image/jpeg' }] }], error: null };
            }
            expect(name).toBe('finish_kyc_prescreening_job');
            expect(args.p_result).toMatchObject({ status: 'unreadable' });
            completedJobs += 1;
            return { data: true, error: null };
          },
          storage: { from: (bucket: string) => {
            expect(bucket).toBe('kyc-documents');
            return { download: async (key: string) => {
              const bytes = key === 'synthetic/front' ? front.stored : back.stored;
              return { data: new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }), error: null };
            } };
          } },
        };
        summaries.push(await processKycPrescreening(service as unknown as Parameters<typeof processKycPrescreening>[0]));
      }
    };
    const jobs = withKyc ? kyc() : Promise.resolve();
    const active = new Set<Promise<void>>();
    const reads: Promise<void>[] = [];
    let skipped = 0;
    try {
      for (let index = 0; index < 30; index += 1) {
        await sleep(Math.max(0, start + index * 50 - performance.now()));
        if (active.size >= 4) { skipped += 1; continue; }
        const read = (async () => {
          const before = performance.now();
          const response = await GET(new Request('http://127.0.0.1/api/search?q=Penang'));
          expect(response.status).toBe(200);
          const data = await response.json();
          expect(data.experiences).toHaveLength(5);
          expect(data.vendors).toHaveLength(1);
          latencies.push(performance.now() - before);
        })();
        active.add(read); reads.push(read);
        void read.then(() => active.delete(read), () => active.delete(read));
      }
      await Promise.all([jobs, ...reads]);
      expect(skipped).toBe(0);
      expect(completedJobs).toBe(withKyc ? 4 : 0);
      for (const summary of summaries) expect(summary).toMatchObject({ claimed: 1, acknowledged: 1, ocrProcessed: 1, unavailable: 0, writeErrors: 0 });
      return { withKyc, readAttempts: 30, completedReads: latencies.length, skipped,
        searchLatencyMs: summarizeMeasurements(latencies), imagePairPreparationMs: summarizeMeasurements(preparation),
        completedMachineJobs: completedJobs, humanApprovals: 0, simulatedDbQueries: catalogue.count(),
        nodeRssSampleMaxMiB: Math.round(peakRss / 1024 / 1024), elapsedMs: Math.round(performance.now() - start) };
    } finally {
      clearInterval(sampler);
      await Promise.allSettled([jobs, ...reads]);
    }
  }
  const baseline = await phase(false);
  const mixed = await phase(true);
  expect(ocrCalls).toBe(4);
  const report = { experiment: 'local_real_application_stages_synthetic_boundaries', baseline, mixed,
    scope: 'Handler invocations, no HTTP/proxy/upload transport; real catalogue logic, Sharp watermark, worker/OCR contract. DB/Storage/OCR transport are synthetic. No model inference, real identity, remote services or host capacity certification.' };
  console.log(JSON.stringify(report));
  if (process.env.MYLAWATAN_RECORD_MIXED_WORKLOAD === '1') {
    await writeFile('/tmp/mywisata-mixed-workload-20261021.json', JSON.stringify(report, null, 2), { mode: 0o600 });
  }
}, 20_000);

it('measures bounded search arrivals alongside a real offline OCR child', async () => {
  const image = await prepareKycEvidenceImage(await sharp(fixtureSvg('front', 'SYNTHETIC PERSON', '990101-14-0001')).png().toBuffer(), 'image/png');
  const part = { mimeType: 'image/png', bytes: new Uint8Array(image.stored) };
  const phases = [];
  for (const withOcr of [false, true]) {
    boundary.db = syntheticCatalogue();
    const start = performance.now(), reads: Promise<void>[] = [], active = new Set<Promise<void>>(), latencies: number[] = [];
    let skipped = 0, parentRssBytes = process.memoryUsage().rss;
    const sampler = setInterval(() => { parentRssBytes = Math.max(parentRssBytes, process.memoryUsage().rss); }, 20);
    const ocr = withOcr ? extractKycFieldsInNode({ documentType: 'national_id', front: part, back: part }, 20000) : Promise.resolve(null);
    try {
      for (let index = 0; index < 20; index += 1) {
        await sleep(Math.max(0, start + index * 50 - performance.now()));
        if (active.size >= 4) { skipped += 1; continue; }
        const read = (async () => {
          const begin = performance.now();
          expect((await GET(new Request('http://127.0.0.1/api/search?q=Penang'))).status).toBe(200);
          latencies.push(performance.now() - begin);
        })();
        active.add(read); reads.push(read); void read.finally(() => active.delete(read));
      }
      await Promise.all(reads);
      const engine = await ocr;
      if (withOcr) expect(engine?.ok).toBe(true);
      phases.push({ withOcr, attempts: 20, completed: latencies.length, skipped, searchLatencyMs: summarizeMeasurements(latencies),
        parentRssBytes, childRssBytes: engine?.ok ? engine.metrics.childRssBytes : null, elapsedMs: performance.now() - start });
    } finally { clearInterval(sampler); await Promise.allSettled([ocr, ...reads]); }
  }
  const report = { node: process.version, scope: 'local synthetic catalogue boundaries, real offline OCR; no host or human capacity claim', phases };
  await mkdir('output/kyc-node-ocr', { recursive: true });
  await writeFile('output/kyc-node-ocr/mixed-real.json', JSON.stringify(report, null, 2) + '\n');
}, 30000);
