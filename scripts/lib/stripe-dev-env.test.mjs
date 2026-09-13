import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import os from 'node:os';
import path from 'node:path';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const helperPath = path.join(testDirectory, 'stripe-dev-env.mjs');
const repositoryRoot = path.resolve(testDirectory, '..', '..');
const launcherPath = path.join(repositoryRoot, 'scripts', 'dev-stripe.mjs');
const secretPrefix = ['wh', 'sec_'].join('');

async function loadHelpers() {
  return import(pathToFileURL(helperPath).href);
}

test('provides the Stripe development environment helper module', () => {
  assert.equal(existsSync(helperPath), true);
});

test('extracts exactly one webhook signing secret without returning surrounding output', async () => {
  const { extractStripeWebhookSecret } = await loadHelpers();
  const secret = `${secretPrefix}abc123`;
  assert.equal(extractStripeWebhookSecret(`Ready: ${secret}\n`), secret);
  assert.throws(() => extractStripeWebhookSecret('Ready without a secret'), /signing secret/i);
  assert.throws(
    () => extractStripeWebhookSecret(`${secretPrefix}first ${secretPrefix}second`),
    /signing secret/i,
  );
});

test('updates only STRIPE_WEBHOOK_SECRET and preserves the rest of the env file', async () => {
  const { upsertEnvValue } = await loadHelpers();
  const secret = `${secretPrefix}replacement`;
  const original = [
    'NEXT_PUBLIC_APP_URL=http://localhost:3000',
    `STRIPE_WEBHOOK_SECRET=${secretPrefix}old`,
    'EMAIL_FROM=MyLawatan App <hello@example.com>',
    '',
  ].join('\n');

  assert.equal(
    upsertEnvValue(original, 'STRIPE_WEBHOOK_SECRET', secret),
    [
      'NEXT_PUBLIC_APP_URL=http://localhost:3000',
      `STRIPE_WEBHOOK_SECRET=${secret}`,
      'EMAIL_FROM=MyLawatan App <hello@example.com>',
      '',
    ].join('\n'),
  );
});

test('appends a missing env value with one trailing newline', async () => {
  const { upsertEnvValue } = await loadHelpers();
  const secret = `${secretPrefix}new`;
  assert.equal(
    upsertEnvValue('NEXT_PUBLIC_APP_URL=http://localhost:3000', 'STRIPE_WEBHOOK_SECRET', secret),
    `NEXT_PUBLIC_APP_URL=http://localhost:3000\nSTRIPE_WEBHOOK_SECRET=${secret}\n`,
  );
});

test('rejects env values that could inject an additional line', async () => {
  const { upsertEnvValue } = await loadHelpers();
  assert.throws(
    () => upsertEnvValue('', 'STRIPE_WEBHOOK_SECRET', `${secretPrefix}safe\nEXTRA=value`),
    /single line/i,
  );
});

test('redacts complete and chunk-split webhook secrets before writing listener output', async () => {
  const { createSecretRedactingWriter, redactStripeWebhookSecrets } = await loadHelpers();
  const secret = `${secretPrefix}abc_123-test`;
  assert.equal(redactStripeWebhookSecrets(`secret=${secret}`), 'secret=[REDACTED]');

  const writes = [];
  const observed = [];
  const writer = createSecretRedactingWriter(
    (value) => writes.push(value),
    (value) => observed.push(value),
  );
  writer.write(`Ready: ${secretPrefix}abc`);
  assert.deepEqual(writes, []);
  writer.write('_123-test\nforwarding\n');
  writer.end();

  assert.equal(writes.join(''), 'Ready: [REDACTED]\nforwarding\n');
  assert.equal(writes.join('').includes(secret), false);
  assert.equal(observed[0].includes(secret), true);
});

test('synchronizes the local secret with owner-only file permissions', async () => {
  assert.equal(existsSync(launcherPath), true);
  const { syncLocalWebhookSecret } = await import(pathToFileURL(launcherPath).href);
  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), 'mywisata-stripe-dev-'));
  const envPath = path.join(temporaryDirectory, '.env.local');
  const secret = `${secretPrefix}localonly`;

  syncLocalWebhookSecret({
    envPath,
    retrieveSecretOutput: () => `listener signing secret: ${secret}\n`,
  });

  assert.equal(readFileSync(envPath, 'utf8'), `STRIPE_WEBHOOK_SECRET=${secret}\n`);
  assert.equal(statSync(envPath).mode & 0o777, 0o600);
});

test('defines the filtered listener and package entry points', async () => {
  const { STRIPE_LISTEN_ARGS } = await import(pathToFileURL(launcherPath).href);
  assert.deepEqual(STRIPE_LISTEN_ARGS, [
    'listen',
    '--skip-update',
    '--color',
    'off',
    '--events',
    'checkout.session.completed,payment_intent.payment_failed,checkout.session.expired',
    '--forward-to',
    'http://localhost:3000/api/stripe/webhook',
  ]);

  const packageJson = JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));
  assert.equal(packageJson.scripts['dev:stripe'], 'node scripts/dev-stripe.mjs');
  assert.equal(packageJson.scripts['test:dev-stripe'], 'node --test scripts/lib/stripe-dev-env.test.mjs');
  assert.doesNotMatch(readFileSync(launcherPath, 'utf8'), /--print-secret/);
});

test('detects an already-running matching listener without matching unrelated Stripe commands', async () => {
  const { hasExistingStripeListener } = await import(pathToFileURL(launcherPath).href);
  const matching = '60113 stripe listen --events checkout.session.completed --forward-to http://localhost:3000/api/stripe/webhook';
  const unrelated = '60114 stripe events list --limit 10';
  assert.equal(hasExistingStripeListener(`${matching}\n${unrelated}\n`), true);
  assert.equal(hasExistingStripeListener(`${unrelated}\n`), false);
});

test('uses an owner-specific lock and permits recovery from a stale lock', async () => {
  const { acquireLauncherLock } = await import(pathToFileURL(launcherPath).href);
  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), 'mywisata-stripe-lock-'));
  const lockPath = path.join(temporaryDirectory, 'dev-stripe.lock');
  const first = acquireLauncherLock({ lockPath, pid: 101, isProcessAlive: (value) => value === 101 });

  assert.throws(
    () => acquireLauncherLock({ lockPath, pid: 202, isProcessAlive: (value) => value === 101 }),
    /already running/i,
  );
  first.release();

  const stalePath = path.join(temporaryDirectory, 'stale.lock');
  writeFileSync(stalePath, '303\n', { mode: 0o600 });
  const recovered = acquireLauncherLock({ lockPath: stalePath, pid: 404, isProcessAlive: () => false });
  assert.equal(readFileSync(stalePath, 'utf8'), '404\n');
  recovered.release();
});

test('documents one-command local development and fixed hosted webhooks', () => {
  const readme = readFileSync(path.join(repositoryRoot, 'README.md'), 'utf8');
  assert.match(readme, /npm run dev:stripe/);
  assert.match(readme, /Stripe Dashboard/i);
  assert.match(readme, /STRIPE_WEBHOOK_SECRET/);
  assert.match(readme, /api\/stripe\/webhook/);
});
