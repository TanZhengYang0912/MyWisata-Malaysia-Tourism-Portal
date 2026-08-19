import {
  createOutletPageBlock,
  type OutletPageBlock,
  type OutletPageBlockType,
} from '@/lib/vendor/outlet-page-schema';

export type BuilderViewport = "desktop" | "tablet" | "mobile";
export type BuilderPreviewMode = "draft" | "published";
export type BuilderConfirmationAction = "publish" | "discard";

export const OUTLET_BUILDER_CLOSE_TRANSITION_MS = 180;

export interface OutletBuilderOperationState {
  saving: boolean;
  publishing: boolean;
  discarding: boolean;
  closing: boolean;
}

export interface BuilderViewportConfig {
  label: string;
  width: number;
  canvasClassName: string;
  frameClassName: string;
}

const BUILDER_VIEWPORTS: Record<BuilderViewport, BuilderViewportConfig> = {
  desktop: {
    label: "Desktop 1120px",
    width: 1120,
    canvasClassName: "w-[1120px] max-w-full",
    frameClassName: "rounded-[24px] border border-primary/10 bg-white shadow-lg",
  },
  tablet: {
    label: "Tablet 768px",
    width: 768,
    canvasClassName: "w-[768px] max-w-full",
    frameClassName: "rounded-[20px] border border-primary/10 bg-white shadow-lg",
  },
  mobile: {
    label: "Mobile 390px",
    width: 390,
    canvasClassName: "w-[390px]",
    frameClassName:
      "rounded-[34px] border-[10px] border-primary/90 bg-white shadow-2xl ring-1 ring-primary/20",
  },
};

export function getBuilderViewportConfig(
  view: BuilderViewport,
): BuilderViewportConfig {
  return BUILDER_VIEWPORTS[view];
}

export function getBuilderPreviewLabel(mode: BuilderPreviewMode) {
  return mode === "draft" ? "Draft preview" : "Published version";
}

export function isOutletBuilderBusy(state: OutletBuilderOperationState) {
  return (
    state.saving ||
    state.publishing ||
    state.discarding ||
    state.closing
  );
}

export function getPublishedOutletFeedback(
  outletName: string,
  publishedVersion: string | number,
) {
  return `${outletName} shop page published successfully. Customer shop now uses version ${publishedVersion}.`;
}

export function getBuilderBlockLabel(type: OutletPageBlockType) {
  if (type === "image" || type === "image_text") return "Photo";
  const labels: Partial<Record<OutletPageBlockType, string>> = {
    intro: "Outlet introduction",
    text: "Text",
    product_grid: "Product cards",
    gallery: "Gallery",
    hours: "Opening hours",
    contact: "Map and contact",
    voucher_banner: "Voucher banner",
    cta: "Call to action",
    review_highlight: "Guest review",
    social_proof: "Social proof",
  };
  return labels[type] || type.replaceAll("_", " ");
}

export function getBuilderConfirmationCopy(action: BuilderConfirmationAction) {
  return action === "publish"
    ? {
        title: "Publish this draft?",
        body: "Customers will see these changes on the public shop.",
        confirm: "Publish now",
      }
    : {
        title: "Discard this draft?",
        body: "Your draft will be replaced by the currently published version.",
        confirm: "Discard draft",
      };
}

export function duplicateOutletPageBlock(block: OutletPageBlock): OutletPageBlock {
  const fresh = createOutletPageBlock(block.type);
  return { ...fresh, ...block, id: fresh.id };
}
