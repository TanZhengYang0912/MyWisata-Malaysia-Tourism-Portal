import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

describe("vendor dashboard chart loading", () => {
  it("loads recharts after the dashboard renders, through the client wrapper", () => {
    const page = read("app/vendor/dashboard/page.tsx");
    const wrapper = read("components/vendor/dashboard-charts.tsx");
    expect(page).toContain("from '@/components/vendor/dashboard-charts'");
    expect(page).not.toContain("from '@/components/vendor/sales-chart'");
    expect(page).not.toContain("from '@/components/vendor/outlet-pie-chart'");
    expect(wrapper).toContain('"use client"');
    expect(wrapper).toContain('dynamic(() => import("./sales-chart")');
    expect(wrapper).toContain('dynamic(() => import("./outlet-pie-chart")');
    expect(wrapper.match(/^\s+ssr: false,$/gm)).toHaveLength(2);
    expect(wrapper.match(/min-h-\[380px\]/g)).toHaveLength(2);
  });
});

describe("share QR code loading", () => {
  it("loads the qrcode library only when the dialog draws a code", () => {
    const qr = read("components/shared/affiliate-qr-code.tsx");
    expect(qr).not.toMatch(/^import QRCode from "qrcode";$/m);
    expect(qr).toContain('import("qrcode")');
    expect(qr).toContain("if (cancelled || !canvas) return;");
    expect(qr).toContain('setError(t("affiliate.qr.errors.render"))');
  });
});
