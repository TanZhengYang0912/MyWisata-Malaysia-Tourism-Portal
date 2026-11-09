import React, { act } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { findOne, installTestDom, TestEvent, type TestDocument, type TestElement, type TestNode } from '@/components/shared/__tests__/render-test-dom';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import { KycPhotoPreview } from '../kyc-photo-preview';

let document: TestDocument;
let createRoot: typeof import('react-dom/client').createRoot;
let root: ReturnType<typeof createRoot>;
let container: TestElement;
const file = new File(['photo'], 'passport.jpg', { type: 'image/jpeg' });

describe('KYC photo framing confirmation', () => {
  beforeAll(async () => {
    document = installTestDom();
    ({ createRoot } = await import('react-dom/client'));
  });

  beforeEach(() => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:kyc-photo');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container as unknown as HTMLElement);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    document.body.removeChild(container as unknown as TestNode);
    vi.restoreAllMocks();
  });

  it('shows passport-specific confirmation and returns the controlled checkbox value', async () => {
    const onConfirmationChange = vi.fn();
    await act(async () => {
      root.render(<KycPhotoPreview file={file} label="Passport data page" documentType="passport" confirmed={false} onConfirmationChange={onConfirmationChange} />);
    });
    await act(async () => { await Promise.resolve(); });

    const confirmation = findOne(container, (element) => element.tagName === 'INPUT' && element.type === 'checkbox');
    const checkbox = confirmation as TestElement & { checked: boolean };
    expect(container.textContent).toContain('ui.kyc.confirmPassportFrame');
    expect(checkbox.checked).toBe(false);

    await act(async () => {
      checkbox.checked = true;
      confirmation.dispatchEvent(new TestEvent('click', { bubbles: true }));
    });

    expect(onConfirmationChange).toHaveBeenCalledWith(true);
  });
});
