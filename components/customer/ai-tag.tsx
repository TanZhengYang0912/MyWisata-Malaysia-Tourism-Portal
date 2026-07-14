import { Sparkles } from "lucide-react";

export function AiTag({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-ai-purple-surface px-2 py-0.5 font-[family-name:var(--font-mono)] text-[10px] font-bold text-ai-purple">
      <Sparkles size={9} /> {text}
    </span>
  );
}
