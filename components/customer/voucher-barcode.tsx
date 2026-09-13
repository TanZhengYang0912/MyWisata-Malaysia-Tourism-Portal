"use client";

import { useEffect, useRef, useState } from "react";
import JsBarcode from "jsbarcode";

interface VoucherBarcodeProps {
  value: string;
  text?: string;
  label: string;
}

export function VoucherBarcode({ value, text, label }: VoucherBarcodeProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!svgRef.current || !value) return;
    try {
      JsBarcode(svgRef.current, value, {
        format: "CODE128",
        lineColor: "#010066",
        background: "#ffffff",
        width: 1.6,
        height: 56,
        margin: 4,
        displayValue: Boolean(text),
        text,
        fontSize: 13,
        textMargin: 4,
      });
      // The state mirrors the external JsBarcode render result.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError(false);
    } catch {
      setError(true);
    }
  }, [text, value]);

  if (error) return <p className="text-xs font-semibold text-destructive">{label}</p>;
  return (
    <div className="rounded-xl bg-white px-2 py-1.5" data-voucher-barcode="code128">
      <svg ref={svgRef} role="img" aria-label={label} className="h-auto w-full" />
    </div>
  );
}
