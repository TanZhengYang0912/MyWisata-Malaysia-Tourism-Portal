#!/usr/bin/env node
/**
 * Disposable PostgreSQL 17 regression checks for Support ticket concurrency.
 * This runner starts its own loopback-only Docker database and never accepts
 * a Supabase, FYP, or caller-provided database target.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;
const root = process.cwd();
const container = `mylawatan-support-concurrency-${process.pid}-${Date.now()}`;
const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), `${container}-`));
const password = 'support-local-only';
const clients = [];
let containerStarted = false;

const customerId = '00000000-0000-4000-8000-000000000001';
const adminId = '00000000-0000-4000-8000-000000000002';
const otherCustomerId = '00000000-0000-4000-8000-000000000003';
const sharedOperationId = '30000000-0000-4000-8000-000000000001';
const reopenTicketId = '10000000-0000-4000-8000-000000000006';
const lockedReplyTicketId = '10000000-0000-4000-8000-000000000002';
const fanoutTicketId = '10000000-0000-4000-8000-000000000007';
const sharedPayloadHash = 'a'.repeat(64);

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function runDocker(args) {
  return execFileSync('docker', args, { encoding: 'utf8' }).trim();
}

function rejectExternalDatabaseTargets() {
  const targetVariables = ['DATABASE_URL', 'SUPABASE_DB_URL', 'SUPPORT_TEST_DATABASE_URL'];
  const configuredTargets = targetVariables.filter((name) => process.env[name]);
  if (configuredTargets.length > 0) {
    throw new Error('Refusing inherited database target variables; this test creates its own disposable database.');
  }
}

function requireLocalDockerDaemon() {
  const hostOverride = process.env.DOCKER_HOST;
  if (hostOverride && !/^(unix|npipe):\/\//.test(hostOverride)) {
    throw new Error('Refusing non-local Docker host; this test only supports a local Docker daemon.');
  }
  const context = process.env.DOCKER_CONTEXT || runDocker(['context', 'show']);
  const endpoint = runDocker(['context', 'inspect', context, '--format', '{{.Endpoints.docker.Host}}']);
  if (!/^(unix|npipe):\/\//.test(endpoint)) {
    throw new Error('Refusing non-local Docker context; this test only supports a local Docker daemon.');
  }
}

async function waitForPostgres(config) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const client = new Client(config);
    try {
      await client.connect();
      await client.end();
      return;
    } catch {
      await client.end().catch(() => {});
      await sleep(250);
    }
  }
  throw new Error('The disposable PostgreSQL 17 container did not become ready.');
}

async function installExistingFixture() {
  runDocker(['exec', container, 'mkdir', '-p', '/tmp/support/migrations', '/tmp/support/tests']);
  const fixturePath = path.join(root, 'supabase/tests/support_ticket_transactions_local.sql');
  let fixture = fs.readFileSync(fixturePath, 'utf8');
  const migrationNames = [...fixture.matchAll(/^\\ir \.\.\/migrations\/(.+)$/gm)].map((match) => match[1]);
  assert.ok(migrationNames.length > 0, 'The existing SQL fixture must identify its migrations.');

  for (const migrationName of migrationNames) {
    const source = path.join(root, 'supabase/migrations', migrationName);
    runDocker(['cp', source, `${container}:/tmp/support/migrations/${migrationName}`]);
  }

  // Keep the fixture's ../migrations includes valid by preserving the
  // original tests/ and migrations/ directory relationship in the container.
  fixture = fixture.replace(/\nROLLBACK;\s*$/, '\nCOMMIT;\n');
  assert.match(fixture, /\nCOMMIT;\n$/);

  const temporaryFixture = path.join(tempDirectory, 'support_ticket_transactions_local.sql');
  fs.writeFileSync(temporaryFixture, fixture);
  runDocker(['cp', temporaryFixture, `${container}:/tmp/support/tests/support_ticket_transactions_local.sql`]);
  runDocker([
    'exec', container, 'psql', '-U', 'postgres', '-d', 'postgres',
    '-v', 'ON_ERROR_STOP=1', '-f', '/tmp/support/tests/support_ticket_transactions_local.sql',
  ]);

  const operationsPath = path.join(root, 'supabase/tests/support_operations.sql');
  const operationsRoleClaim = `SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);`;
  let operationsFixture = fs.readFileSync(operationsPath, 'utf8');
  assert.ok(operationsFixture.includes(operationsRoleClaim), 'The operation fixture must set its service-role JWT claim.');
  operationsFixture = operationsFixture.replace(
    operationsRoleClaim,
    `${operationsRoleClaim}\nSELECT set_config('request.jwt.claim.role', 'service_role', true);`,
  );
  const authUserSeed = "INSERT INTO auth.users (id) VALUES (current_setting('support_operations.owner_id')::uuid);";
  assert.ok(operationsFixture.includes(authUserSeed), 'The operation fixture must create its synthetic auth user.');
  operationsFixture = operationsFixture.replace(
    authUserSeed,
    `${authUserSeed}\nINSERT INTO public.users (id, email, full_name)\nVALUES (current_setting('support_operations.owner_id')::uuid, 'support-operations-fixture@example.test', 'Support fixture');`,
  );
  const temporaryOperationsFixture = path.join(tempDirectory, 'support_operations.sql');
  fs.writeFileSync(temporaryOperationsFixture, operationsFixture);
  runDocker(['cp', temporaryOperationsFixture, `${container}:/tmp/support/tests/support_operations.sql`]);
  runDocker([
    'exec', container, 'psql', '-U', 'postgres', '-d', 'postgres',
    '-v', 'ON_ERROR_STOP=1', '-f', '/tmp/support/tests/support_operations.sql',
  ]);
}

async function connectTestClients(config) {
  const a = new Client({ ...config, application_name: 'support-concurrency-a' });
  const b = new Client({ ...config, application_name: 'support-concurrency-b' });
  const observer = new Client({ ...config, application_name: 'support-concurrency-observer' });
  clients.push(a, b, observer);
  await Promise.all(clients.map((client) => client.connect()));

  for (const client of [a, b]) {
    await client.query("SELECT set_config('request.jwt.claim.role', 'service_role', false)");
    await client.query('SET ROLE service_role');
  }
  return { a, b, observer };
}

async function reserveOperation(client, operationId, payloadHash) {
  const result = await client.query(
    `SELECT public.reserve_support_operation(
      $1::uuid, $2, $3::uuid, NULL, 'reopen', $4, 120
    ) AS value`,
    [operationId, `user:${customerId}`, customerId, payloadHash],
  );
  return result.rows[0].value;
}

async function waitForLock(observer, applicationName) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = await observer.query(
      `SELECT 1 FROM pg_stat_activity
        WHERE application_name = $1 AND wait_event_type = 'Lock'`,
      [applicationName],
    );
    if (result.rowCount > 0) return;
    await sleep(50);
  }
  throw new Error(`Expected PostgreSQL lock wait was not observed for ${applicationName}.`);
}

async function verifyConcurrentOperationReservation({ a, b, observer }) {
  await a.query('BEGIN');
  const first = await reserveOperation(a, sharedOperationId, sharedPayloadHash);
  assert.equal(first.created, true);
  assert.equal(first.shouldExecute, true);

  await b.query('BEGIN');
  const secondPromise = reserveOperation(b, sharedOperationId, sharedPayloadHash)
    .then((value) => ({ value }), (error) => ({ error }));
  await waitForLock(observer, 'support-concurrency-b');
  await a.query('COMMIT');

  const second = await secondPromise;
  assert.ok(!second.error, second.error?.message);
  assert.equal(second.value.created, false);
  assert.equal(second.value.shouldExecute, false);
  assert.equal(second.value.state, 'running');
  await b.query('COMMIT');

  const count = await observer.query(
    'SELECT count(*)::int AS value FROM public.support_operations WHERE id = $1',
    [sharedOperationId],
  );
  assert.equal(count.rows[0].value, 1);
  console.log('PASS: concurrent same-ID reservations produced one row and one execution lease.');
  return first.leaseToken;
}

async function verifyOperationReplayAndAccess({ a, b, observer, leaseToken }) {
  await observer.query(
    `INSERT INTO public.support_tickets (id, user_id, subject, body, status, assigned_to)
     VALUES ($1, $2, 'Concurrent reopen', 'Synthetic fixture', 'resolved', $3)`,
    [reopenTicketId, customerId, adminId],
  );

  const reopened = await a.query(
    `SELECT public.reopen_support_ticket(
      $1::uuid, $2::uuid, $3::uuid, $4, $5::uuid
    ) AS value`,
    [sharedOperationId, reopenTicketId, customerId, sharedPayloadHash, leaseToken],
  );
  assert.equal(reopened.rows[0].value.changed, true);

  const replay = await reserveOperation(b, sharedOperationId, sharedPayloadHash);
  assert.equal(replay.state, 'completed');
  assert.equal(replay.shouldExecute, false);
  const conflict = await reserveOperation(b, sharedOperationId, 'b'.repeat(64)).then(() => null, (error) => error);
  assert.equal(conflict?.code, '23505');
  assert.equal(conflict?.message, 'support_operation_conflict');

  const notifications = await observer.query(
    `SELECT count(*)::int AS value FROM public.notifications
      WHERE link = '/admin/support?ticket=' || $1::text
        AND type = 'support_ticket_reopened'`,
    [reopenTicketId],
  );
  assert.equal(notifications.rows[0].value, 1);

  await observer.query('BEGIN');
  await observer.query('SET LOCAL ROLE authenticated');
  await observer.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [otherCustomerId]);
  const readError = await observer.query('SELECT id FROM public.support_operations LIMIT 1').then(() => null, (error) => error);
  await observer.query('ROLLBACK');
  assert.equal(readError?.code, '42501');
  console.log('PASS: payload conflict, completed replay, single reopen notice, and direct table access denial.');
}

async function verifyCloseReplyRace({ a, b, observer }) {
  await a.query('BEGIN');
  await a.query('SELECT id FROM public.support_tickets WHERE id = $1 FOR UPDATE', [lockedReplyTicketId]);
  await a.query(
    "UPDATE public.support_tickets SET status = 'closed', resolved_at = now() WHERE id = $1",
    [lockedReplyTicketId],
  );

  const replyOperationId = '30000000-0000-4000-8000-000000000002';
  const replyPromise = b.query(
    `SELECT public.commit_support_ticket_reply(
      $1::uuid, $2::uuid, 'customer', 'Concurrent customer reply', $3::uuid, $4
    )`,
    [lockedReplyTicketId, customerId, replyOperationId, 'c'.repeat(64)],
  ).then((value) => ({ value }), (error) => ({ error }));
  await waitForLock(observer, 'support-concurrency-b');
  await a.query('COMMIT');

  const result = await replyPromise;
  assert.equal(result.error?.message, 'support_ticket_locked');
  const replyCount = await observer.query(
    'SELECT count(*)::int AS value FROM public.support_ticket_replies WHERE operation_id = $1',
    [replyOperationId],
  );
  assert.equal(replyCount.rows[0].value, 0);
  console.log('PASS: customer reply waited behind close and was rejected without an inserted reply.');
}

async function verifyRecipientEventDeduplication({ a, b, observer }) {
  await observer.query(
    `INSERT INTO public.support_tickets (id, user_id, subject, body, status)
     VALUES ($1, $2, 'Notification fanout', 'Synthetic fixture', 'open')`,
    [fanoutTicketId, customerId],
  );

  const operationId = '30000000-0000-4000-8000-000000000003';
  const payloadHash = 'd'.repeat(64);
  const response = await a.query(
    `SELECT public.commit_support_ticket_reply(
      $1::uuid, $2::uuid, 'customer', 'Synthetic customer response', $3::uuid, $4
    ) AS value`,
    [fanoutTicketId, customerId, operationId, payloadHash],
  );
  const replyId = response.rows[0].value.id;
  const link = `/admin/support?ticket=${fanoutTicketId}`;
  const recipients = await observer.query(
    `SELECT count(*)::int AS notifications,
            count(DISTINCT user_id)::int AS recipients,
            count(DISTINCT event_key)::int AS event_keys,
            bool_and(event_key = 'support_reply:' || $2::text || ':' || user_id::text) AS recipient_scoped
       FROM public.notifications
      WHERE link = $1 AND type = 'support_reply'`,
    [link, replyId],
  );
  assert.deepEqual(recipients.rows[0], {
    notifications: 2,
    recipients: 2,
    event_keys: 2,
    recipient_scoped: true,
  });

  await observer.query(
    `INSERT INTO public.notifications (user_id, type, title, body, link, event_key)
     SELECT user_id, type, title, body, link, event_key
       FROM public.notifications
      WHERE link = $1 AND type = 'support_reply'
     ON CONFLICT (event_key) WHERE event_key IS NOT NULL DO NOTHING`,
    [link],
  );
  const retry = await b.query(
    `SELECT public.commit_support_ticket_reply(
      $1::uuid, $2::uuid, 'customer', 'Synthetic customer response', $3::uuid, $4
    ) AS value`,
    [fanoutTicketId, customerId, operationId, payloadHash],
  );
  assert.equal(retry.rows[0].value.created, false);
  const noticeCount = await observer.query(
    `SELECT count(*)::int AS value FROM public.notifications
      WHERE link = $1 AND type = 'support_reply'`,
    [link],
  );
  assert.equal(noticeCount.rows[0].value, 2);
  console.log('PASS: per-recipient event keys deduplicated across duplicate inserts and reply replay.');
}

async function main() {
  rejectExternalDatabaseTargets();
  requireLocalDockerDaemon();
  runDocker([
    'run', '--rm', '-d', '--name', container,
    '-e', `POSTGRES_PASSWORD=${password}`,
    '-p', '127.0.0.1::5432', 'postgres:17-alpine',
  ]);
  containerStarted = true;

  const portMatch = runDocker(['port', container, '5432/tcp']).match(/127\.0\.0\.1:(\d+)/);
  assert.ok(portMatch, 'PostgreSQL must be exposed on loopback only.');
  const config = {
    host: '127.0.0.1',
    port: Number(portMatch[1]),
    user: 'postgres',
    password,
    database: 'postgres',
    connectionTimeoutMillis: 1000,
  };
  await waitForPostgres(config);
  await installExistingFixture();

  const sessions = await connectTestClients(config);
  const leaseToken = await verifyConcurrentOperationReservation(sessions);
  await verifyOperationReplayAndAccess({ ...sessions, leaseToken });
  await verifyCloseReplyRace(sessions);
  await verifyRecipientEventDeduplication(sessions);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await Promise.allSettled(clients.map((client) => client.query('ROLLBACK')));
  await Promise.allSettled(clients.map((client) => client.end()));
  if (containerStarted) {
    try { runDocker(['rm', '-f', container]); } catch {}
  }
  fs.rmSync(tempDirectory, { recursive: true, force: true });
}
