import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildStateCalloutPath, STATE_LABEL_LAYOUT } from "../malaysia-state-map";

const workspace = process.cwd();
const mapSource = readFileSync(resolve(workspace, "components/demo-map/malaysia-state-map.tsx"), "utf8");
const storySource = readFileSync(resolve(workspace, "components/demo-map/story-map.tsx"), "utf8");
const chatSource = readFileSync(resolve(workspace, "components/shared/chatbot-widget.tsx"), "utf8");
const stateSource = readFileSync(resolve(workspace, "lib/demo-map/data.ts"), "utf8");

describe("Malaysia state discovery map", () => {
  it("renders a progressive English label layer for the active state", () => {
    expect(stateSource).toContain('name: "Perlis"');
    expect(stateSource).toContain('name: "Labuan"');
    expect(mapSource).toContain("STATE_LABEL_LAYOUT");
    expect(mapSource).toContain('aria-label="Malaysia state labels"');
    expect(mapSource).toContain("const visibleStates = activeState ? [activeState] : []");
    expect(mapSource).toContain("{visibleStates.map((state)");
    expect(mapSource).toContain("statePlacesCount(stateCounts, state.id)");
    expect(mapSource).toContain("data-state-label-layer");
    expect(mapSource).toContain("data-state-label={state.id}");
    expect(mapSource).toContain("<rect");
  });

  it("keeps the label layer tied to the matching independent regional projection", () => {
    expect(mapSource).toContain("const region = regionForState(state.id)");
    expect(mapSource).toContain("projected({ lat: state.label[1], lng: state.label[0] }, region)");
    expect(mapSource).toContain("aria-label={`Select ${state.name}`}");
  });

  it("routes labels with orthogonal leader paths instead of diagonal lines", () => {
    expect(buildStateCalloutPath(
      { x: 200, y: 160 },
      { region: "peninsular", x: 12, y: 200, side: "left", elbowX: 130 },
      80,
    )).toBe("M 200 160 H 130 V 200 H 92");
    expect(mapSource).toContain("<path");
    expect(mapSource).toContain("strokeLinecap=\"round\"");
    expect(mapSource).not.toContain("<line");
  });

  it("gives each label its own lane outside the translated map area", () => {
    expect(STATE_LABEL_LAYOUT.kedah).toMatchObject({region: "peninsular", side: "left", x: 18});
    expect(STATE_LABEL_LAYOUT.sarawak).toMatchObject({region: "borneo", side: "left", x: 690});
    expect(STATE_LABEL_LAYOUT.sabah).toMatchObject({region: "borneo", side: "right", x: 1540});
    expect(new Set(Object.values(STATE_LABEL_LAYOUT).map((placement) => placement.elbowX)).size).toBeGreaterThan(8);
    expect(mapSource).toContain("SINGLE_CANVAS");
    expect(mapSource).toContain("ALL_MAP_BOUNDS");
    expect(mapSource).toContain("canvasForRegion");
    expect(mapSource).toContain("boundsForRegion");
  });

  it("keeps neighboring label cards separated", () => {
    expect(STATE_LABEL_LAYOUT.kedah.y - STATE_LABEL_LAYOUT.perlis.y).toBeGreaterThanOrEqual(68);
    expect(STATE_LABEL_LAYOUT.penang.y - STATE_LABEL_LAYOUT.kedah.y).toBeGreaterThanOrEqual(68);
    expect(STATE_LABEL_LAYOUT.labuan.y - STATE_LABEL_LAYOUT.sabah.y).toBeGreaterThanOrEqual(68);
    expect(STATE_LABEL_LAYOUT.johor.y - STATE_LABEL_LAYOUT.melaka.y).toBeGreaterThanOrEqual(68);
  });

  it("uses the reference map plate palette and independent region framing", () => {
    expect(mapSource).toContain("All states and federal territories");
    expect(mapSource).toContain("Choose one state to reveal its places.");
    expect(mapSource).toContain("#c7d2fe");
    expect(mapSource).toContain("#dce4ff");
  });

  it("does not render a duplicate hover count popover over the map", () => {
    expect(mapSource).not.toContain("activePoint");
    expect(mapSource).not.toContain("CategoryIcon");
  });

  it("uses a balanced desktop composition with a fixed shared panel height", () => {
    expect(storySource).toContain("lg:grid-cols-[minmax(0,1.65fr)_minmax(280px,0.75fr)]");
    expect(mapSource).toContain("aspect-[1600/1060]");
    expect(mapSource).toContain("lg:h-[620px] lg:aspect-auto lg:min-h-0");
    expect(mapSource).toContain("sm:text-[24px]");
    expect(mapSource).toContain("viewBox={`0 ${MAP_VIEWBOX_TOP} ${WIDTH} ${MAP_VIEWBOX_HEIGHT}`}");
    expect(mapSource).toContain('preserveAspectRatio="none"');
  });

  it("uses the MyWisata indigo palette and avoids the native map tooltip", () => {
    expect(mapSource).toContain("#c7d2fe");
    expect(mapSource).toContain("#dce4ff");
    expect(mapSource).toContain("#010066");
    expect(mapSource).not.toContain("<title>Malaysia state discovery map</title>");
    expect(mapSource).not.toContain("<title>{state.name}</title>");
  });

  it("keeps state labels readable after the map is enlarged", () => {
    expect(mapSource).toContain("text-xs");
    expect(mapSource).toContain("2xl:text-sm");
    expect(mapSource).toContain("min-h-[440px]");
    expect(mapSource).toContain("Math.max(150");
    expect(mapSource).not.toContain("<text");
    expect(mapSource).toContain("sm:min-h-[500px]");
  });

  it("pairs the map with a responsive selected-state panel", () => {
    expect(storySource).toContain("lg:grid-cols-[minmax(0,1.65fr)_minmax(280px,0.75fr)]");
    expect(storySource).toContain('aria-label="Selected state details"');
    expect(storySource).toContain("id=\"explore-experiences\"");
    expect(storySource).toContain("lg:grid-cols-4");
    expect(storySource).toContain("line-clamp-2");
    expect(storySource).toContain('h-8 w-8 shrink-0 rounded-lg object-cover');
    expect(storySource).toContain("aria-pressed={activity.id === selectedPlaceId}");
  });

  it("gives the floating chat control an accessible name", () => {
    expect(chatSource).toContain('aria-label="Open chat"');
  });
});
