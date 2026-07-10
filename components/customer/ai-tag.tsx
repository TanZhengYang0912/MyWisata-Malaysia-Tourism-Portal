import { Sparkles } from "lucide-react";

export function AiTag({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-accent text-foreground font-[family-name:var(--font-mono)]">
      <Sparkles size={9} /> {text}
    </span>
  );
}
