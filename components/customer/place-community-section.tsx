"use client";

import { MapPin, MessageCircle, Send, Shield, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { PlaceComment, PlaceCommentsPage } from "@/backend/core/types";

const PAGE_SIZE = 6;

function formatRelativeTime(
  dateString: string,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diffSec = Math.floor((now - then) / 1000);

  if (diffSec < 60) return t("ui.place.localNotes.justNow");
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return t("ui.place.localNotes.minutesAgo", { count: diffMin });
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return t("ui.place.localNotes.hoursAgo", { count: diffHours });
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return t("ui.place.localNotes.daysAgo", { count: diffDays });
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(dateString));
}

export function PlaceCommunitySection({ placeId, placeName }: { placeId: string; placeName: string }) {
  const { t, i18n } = useTranslation("customer");
  const { currentUser } = useAuth();
  const router = useRouter();
  const [comments, setComments] = useState<PlaceComment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [body, setBody] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadComments(targetPage: number, append = false) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/places/${placeId}/comments?page=${targetPage}&pageSize=${PAGE_SIZE}`, { cache: "no-store" });
      const payload = await response.json() as { data?: PlaceCommentsPage; error?: { message?: string } };
      if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? "Could not load local notes");
      setComments((previous) => append ? [...previous, ...payload.data!.items] : payload.data!.items);
      setTotal(payload.data.total);
      setPage(targetPage);
    } catch {
      setError(t("ui.place.localNotes.loadError"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Defer the request so this effect subscribes to a new place rather than
    // synchronously driving a render during React's effect flush.
    void Promise.resolve().then(() => loadComments(1));
  // Loading needs to restart only when the displayed place changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeId]);

  async function submitNote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentUser) {
      router.push("/login");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const response = await fetch(`/api/places/${placeId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, isAnonymous }),
      });
      const payload = await response.json() as { data?: PlaceComment; error?: { message?: string } };
      if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? "Could not publish local note");
      setComments((previous) => [payload.data!, ...previous]);
      setTotal((previous) => previous + 1);
      setBody("");
    } catch {
      setError(t("ui.place.localNotes.publishError"));
    } finally {
      setSending(false);
    }
  }

  async function deleteNote(commentId: string) {
    setError(null);
    try {
      const response = await fetch(`/api/places/${placeId}/comments`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commentId }),
      });
      if (!response.ok) throw new Error("Could not delete local note");
      setComments((previous) => previous.filter((comment) => comment.id !== commentId));
      setTotal((previous) => Math.max(0, previous - 1));
    } catch {
      setError(t("ui.place.localNotes.deleteError"));
    }
  }

  return (
    <section className="mt-10 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6" aria-labelledby="local-notes-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">{t("ui.place.localNotes.eyebrow")}</p>
          <h2 id="local-notes-heading" className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-foreground">
            {t("ui.place.localNotes.title")}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{t("ui.place.localNotes.description", { place: placeName })}</p>
        </div>
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs font-bold text-primary">
          <MessageCircle size={14} aria-hidden="true" /> {t("ui.place.localNotes.count", { count: total })}
        </span>
      </div>

      <form onSubmit={submitNote} className="mt-5 rounded-xl border border-border bg-secondary/35 p-4">
        <label htmlFor="local-note" className="text-sm font-bold text-foreground">{t("ui.place.localNotes.shareLabel")}</label>
        <textarea
          id="local-note"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          minLength={8}
          maxLength={600}
          required
          placeholder={t("ui.place.localNotes.placeholder")}
          className="mt-2 min-h-24 w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary/40"
        />

        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">{t("ui.place.localNotes.guidance")}</p>
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <span className={`text-xs ${body.length > 0 && body.length < 8 ? "font-semibold text-amber-600" : "text-muted-foreground"}`}>
              {body.length > 0 && body.length < 8
                ? t("ui.place.localNotes.minCharWarning", { current: body.length })
                : t("ui.place.localNotes.charCount", { current: body.length, max: 600 })}
            </span>
          </div>
        </div>

        {currentUser && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                {isAnonymous ? (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-muted-foreground ring-1 ring-border">
                    <Shield size={13} aria-hidden="true" />
                  </div>
                ) : (
                  <Avatar className="h-6 w-6 ring-1 ring-border">
                    <AvatarFallback className="bg-primary/10 text-[10px] font-bold text-primary">
                      {currentUser.avatarInitial}
                    </AvatarFallback>
                  </Avatar>
                )}
                <span>
                  {isAnonymous
                    ? t("ui.place.localNotes.postingAsAnonymous")
                    : t("ui.place.localNotes.postingAs", { name: currentUser.name })}
                </span>
              </div>

              <label className="flex cursor-pointer select-none items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground transition hover:bg-secondary">
                <input
                  type="checkbox"
                  checked={isAnonymous}
                  onChange={(event) => setIsAnonymous(event.target.checked)}
                  className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary/40"
                />
                <span>{t("ui.place.localNotes.postAnonymously")}</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={sending || (body.trim().length > 0 && body.trim().length < 8)}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-bold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <Send size={14} aria-hidden="true" /> {t("ui.place.localNotes.publish")}
            </button>
          </div>
        )}

        {!currentUser && (
          <div className="mt-3 flex items-center justify-end border-t border-border/60 pt-3">
            <button
              type="submit"
              formNoValidate
              className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-bold text-white transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <Send size={14} aria-hidden="true" /> {t("ui.place.localNotes.signInToShare")}
            </button>
          </div>
        )}
      </form>

      {error && <p role="alert" className="mt-4 text-sm font-semibold text-destructive">{error}</p>}

      <div className="mt-5 space-y-3" aria-live="polite">
        {loading && comments.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("ui.place.localNotes.loading")}</p>
        ) : comments.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">{t("ui.place.localNotes.empty")}</p>
        ) : comments.map((comment) => {
          const displayName = comment.isAnonymous
            ? t("ui.place.localNotes.anonymousVisitor")
            : comment.authorName;
          const relativeTime = formatRelativeTime(comment.createdAt, t);
          const fullDateTime = new Date(comment.createdAt).toLocaleString(i18n.language, {
            dateStyle: "medium",
            timeStyle: "short",
          });

          return (
            <article key={comment.id} className="rounded-xl border border-border bg-card p-4 transition hover:border-border/80">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  {comment.isAnonymous ? (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground ring-1 ring-border">
                      <Shield size={18} aria-hidden="true" />
                    </div>
                  ) : (
                    <Avatar className="h-10 w-10 shrink-0 ring-1 ring-border">
                      {comment.authorAvatarUrl ? (
                        <AvatarImage src={comment.authorAvatarUrl} alt={displayName} />
                      ) : null}
                      <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">
                        {comment.authorInitial}
                      </AvatarFallback>
                    </Avatar>
                  )}

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-bold text-foreground">{displayName}</p>
                      {comment.isAnonymous && (
                        <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {t("ui.place.localNotes.anonymousBadge")}
                        </span>
                      )}
                      {comment.authorCity && !comment.isAnonymous && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-primary/5 px-2 py-0.5 text-[11px] font-medium text-primary">
                          <MapPin size={10} aria-hidden="true" />
                          {t("ui.place.localNotes.fromCity", { city: comment.authorCity })}
                        </span>
                      )}
                    </div>
                    <time
                      dateTime={comment.createdAt}
                      title={fullDateTime}
                      className="mt-0.5 block cursor-default text-xs text-muted-foreground hover:underline"
                    >
                      {relativeTime}
                    </time>
                  </div>
                </div>

                {comment.canDelete && (
                  <button
                    type="button"
                    onClick={() => void deleteNote(comment.id)}
                    aria-label={t("ui.place.localNotes.delete")}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40"
                  >
                    <Trash2 size={13} aria-hidden="true" />
                    <span>{t("ui.place.localNotes.delete")}</span>
                  </button>
                )}
              </div>
              <p className="mt-3.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground sm:pl-[52px]">
                {comment.body}
              </p>
            </article>
          );
        })}
      </div>

      {comments.length < total && (
        <button
          type="button"
          disabled={loading}
          onClick={() => void loadComments(page + 1, true)}
          className="mt-5 text-sm font-bold text-primary hover:underline disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          {t("ui.place.localNotes.loadMore")}
        </button>
      )}
    </section>
  );
}
