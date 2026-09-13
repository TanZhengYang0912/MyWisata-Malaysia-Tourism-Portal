interface AdminAiMessageProps {
  role: "user" | "bot";
  text: string;
}

export function AdminAiMessage({ role, text }: AdminAiMessageProps) {
  return (
    <div data-message-role={role} className={`flex w-full ${role === "user" ? "justify-end" : "justify-start"}`}>
      <div className={`w-fit max-w-[85%] break-words rounded-xl px-3 py-2 text-sm whitespace-pre-wrap lg:max-w-3xl ${role === "user" ? "bg-primary text-white" : "bg-background text-foreground shadow-sm"}`}>
        {text}
      </div>
    </div>
  );
}
