import { act } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { installTestDom, type TestDocument, type TestElement } from './render-test-dom';
import { renderToStaticMarkup } from 'react-dom/server';
vi.mock('next/script', async () => {
  const { useEffect, useRef } = await import('react');
  function ScriptMock({ onReady }: { onReady?: () => void }) {
    const readyCallback = useRef(onReady);
    useEffect(() => { readyCallback.current?.(); }, []);
    return null;
  }
  return {
    default: ScriptMock,
  };
});
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { resolvedLanguage: 'en' } }) }));
import { HumanVerification, useHumanVerification } from '../human-verification';

describe('Turnstile render options', () => {
  let document: TestDocument;
  let createRoot: typeof import('react-dom/client').createRoot;
  let container: TestElement;
  let root: ReturnType<typeof createRoot>;
  let turnstile: { render: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };

  beforeAll(async () => {
    document = installTestDom();
    ({ createRoot } = await import('react-dom/client'));
  });

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'public-key');
    container = document.createElement('div');
    document.body.appendChild(container);
    turnstile = { render: vi.fn(() => 'fixture-widget'), remove: vi.fn() };
    Object.defineProperty(document.defaultView, 'turnstile', { configurable: true, value: turnstile });
    root = createRoot(container as unknown as Element);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.removeChild(container);
    vi.unstubAllEnvs();
    Object.defineProperty(document.defaultView, 'turnstile', { configurable: true, value: undefined });
  });

  it('passes interaction-only appearance when the login caller requests it', async () => {
    await act(async () => {
      root.render(<HumanVerification action="login" resetKey={0} onToken={vi.fn()} appearance="interaction-only" showDescription={false} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(turnstile.render).toHaveBeenCalledTimes(1);
    expect(turnstile.render.mock.calls[0][1]).toMatchObject({ appearance: 'interaction-only', execution: 'render' });
  });

  it('preserves the provider default when callers omit appearance', async () => {
    await act(async () => {
      root.render(<HumanVerification action="phone_send" resetKey={0} onToken={vi.fn()} showDescription={false} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(turnstile.render).toHaveBeenCalledTimes(1);
    expect(turnstile.render.mock.calls[0][1]).not.toHaveProperty('appearance');
  });

  it('keeps the login gate closed until Turnstile returns a proof', async () => {
    let verification: ReturnType<typeof useHumanVerification> | undefined;
    function GateProbe() {
      verification = useHumanVerification('login', { manualRefreshAfterUse: true });
      return <div
        data-verified={verification.hasVerifiedOnce ? 'true' : 'false'}
        data-needs-refresh={verification.needsRefresh ? 'true' : 'false'}
        data-rechecking={verification.isRechecking ? 'true' : 'false'}
      />;
    }

    await act(async () => {
      root.render(<GateProbe />);
    });

    const status = container.firstChild as TestElement;
    expect(status.getAttribute('data-verified')).toBe('false');

    await act(async () => {
      verification?.onToken('');
    });
    expect(status.getAttribute('data-verified')).toBe('false');

    await act(async () => {
      verification?.onToken('fixture-proof');
    });
    expect(status.getAttribute('data-verified')).toBe('true');
    expect(status.getAttribute('data-rechecking')).toBe('false');

    let consumedToken = '';
    await act(async () => {
      consumedToken = verification?.takeToken() ?? '';
    });
    expect(consumedToken).toBe('fixture-proof');
    expect(status.getAttribute('data-needs-refresh')).toBe('false');
    expect(status.getAttribute('data-rechecking')).toBe('true');

    await act(async () => {
      verification?.reset();
    });
    expect(status.getAttribute('data-needs-refresh')).toBe('false');
    expect(status.getAttribute('data-rechecking')).toBe('true');

    await act(async () => {
      verification?.onToken('fixture-proof-2');
    });
    expect(status.getAttribute('data-rechecking')).toBe('false');
  });
});

describe('managed verification configuration', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('shows an unavailable state when no site key is configured', () => {
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '');
    const html = renderToStaticMarkup(<HumanVerification action="phone_send" resetKey={0} onToken={vi.fn()} />);
    expect(html).toContain('humanVerification.unavailable');
    expect(html).toContain('role="alert"');
  });
  it('never exposes the server secret in rendered markup', () => {
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'public-key');
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'private-secret');
    const html = renderToStaticMarkup(<HumanVerification action="phone_send" resetKey={0} onToken={vi.fn()} />);
    expect(html).not.toContain('private-secret');
    expect(html).not.toContain('humanVerification.unavailable');
  });
});
