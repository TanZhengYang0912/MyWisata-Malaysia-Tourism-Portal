"use client";

import { ArrowDown, ArrowDownUp, Check, Copy, MapPin, MessageCircle, Send, Shield, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isComposerExpanded, setIsComposerExpanded] = useState(false);
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [copiedNoteId, setCopiedNoteId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    if (body.trim().length < 8) {
      setValidationError(t("ui.place.localNotes.required"));
      return;
    }
    setSending(true);
    setError(null);
    setValidationError(null);
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
      setIsComposerExpanded(false);
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

  function expandComposer() {
    setIsComposerExpanded(true);
    window.requestAnimationFrame(() => textareaRef.current?.focus());
  }

  async function copyNoteLink(commentId: string) {
    const noteUrl = `${window.location.origin}${window.location.pathname}#local-note-${commentId}`;
    try {
      await navigator.clipboard.writeText(noteUrl);
      setCopiedNoteId(commentId);
      window.setTimeout(() => setCopiedNoteId((current) => current === commentId ? null : current), 1800);
    } catch {
      setError(t("ui.place.localNotes.copyError"));
    }
  }

  const orderedComments = [...comments].sort((first, second) => {
    const firstTime = new Date(first.createdAt).getTime();
    const secondTime = new Date(second.createdAt).getTime();
    return sortOrder === "newest" ? secondTime - firstTime : firstTime - secondTime;
  });

  return (
    <section className="mt-10 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6 lg:p-7" aria-labelledby="local-notes-heading">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">{t("ui.place.localNotes.eyebrow")}</p>
          <h2 id="local-notes-heading" className="mt-2 font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {t("ui.place.localNotes.title")}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{t("ui.place.localNotes.description", { place: placeName })}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs font-bold text-primary">
            <MessageCircle size={14} aria-hidden="true" /> {t("ui.place.localNotes.count", { count: total })}
          </span>
          <Select value={sortOrder} onValueChange={(value) => setSortOrder(value as "newest" | "oldest")}>
            <SelectTrigger
              aria-label={t("ui.place.localNotes.sortBy")}
              className="h-8 w-[7.75rem] rounded-full border-border bg-background px-3 text-xs font-bold text-foreground"
            >
              <ArrowDownUp size={13} aria-hidden="true" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">{t("ui.place.localNotes.newest")}</SelectItem>
              <SelectItem value="oldest">{t("ui.place.localNotes.oldest")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <form onSubmit={submitNote} className="mt-4 rounded-2xl border border-border bg-secondary/25 p-3 sm:p-4">
        {!isComposerExpanded ? (
          <button
            type="button"
            aria-expanded={isComposerExpanded}
            onClick={expandComposer}
            className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-2 text-left text-sm font-bold text-foreground transition hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <span className="flex min-w-0 items-center gap-2">
              <MessageCircle size={16} className="shrink-0 text-primary" aria-hidden="true" />
              <span className="break-words whitespace-normal">{t("ui.place.localNotes.shareLabel")}</span>
            </span>
            <ArrowDown size={15} className="shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="local-note" className="text-sm font-bold text-foreground">{t("ui.place.localNotes.shareLabel")}</label>
              <button
                type="button"
                aria-expanded={isComposerExpanded}
                onClick={() => setIsComposerExpanded(false)}
                className="rounded-lg px-2 py-1 text-xs font-semibold text-muted-foreground transition hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                {t("ui.place.localNotes.collapse")}
              </button>
            </div>
            <textarea
              ref={textareaRef}
              id="local-note"
              value={body}
              onChange={(event) => {
                setBody(event.target.value);
                if (validationError) setValidationError(null);
              }}
              minLength={8}
              maxLength={600}
              aria-invalid={Boolean(validationError)}
              aria-describedby={validationError ? "local-note-error" : undefined}
              placeholder={t("ui.place.localNotes.placeholder")}
              className="mt-2 min-h-20 w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary/40 sm:min-h-24"
            />
            {validationError && <p id="local-note-error" className="mt-2 text-xs font-semibold text-destructive">{validationError}</p>}

            <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">{t("ui.place.localNotes.guidance")}</p>
              <span className={`text-xs ${body.length > 0 && body.length < 8 ? "font-semibold text-amber-600" : "text-muted-foreground"}`}>
                {body.length > 0 && body.length < 8
                  ? t("ui.place.localNotes.minCharWarning", { current: body.length })
                  : t("ui.place.localNotes.charCount", { current: body.length, max: 600 })}
              </span>
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

                <Button
                  type="submit"
                  size="sm"
                  disabled={sending || (body.trim().length > 0 && body.trim().length < 8)}
                  className="rounded-full px-4 font-bold"
                >
                  <Send size={14} aria-hidden="true" /> {t("ui.place.localNotes.publish")}
                </Button>
              </div>
            )}

            {!currentUser && (
              <div className="mt-3 flex items-center justify-end border-t border-border/60 pt-3">
                <Button type="submit" size="sm" className="rounded-full px-4 font-bold" formNoValidate>
                  <Send size={14} aria-hidden="true" /> {t("ui.place.localNotes.signInToShare")}
                </Button>
              </div>
            )}
          </>
        )}
      </form>

      {error && <p role="alert" className="mt-4 text-sm font-semibold text-destructive">{error}</p>}

      <div className="mt-5 grid gap-3 md:grid-cols-2" aria-live="polite" aria-busy={loading}>
        {loading && comments.length === 0 ? (
          <p className="text-sm text-muted-foreground md:col-span-2">{t("ui.place.localNotes.loading")}</p>
        ) : comments.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground md:col-span-2">{t("ui.place.localNotes.empty")}</p>
        ) : orderedComments.map((comment) => {
          const displayName = comment.isAnonymous
            ? t("ui.place.localNotes.anonymousVisitor")
            : comment.authorName;
          const relativeTime = formatRelativeTime(comment.createdAt, t);
          const fullDateTime = new Date(comment.createdAt).toLocaleString(i18n.language, {
            dateStyle: "medium",
            timeStyle: "short",
          });

          return (
            <article id={`local-note-${comment.id}`} key={comment.id} className="group h-full rounded-2xl border border-border border-l-2 border-l-primary/25 bg-background p-4 transition hover:border-primary/30 hover:shadow-sm">
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
                      <p className="break-words whitespace-normal text-sm font-bold text-foreground">{displayName}</p>
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

              </div>
              <p className="mt-3.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground sm:pl-[52px]">
                {comment.body}
              </p>
              <div className="mt-4 flex items-center justify-between gap-2 border-t border-border/60 pt-3 sm:pl-[52px]">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {t("ui.place.localNotes.noteLabel")}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void copyNoteLink(comment.id)}
                    className="h-7 rounded-full px-2.5 text-xs text-muted-foreground hover:text-primary"
                  >
                    {copiedNoteId === comment.id ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
                    {copiedNoteId === comment.id ? t("ui.place.localNotes.copied") : t("ui.place.localNotes.copyLink")}
                  </Button>
                  {comment.canDelete && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void deleteNote(comment.id)}
                      aria-label={t("ui.place.localNotes.delete")}
                      className="h-7 rounded-full px-2.5 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 size={13} aria-hidden="true" />
                      <span>{t("ui.place.localNotes.delete")}</span>
                    </Button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {comments.length < total && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loading}
          onClick={() => void loadComments(page + 1, true)}
          className="mt-5 rounded-full px-4 font-bold text-primary"
        >
          <ArrowDown size={14} aria-hidden="true" />
          {t("ui.place.localNotes.loadMore")}
        </Button>
      )}
    </section>
  );
}
