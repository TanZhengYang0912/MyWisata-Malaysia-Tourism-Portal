import { spawn, spawnSync } from 'node:child_process';
import {
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  createSecretRedactingWriter,
  extractStripeWebhookSecret,
  upsertEnvValue,
} from './lib/stripe-dev-env.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultEnvPath = path.join(repositoryRoot, '.env.local');
const defaultLockPath = path.join(repositoryRoot, '.next', 'dev-stripe.lock');
const webhookUrl = 'http://localhost:3000/api/stripe/webhook';
const eventTypes = [
  'checkout.session.completed',
  'payment_intent.payment_failed',
  'checkout.session.expired',
].join(',');

export const STRIPE_LISTEN_ARGS = [
  'listen',
  '--skip-update',
  '--color',
  'off',
  '--events',
  eventTypes,
  '--forward-to',
  webhookUrl,
];

export function syncLocalWebhookSecret({ envPath = defaultEnvPath, retrieveSecretOutput } = {}) {
  if (typeof retrieveSecretOutput !== 'function') {
    throw new Error('The active Stripe listener did not provide a signing secret.');
  }

  const secret = extractStripeWebhookSecret(retrieveSecretOutput());
  const existing = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
  const updated = upsertEnvValue(existing, 'STRIPE_WEBHOOK_SECRET', secret);
  const temporaryPath = `${envPath}.tmp-${process.pid}-${Date.now()}`;

  try {
    writeFileSync(temporaryPath, updated, { encoding: 'utf8', mode: 0o600 });
    renameSync(temporaryPath, envPath);
    chmodSync(envPath, 0o600);
  } catch (error) {
    try {
      unlinkSync(temporaryPath);
    } catch (cleanupError) {
      if (cleanupError?.code !== 'ENOENT') throw cleanupError;
    }
    throw error;
  }
}

export function hasExistingStripeListener(processListOutput) {
  return String(processListOutput)
    .split(/\r?\n/)
    .some((line) => /(?:^|\s)stripe\s+listen(?:\s|$)/.test(line) && line.includes(webhookUrl));
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

export function acquireLauncherLock({
  lockPath = defaultLockPath,
  pid = process.pid,
  isProcessAlive: checkProcess = isProcessAlive,
} = {}) {
  mkdirSync(path.dirname(lockPath), { recursive: true });

  const createLock = () => {
    const descriptor = openSync(lockPath, 'wx', 0o600);
    try {
      writeFileSync(descriptor, `${pid}\n`, 'utf8');
    } finally {
      closeSync(descriptor);
    }
  };

  try {
    createLock();
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;

    const existingPid = Number.parseInt(readFileSync(lockPath, 'utf8').trim(), 10);
    if (Number.isInteger(existingPid) && existingPid > 0 && checkProcess(existingPid)) {
      throw new Error(`npm run dev:stripe is already running with PID ${existingPid}.`);
    }

    unlinkSync(lockPath);
    createLock();
  }

  let released = false;
  return {
    release() {
      if (released) return;
      released = true;
      try {
        const ownerPid = Number.parseInt(readFileSync(lockPath, 'utf8').trim(), 10);
        if (ownerPid === pid) unlinkSync(lockPath);
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
    },
  };
}

function assertNoExistingListener() {
  if (process.platform === 'win32') return;

  const result = spawnSync('ps', ['-axo', 'pid=,command='], {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error('Could not inspect local processes before starting Stripe CLI.');
  }
  if (hasExistingStripeListener(result.stdout)) {
    throw new Error('A Stripe listener for the local webhook is already running. Stop it before using this command.');
  }
}

function attachRedactedOutput(stream, write, observe) {
  const writer = createSecretRedactingWriter(write, observe);
  stream.on('data', (chunk) => writer.write(chunk));
  stream.on('end', () => writer.end());
}

function spawnManaged(command, args, observeOutput = () => {}) {
  const child = spawn(command, args, {
    cwd: repositoryRoot,
    detached: process.platform !== 'win32',
    shell: false,
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  attachRedactedOutput(child.stdout, (value) => process.stdout.write(value), observeOutput);
  attachRedactedOutput(child.stderr, (value) => process.stderr.write(value), observeOutput);
  return child;
}

function terminateChild(child, signal) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;

  try {
    if (process.platform === 'win32' || !Number.isInteger(child.pid)) child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error;
  }
}

function run() {
  if (process.argv.length > 2) {
    console.error('[dev:stripe] This command does not accept extra Stripe CLI arguments.');
    process.exitCode = 1;
    return;
  }

  let lock;
  try {
    assertNoExistingListener();
    lock = acquireLauncherLock();
  } catch (error) {
    console.error(`[dev:stripe] ${error.message}`);
    process.exitCode = 1;
    return;
  }

  process.once('exit', () => lock.release());

  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const children = [];
  let next = null;
  let shuttingDown = false;
  let startupTimer;

  const stopChildren = (signal = 'SIGTERM') => {
    if (shuttingDown) return;
    shuttingDown = true;
    if (startupTimer) clearTimeout(startupTimer);
    for (const child of children) terminateChild(child, signal);

    const forceTimer = setTimeout(() => {
      for (const child of children) terminateChild(child, 'SIGKILL');
    }, 5_000);
    forceTimer.unref();
  };

  const watchChild = (name, child) => {
    child.once('error', (error) => {
      if (!shuttingDown) {
        console.error(`[dev:stripe] ${name} failed to start: ${error.message}`);
        process.exitCode = 1;
        stopChildren();
      }
    });

    child.once('exit', (code, signal) => {
      if (!shuttingDown) {
        const reason = signal ? `signal ${signal}` : `exit code ${code ?? 1}`;
        console.error(`[dev:stripe] ${name} stopped (${reason}); stopping the sibling process.`);
        process.exitCode = code === 0 ? 0 : 1;
        stopChildren();
      }
    });
  };

  const observeListenerOutput = (line) => {
    if (next || shuttingDown) return;

    let secret;
    try {
      secret = extractStripeWebhookSecret(line);
    } catch {
      return;
    }

    try {
      syncLocalWebhookSecret({ retrieveSecretOutput: () => secret });
    } catch (error) {
      console.error(`[dev:stripe] ${error.message}`);
      process.exitCode = 1;
      stopChildren();
      return;
    }

    clearTimeout(startupTimer);
    console.log('[dev:stripe] Stripe webhook secret synchronized to .env.local (value redacted).');
    next = spawnManaged(npmCommand, ['run', 'dev']);
    children.push(next);
    watchChild('Next.js dev server', next);
  };

  const listener = spawnManaged('stripe', STRIPE_LISTEN_ARGS, observeListenerOutput);
  children.push(listener);
  watchChild('Stripe listener', listener);

  startupTimer = setTimeout(() => {
    if (!next && !shuttingDown) {
      console.error('[dev:stripe] Stripe listener did not become ready within 30 seconds. Run `stripe login` and retry.');
      process.exitCode = 1;
      stopChildren();
    }
  }, 30_000);
  startupTimer.unref();

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => stopChildren(signal));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run();
}
