const WEBHOOK_SECRET_PREFIX = ['wh', 'sec_'].join('');
const WEBHOOK_SECRET_PATTERN = new RegExp(`${WEBHOOK_SECRET_PREFIX}[A-Za-z0-9_-]+`, 'g');
const ENV_KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/;

export function extractStripeWebhookSecret(output) {
  const matches = [...new Set(String(output).match(WEBHOOK_SECRET_PATTERN) ?? [])];
  if (matches.length !== 1) {
    throw new Error('Stripe CLI did not return exactly one webhook signing secret.');
  }
  return matches[0];
}

export function upsertEnvValue(contents, key, value) {
  if (!ENV_KEY_PATTERN.test(key)) {
    throw new Error('Environment variable key is invalid.');
  }
  if (/[\r\n]/.test(value)) {
    throw new Error('Environment variable value must remain on a single line.');
  }

  const newline = contents.includes('\r\n') ? '\r\n' : '\n';
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const linePattern = new RegExp(`^${escapedKey}=.*$`, 'gm');
  const matches = contents.match(linePattern) ?? [];

  if (matches.length > 1) {
    throw new Error(`${key} is defined more than once.`);
  }
  if (matches.length === 1) {
    return contents.replace(linePattern, `${key}=${value}`);
  }

  const separator = contents.length === 0 || contents.endsWith('\n') ? '' : newline;
  return `${contents}${separator}${key}=${value}${newline}`;
}

export function redactStripeWebhookSecrets(text) {
  return String(text).replace(WEBHOOK_SECRET_PATTERN, '[REDACTED]');
}

export function createSecretRedactingWriter(write, observe = () => {}) {
  let pending = '';

  return {
    write(chunk) {
      pending += String(chunk);
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      for (const line of lines) {
        const completeLine = `${line}\n`;
        observe(completeLine);
        write(redactStripeWebhookSecrets(completeLine));
      }
    },
    end() {
      if (pending) {
        observe(pending);
        write(redactStripeWebhookSecrets(pending));
        pending = '';
      }
    },
  };
}
