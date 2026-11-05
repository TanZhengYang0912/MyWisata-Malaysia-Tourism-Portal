/** Synthetic-only, offline engine feasibility measurement. Never reads KYC evidence or app secrets. */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import sharp from 'sharp';
import ts from 'typescript';
import { fixtureSvg } from '../../lib/kyc/runtime/ocr-synthetic-fixtures.cjs';

const require = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Presence of synthetic expected text only: no identity/authenticity judgement. */
export function summarizeOcrSample(text, expected) {
  const normalized = (value) => value.normalize('NFKC').replace(/[-\s]/g, '').toUpperCase();
  const actual = normalized(text);
  return { namePresent: actual.includes(normalized(expected.name)), numberPresent: actual.includes(normalized(expected.number)) };
}
export function summarizeDurations(values) {
  if (!values.length) return { samples: 0, meanMs: null, medianMs: null, maxMs: null };
  const sorted = [...values].sort((a, b) => a - b);
  const round = (value) => Math.round(value * 10) / 10;
  const middle = Math.floor(sorted.length / 2);
  return { samples: values.length, meanMs: round(values.reduce((a, b) => a + b, 0) / values.length),
    medianMs: round(sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2), maxMs: round(sorted.at(-1)) };
}

export async function loadExistingEvidencePreparation() {
  // Reuse the exact server implementation. Only remove the server-only bundler
  // marker and resolve its bundler alias and installed sharp import for Node.
  const source = await fs.readFile(path.join(repo, 'lib/kyc/evidence-image.ts'), 'utf8');
  const compilerOptions = { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 };
  const tokenSource = await fs.readFile(path.join(repo, 'lib/i18n/invariant-tokens.ts'), 'utf8');
  const tokenModule = ts.transpileModule(tokenSource, { compilerOptions }).outputText;
  const tokenUrl = `data:text/javascript;base64,${Buffer.from(tokenModule).toString('base64')}`;
  const compiled = ts.transpileModule(source, { compilerOptions }).outputText
    .replace(/import ['"]server-only['"];?\s*/, '')
    .replace(/from ['"]sharp['"]/, `from ${JSON.stringify(pathToFileURL(require.resolve('sharp')).href)}`)
    .replace(/from ['"]@\/lib\/i18n\/invariant-tokens['"]/, `from ${JSON.stringify(tokenUrl)}`);
  return (await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)).prepareKycEvidenceImage;
}


export function disableNetwork() {
  const restores = [];
  const deny = () => { throw new Error('offline_ocr_network_denied'); };
  const replace = (object, key, value) => { const original = object[key]; object[key] = value; restores.push(() => { object[key] = original; }); };
  replace(globalThis, 'fetch', async () => deny());
  for (const protocol of ['node:http', 'node:https']) {
    const protocolModule = require(protocol); replace(protocolModule, 'request', deny); replace(protocolModule, 'get', deny);
  }
  const net = require('node:net');
  replace(net.Socket.prototype, 'connect', deny);
  replace(net, 'connect', deny); replace(net, 'createConnection', deny);
  return () => restores.reverse().forEach((restore) => restore());
}

export async function createLocalOcrContext(runtimeRoot) {
  const runtime = path.resolve(runtimeRoot);
  const localRequire = createRequire(path.join(runtime, 'package.json'));
  const { createWorker, createScheduler, PSM } = localRequire('tesseract.js');
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'mywisata-private-ocr-'));
  const instances = new Set();
  try {
  for (const code of ['eng', 'msa', 'chi_sim']) {
    const packagePath = path.dirname(localRequire.resolve(`@tesseract.js-data/${code}/package.json`));
    await fs.writeFile(path.join(temporary, `${code}.traineddata`), gunzipSync(await fs.readFile(path.join(packagePath, `4.0.0_best_int/${code}.traineddata.gz`))));
  }
  const workerBootstrap = path.join(temporary, 'offline-worker.cjs');
  const actualWorkerPath = path.join(path.dirname(localRequire.resolve('tesseract.js/package.json')), 'src/worker-script/node/index.js');
  await fs.writeFile(workerBootstrap, `const deny=()=>{throw new Error('offline_ocr_network_denied')};global.fetch=async()=>deny();for(const protocol of ['node:http','node:https']){const m=require(protocol);m.request=deny;m.get=deny;}const net=require('node:net');net.Socket.prototype.connect=deny;net.connect=deny;net.createConnection=deny;require(${JSON.stringify(actualWorkerPath)});`);
  return {
    version: localRequire('tesseract.js/package.json').version,
    createScheduler,
    async makeWorker(codes) {
      const instance = await createWorker(codes, 1, { workerPath: workerBootstrap, langPath: temporary, cachePath: temporary, cacheMethod: 'none', gzip: false, logger: () => {} });
      instances.add(instance);
      await instance.setParameters({ tessedit_pageseg_mode: PSM.AUTO, user_defined_dpi: '150' });
      return instance;
    },
    async close() {
      await Promise.allSettled([...instances].map((instance) => instance.terminate()));
      await fs.rm(temporary, {recursive:true,force:true});
    },
  };
  } catch { await fs.rm(temporary,{recursive:true,force:true}); throw new Error('local_ocr_initialization_failed'); }
}

export async function runLocalBenchmark(runtimeRoot) {
  const context = await createLocalOcrContext(runtimeRoot);
  const { createScheduler, makeWorker } = context;
  const prepare = await loadExistingEvidencePreparation();
  const expected = { name: 'NAMA CONTOH UJIAN', number: '990101140001' };
  const front = await sharp(fixtureSvg('front', expected.name, '990101-14-0001')).png().toBuffer();
  const back = await sharp(fixtureSvg('back', expected.name, '990101-14-0001')).png().toBuffer();
  const [preparedFront, preparedBack] = await Promise.all([prepare(front, 'image/png'), prepare(back, 'image/png')]);
  const scenarios = [
    { name: 'clean-reference-synthetic-only', front: preparedFront.ocr, back: preparedBack.ocr },
    { name: 'existing-watermark', front: preparedFront.stored, back: preparedBack.stored },
    { name: 'watermarked-900px-jpeg75',
      front: await sharp(preparedFront.stored).resize(900).jpeg({quality:75}).toBuffer(),
      back: await sharp(preparedBack.stored).resize(900).jpeg({quality:75}).toBuffer() },
    { name: 'watermarked-tilt4deg-blur1.4',
      front: await sharp(preparedFront.stored).rotate(4,{background:'#fff'}).blur(1.4).jpeg({quality:75}).toBuffer(),
      back: await sharp(preparedBack.stored).rotate(4,{background:'#fff'}).blur(1.4).jpeg({quality:75}).toBuffer() },
    { name: 'watermarked-simulated-glare-obscures-number',
      front: await sharp(preparedFront.stored).composite([{input:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1120"><rect x="80" y="665" width="1420" height="110" fill="white" fill-opacity="0.99"/></svg>')}]).png().toBuffer(),
      back: await sharp(preparedBack.stored).composite([{input:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1120"><rect x="80" y="665" width="1420" height="110" fill="white" fill-opacity="0.99"/></svg>')}]).png().toBuffer() },
  ];
  const chineseExpected = { name: '测试样本姓名', number: expected.number };
  const chineseFront = (await prepare(await sharp(fixtureSvg('front', chineseExpected.name, '990101-14-0001')).png().toBuffer(), 'image/png')).stored;
  const report = { engine: 'tesseract.js', version: context.version, node: process.version,
    platform: `${os.platform()}-${os.arch()}`, cpu: os.cpus()[0]?.model, machineMemoryMiB: Math.round(os.totalmem()/1048576),
    syntheticOnly: true, offlineRecognition: true, imagePixels: [1800,1120], observations: [], parallel: null,
    limits: ['No real evidence or real photographed-card accuracy measured', 'Synthetic expected-field presence is not authentication or a false-accept estimate',
      'Mac measurements do not certify Hostinger', 'Local batch sizes and worker counts are test conditions, not production settings'] };
  let worker;
  let scheduler;
  let peakRss = process.memoryUsage().rss;
  const rssTimer = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss); }, 100);
  const restoreNetwork = disableNetwork();
  const measurePair = async (instance, scenario) => {
    const started = performance.now();
    const frontResult = await instance.recognize(scenario.front);
    const frontMs = performance.now()-started;
    const backStarted = performance.now();
    const backResult = await instance.recognize(scenario.back);
    return { frontMs, backMs: performance.now()-backStarted, pairMs: performance.now()-started,
      frontFields: summarizeOcrSample(frontResult.data.text, expected), backNumberPresent: summarizeOcrSample(backResult.data.text, expected).numberPresent };
  };
  try {
    let started = performance.now();
    worker = await makeWorker(['eng','msa']);
    report.coldStartMs = Math.round(performance.now()-started);
    console.log(`LOCAL_OCR_ENGINE_READY ${JSON.stringify({version:report.version,coldStartMs:report.coldStartMs,languages:['eng','msa'],offline:true})}`);
    for (const scenario of scenarios) {
      const samples = [];
      for (let repeat=0; repeat<3; repeat+=1) samples.push(await measurePair(worker, scenario));
      const observation = { scenario: scenario.name, front: summarizeDurations(samples.map((sample)=>sample.frontMs)),
        back: summarizeDurations(samples.map((sample)=>sample.backMs)), pair: summarizeDurations(samples.map((sample)=>sample.pairMs)),
        namePresent: samples.filter((sample)=>sample.frontFields.namePresent).length,
        frontNumberPresent: samples.filter((sample)=>sample.frontFields.numberPresent).length,
        backNumberPresent: samples.filter((sample)=>sample.backNumberPresent).length };
      report.observations.push(observation);
      console.log(`LOCAL_OCR_OBSERVATION ${JSON.stringify(observation)}`);
    }
    await worker.terminate(); worker=null;
    started=performance.now();
    worker=await makeWorker(['eng','msa','chi_sim']);
    report.chineseColdStartMs=Math.round(performance.now()-started);
    const chineseSamples=[];
    for(let repeat=0;repeat<3;repeat+=1){ const begin=performance.now(); const result=await worker.recognize(chineseFront); chineseSamples.push({ms:performance.now()-begin,...summarizeOcrSample(result.data.text,chineseExpected)}); }
    report.chinese={languageCodes:['eng','msa','chi_sim'],front:summarizeDurations(chineseSamples.map((sample)=>sample.ms)),namePresent:chineseSamples.filter((sample)=>sample.namePresent).length,numberPresent:chineseSamples.filter((sample)=>sample.numberPresent).length};
    console.log(`LOCAL_OCR_CHINESE ${JSON.stringify(report.chinese)}`);
    await worker.terminate(); worker=null;
    scheduler=createScheduler();
    const workers=await Promise.all([makeWorker(['eng','msa']),makeWorker(['eng','msa'])]);
    workers.forEach((instance)=>scheduler.addWorker(instance));
    const batchStart=performance.now();
    const pairTimes=[];
    let matchingPairs=0;
    const cpuStart=process.cpuUsage();
    await Promise.all(Array.from({length:8},async()=>{
      const begin=performance.now();
      const frontResult=await scheduler.addJob('recognize',preparedFront.stored);
      const backResult=await scheduler.addJob('recognize',preparedBack.stored);
      pairTimes.push(performance.now()-begin);
      const fields=summarizeOcrSample(frontResult.data.text,expected);
      if(fields.namePresent&&fields.numberPresent&&summarizeOcrSample(backResult.data.text,expected).numberPresent) matchingPairs+=1;
    }));
    const cpu=process.cpuUsage(cpuStart);
    report.parallel={workers:2,cases:8,images:16,wallMs:Math.round(performance.now()-batchStart),queuedPairLatency:summarizeDurations(pairTimes),matchingSyntheticPairs:matchingPairs,cpuSeconds:Math.round((cpu.user+cpu.system)/1000)/1000};
    await scheduler.terminate(); scheduler=null;
    report.peakProcessRssMiB=Math.round(peakRss/1048576);
    console.log(`LOCAL_OCR_REPORT ${JSON.stringify(report)}`);
    return report;
  } finally {
    clearInterval(rssTimer);
    if(worker) await worker.terminate();
    if(scheduler) await scheduler.terminate();
    restoreNetwork();
    await context.close();
  }
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const runtime=process.argv[2]??'/tmp/mywisata-private-ocr-runtime';
  await runLocalBenchmark(runtime);
}
