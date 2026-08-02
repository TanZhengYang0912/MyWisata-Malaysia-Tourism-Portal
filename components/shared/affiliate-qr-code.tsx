"use client";

// P4 — Member 4: QR code for affiliate links. CLAUDE-P4-EXTRAS-2.md Extra 4.
//
// The QR just encodes whatever URL the caller resolves — no new tracking
// path, no separate redirect. A scan hits the exact same `/r/[code]/[slug]`
// (or plain, non-affiliate) URL a click on the share button would, so
// attribution, the fraud guards, the click cap, and eligibility all apply
// completely unchanged. `resolveUrl` is a function, not a plain string,
// specifically so callers that need a network round-trip to resolve it
// (ShareButton's buildShareUrl(), which may call POST /api/affiliate/link)
// only pay that cost when the user actually opens the QR modal, not on
// every render — same lazy-resolution shape ShareButton itself already
// uses for its own share actions.

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Download, QrCode as QrCodeIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface AffiliateQrCodeProps {
  /** Resolves the URL to encode. Called once per modal open, not per render. */
  resolveUrl: () => Promise<string> | string;
  /** Shown under the QR and used as the download filename's basis. */
  label: string;
  /**
   * "text" (default) — a small outline text button, for the affiliate
   * dashboard's "My link" row. "icon" — a large circular icon button
   * matching ShareButton's own w-12 h-12 icon row. "compact" — a tiny
   * icon-only trigger matching ShareButton's compact grid-card variant.
   */
  variant?: "text" | "icon" | "compact";
}

function fileNameFor(label: string): string {
  const slug = label.replace(/[^a-z0-9]+/gi, "-").toLowerCase().replace(/^-+|-+$/g, "") || "mywisata";
  return `mywisata-qr-${slug}.png`;
}

export function AffiliateQrCode({ resolveUrl, label, variant = "text" }: AffiliateQrCodeProps) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  async function handleOpen() {
    setOpen(true);
    setUrl(null);
    setError(null);
    try {
      setUrl(await resolveUrl());
    } catch {
      setError("Couldn't generate a QR code right now.");
    }
  }

  useEffect(() => {
    if (!open || !url || !canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, url, { width: 240, margin: 2 }).catch(() => {
      setError("Couldn't render the QR code.");
    });
  }, [open, url]);

  function download() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const anchor = document.createElement("a");
    anchor.download = fileNameFor(label);
    anchor.href = canvas.toDataURL("image/png");
    anchor.click();
  }

  return (
    <>
      {variant === "compact" && (
        <button
          type="button"
          onClick={handleOpen}
          aria-label={`Show QR code for ${label}`}
          title="Show QR code"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 transition"
        >
          <QrCodeIcon size={14} stroke="#334155" />
        </button>
      )}
      {variant === "icon" && (
        <Button
          variant="outline"
          size="icon"
          className="w-12 h-12 rounded-full border-2"
          onClick={handleOpen}
          title="Show QR code"
          aria-label={`Show QR code for ${label}`}
        >
          <QrCodeIcon size={18} />
        </Button>
      )}
      {variant === "text" && (
        <Button variant="outline" size="sm" onClick={handleOpen}>
          <QrCodeIcon size={14} /> Show QR
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Scan to open</DialogTitle>
            <DialogDescription>{label}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-3 py-2">
            {error && <p className="text-sm text-destructive">{error}</p>}
            {!error && !url && <p className="text-sm text-muted-foreground py-10">Generating…</p>}
            <canvas ref={canvasRef} className={url ? "rounded-lg border border-border" : "hidden"} />
            {url && <p className="max-w-full break-all text-center text-xs text-muted-foreground">{url}</p>}
            <Button onClick={download} disabled={!url} className="w-full">
              <Download size={14} /> Download PNG
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
