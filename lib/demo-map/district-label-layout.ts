/**
 * Deterministic label placement for a state's districts (spec D3 / plan
 * Phase 4). Every district gets exactly one permanent label — unlike the
 * earlier hover-only prototype — so this has to resolve collisions instead
 * of just picking a spot and hoping.
 *
 * Algorithm: try four anchors right next to each dot in turn (right, left,
 * top, bottom); the first that doesn't overlap an already-placed label wins.
 * A district that still can't find room (Sabah's 16 districts, mostly) falls
 * into whichever outer lane — left or right of the plate — is nearer, stacked
 * top to bottom, connected back to its dot with a leader line.
 */

const CHAR_WIDTH = 6.2;
const LABEL_HEIGHT = 16;
const LABEL_PADDING_X = 4;
const ANCHOR_OFFSET = 10;
const LANE_GUTTER = 8;
const LANE_ROW_SPACING = LABEL_HEIGHT + 4;
const OVERLAP_MARGIN = 2;

export function districtLabelWidth(name: string): number {
  return name.length * CHAR_WIDTH + LABEL_PADDING_X * 2;
}

export interface DistrictLabelInput {
  id: string;
  name: string;
  x: number;
  y: number;
}

export type LabelAnchor = "start" | "middle" | "end";

export interface DistrictLabelLayout {
  id: string;
  labelX: number;
  labelY: number;
  lane: "none" | "left" | "right";
  /** How the label text is anchored horizontally to (labelX, labelY). */
  anchor: LabelAnchor;
  /** Whether a connector line should be drawn from the dot to the label. */
  leader: boolean;
}

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function rectFor(labelX: number, labelY: number, anchor: LabelAnchor, width: number): Rect {
  const x0 = anchor === "start" ? labelX : anchor === "end" ? labelX - width : labelX - width / 2;
  return { x0, x1: x0 + width, y0: labelY - LABEL_HEIGHT / 2, y1: labelY + LABEL_HEIGHT / 2 };
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x0 - OVERLAP_MARGIN < b.x1 && b.x0 - OVERLAP_MARGIN < a.x1 && a.y0 - OVERLAP_MARGIN < b.y1 && b.y0 - OVERLAP_MARGIN < a.y1;
}

export function layoutDistrictLabels(
  districts: DistrictLabelInput[],
  bounds: { width: number; height: number },
): DistrictLabelLayout[] {
  const clampY = (y: number) => Math.max(LABEL_HEIGHT / 2, Math.min(bounds.height - LABEL_HEIGHT / 2, y));

  // North-to-south, then west-to-east, then id — a total order so the same
  // input always produces the same output regardless of array order.
  const ordered = [...districts].sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id));

  const placed: Rect[] = [];
  const laneY: { left: number; right: number } = { left: -Infinity, right: -Infinity };
  const result: DistrictLabelLayout[] = [];

  for (const district of ordered) {
    const width = districtLabelWidth(district.name);
    const candidates: { labelX: number; labelY: number; anchor: LabelAnchor }[] = [
      { labelX: district.x + ANCHOR_OFFSET, labelY: district.y, anchor: "start" },
      { labelX: district.x - ANCHOR_OFFSET, labelY: district.y, anchor: "end" },
      { labelX: district.x, labelY: district.y - ANCHOR_OFFSET, anchor: "middle" },
      { labelX: district.x, labelY: district.y + ANCHOR_OFFSET, anchor: "middle" },
    ];

    let chosen: { labelX: number; labelY: number; anchor: LabelAnchor; rect: Rect } | null = null;
    for (const candidate of candidates) {
      const y = clampY(candidate.labelY);
      const rect = rectFor(candidate.labelX, y, candidate.anchor, width);
      if (!placed.some((p) => overlaps(p, rect))) {
        chosen = { labelX: candidate.labelX, labelY: y, anchor: candidate.anchor, rect };
        break;
      }
    }

    if (chosen) {
      placed.push(chosen.rect);
      result.push({ id: district.id, labelX: chosen.labelX, labelY: chosen.labelY, lane: "none", anchor: chosen.anchor, leader: false });
      continue;
    }

    // No nearby anchor was free — push it out to whichever side is closer.
    // Deliberately NOT run through clampY: a lane that outgrows the plate
    // height must push labels further down, never compress them into each
    // other. The caller extends the canvas to fit, the same way the national
    // view's state pin-cards already do — see malaysia-district-map.tsx.
    const side: "left" | "right" = district.x < bounds.width / 2 ? "left" : "right";
    const anchor: LabelAnchor = side === "left" ? "end" : "start";
    const labelX = side === "left" ? -LANE_GUTTER : bounds.width + LANE_GUTTER;
    const labelY = Math.max(district.y, laneY[side] + LANE_ROW_SPACING);
    laneY[side] = labelY;
    placed.push(rectFor(labelX, labelY, anchor, width));
    result.push({ id: district.id, labelX, labelY, lane: side, anchor, leader: true });
  }

  return result;
}
