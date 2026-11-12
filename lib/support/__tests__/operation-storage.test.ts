import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSessionOperationId, readSessionOperationId, saveSessionOperationId, supportAttachmentOperationStorageKey } from '../operation-storage';

describe('support session operation storage', () => {
  let values: Map<string, string>;

  beforeEach(() => {
    values = new Map();
    vi.stubGlobal('window', {
      sessionStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value); },
        removeItem: (key: string) => { values.delete(key); },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('scopes attachment references by surface, actor, and ticket', () => {
    expect(supportAttachmentOperationStorageKey('customer', 'actor-1', 'ticket-1'))
      .toBe('mw_support_attachment_operation:customer:actor-1:ticket-1');
    expect(supportAttachmentOperationStorageKey('admin', 'actor-1', 'ticket-1'))
      .not.toBe(supportAttachmentOperationStorageKey('customer', 'actor-1', 'ticket-1'));
    expect(supportAttachmentOperationStorageKey('customer', 'actor-2', 'ticket-1'))
      .not.toBe(supportAttachmentOperationStorageKey('customer', 'actor-1', 'ticket-1'));
  });

  it('accepts only UUID references and clears only the expected operation', () => {
    values.set('reply', '11111111-1111-4111-8111-111111111111');
    expect(readSessionOperationId('reply')).toBe('11111111-1111-4111-8111-111111111111');
    expect(readSessionOperationId('missing')).toBeNull();
    values.set('malformed', 'not-an-operation-id');
    expect(readSessionOperationId('malformed')).toBeNull();

    clearSessionOperationId('reply', '22222222-2222-4222-8222-222222222222');
    expect(values.get('reply')).toBe('11111111-1111-4111-8111-111111111111');
    clearSessionOperationId('reply', '11111111-1111-4111-8111-111111111111');
    expect(values.has('reply')).toBe(false);
  });

  it('reports blocked writes without throwing', () => {
    vi.stubGlobal('window', {
      get sessionStorage() { throw new DOMException('blocked', 'SecurityError'); },
    });

    expect(saveSessionOperationId('attachment', '11111111-1111-4111-8111-111111111111')).toBe(false);
    expect(readSessionOperationId('attachment')).toBeNull();
    expect(() => clearSessionOperationId('attachment', '11111111-1111-4111-8111-111111111111')).not.toThrow();
  });
});
