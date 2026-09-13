import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => {
  const path = resolve(process.cwd(), file);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
};

const mapSource = read("components/demo-map/mywisata-explore-map.tsx");
const storySource = read("components/demo-map/story-map.tsx");

describe("production Explore MapLibre map", () => {
  it("uses the real external vector map with GeoJSON regions and 3D buildings", () => {
    expect(mapSource).toContain('from "react-map-gl/maplibre"');
    expect(mapSource).toContain("Map as MapLibre,");
    expect(mapSource).toContain("openfreemap");
    expect(mapSource).toContain("malaysia-states.json");
    expect(mapSource).toContain('map.getLayer("building-3d")');
    expect(mapSource).toContain('"fill-extrusion-color"');
    expect(mapSource).toContain("Source");
    expect(mapSource).toContain("Layer");
  });

  it("keeps the selected region transparent enough for 3D buildings to remain visible", () => {
    expect(mapSource).toContain('"fill-opacity": ["case", ["==", ["get", "id"], selectedStateId ?? ""], 0.16, 0.42]');
    expect(mapSource).toContain('"line-color": ["case", ["==", ["get", "id"], selectedStateId ?? ""], "#ffcc00", "#010066"]');
    expect(mapSource).toContain('"fill-extrusion-opacity", 0.86');
  });

  it("keeps only the map label, 3D status, and required attribution visible", () => {
    expect(mapSource).toContain("Explore the map");
    expect(mapSource).toContain("3D buildings");
    expect(mapSource).toContain("© OpenFreeMap · © OpenStreetMap");
    expect(mapSource).not.toContain("Malaysia 3D Atlas");
    expect(mapSource).not.toContain("All states and federal territories");
    expect(mapSource).not.toContain("selected</div>");
  });

  it("keeps the selected map region and detail photo on the same destination record", () => {
    expect(storySource).toContain("MALAYSIA_DESTINATIONS.find");
    expect(storySource).toContain("selectedDestination.image");
    expect(storySource).toContain("selectedDestination.attraction");
    expect(storySource).toContain("<Image");
    expect(storySource).toContain("<MyWisataExploreMap");
  });

  it("adds restrained depth to the selected destination photo while respecting reduced motion", () => {
    expect(storySource).toContain('data-destination-photo-card');
    expect(storySource).toContain('[perspective:1000px]');
    expect(storySource).toContain('motion-safe:group-hover:-translate-y-1');
    expect(storySource).toContain('motion-safe:group-hover:scale-[1.04]');
    expect(storySource).toContain('motion-reduce:transform-none');
  });
});
