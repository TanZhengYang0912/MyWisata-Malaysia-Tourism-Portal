import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

describe('AI writing assistant integration', () => {
  it('provides a consistent generate, preview, apply, and discard contract', () => {
    const source = read('components/vendor/ai-writing-assistant.tsx');
    expect(source).toContain('Generate with AI');
    expect(source).toContain('assistant.applyDraft');
    expect(source).toContain('assistant.discard');
  });

  it('is wired into all four approved first-phase surfaces', () => {
    for (const path of [
      'app/vendor/profile/page.tsx',
      'components/vendor/product-form.tsx',
      'components/vendor/outlet-builder-inspector.tsx',
      'components/customer/chat-thread-panel.tsx',
    ]) {
      expect(read(path), path).toContain('AiWritingAssistant');
    }
    expect(read('app/vendor/inbox/page.tsx')).toContain('/ai/content');
    expect(read('components/vendor/outlet-page-builder.tsx')).toContain('/ai/content');
  });
});
