import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workspace = process.cwd();
const mapSource = readFileSync(resolve(workspace, "components/demo-map/malaysia-state-map.tsx"), "utf8");
const storySource = readFileSync(resolve(workspace, "components/demo-map/story-map.tsx"), "utf8");

describe("calm interactive Explore map", () => {
  it("uses progressive disclosure instead of rendering every state label by default", () => {
    expect(mapSource).toContain("const activeState = DEMO_STATES.find((state) => state.id === activeStateId)");
    expect(mapSource).toContain("activeState ? [activeState] : []");
    expect(mapSource).toContain("activeStateId ? buildStateCalloutPath");
    expect(mapSource).toContain('t("ui.map.findState")');
  });

  it("keeps small states easy to hit without changing their visual geometry", () => {
    expect(mapSource).toContain('data-state-hit-area={state.id}');
    expect(mapSource).toContain('strokeWidth={18}');
    expect(mapSource).toContain('pointerEvents="all"');
  });

  it("provides a responsive selected-state detail panel", () => {
    expect(storySource).toContain('aria-label={t("ui.map.stateEyebrow")}');
    expect(storySource).toContain('t("ui.map.findState")');
    expect(storySource).toContain("lg:grid-cols-[minmax(0,1.65fr)_minmax(280px,0.75fr)]");
    expect(storySource).toContain("selectedStateId ?");
    expect(storySource).toContain('aria-label={t("ui.map.findState")}');
    expect(storySource).toContain('onChange={(event) => onSelectState(event.target.value || null)}');
  });

  it("keeps map and detail panels at a fixed desktop height while preserving mobile sizing", () => {
    expect(mapSource).toContain("lg:h-[620px] lg:aspect-auto lg:min-h-0");
    expect(storySource).toContain("lg:h-[620px]");
  });

  it("uses a tighter vertical viewport so the map landmasses render larger", () => {
    expect(mapSource).toContain("MAP_VIEWBOX_TOP");
    expect(mapSource).toContain("MAP_VIEWBOX_HEIGHT");
    expect(mapSource).toContain("visibleStateLabelPlacement");
  });
});
