import React, { act, forwardRef, useImperativeHandle } from "react";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { installTestDom, type TestDocument, type TestElement } from "@/components/shared/__tests__/render-test-dom";

// Regression: the trip planner re-rendered on every map movement start/end and
// passed a new (but identical) route array each time, which made the map call
// fitBounds again and snap back while the user was zooming.

const mocks = vi.hoisted(() => ({
  fitBounds: vi.fn(),
  flyTo: vi.fn(),
}));

vi.mock("@/lib/maplibre-worker", () => ({}));
vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("react-map-gl/maplibre", () => {
  const MapMock = forwardRef(function MapMock({ children }: {
    children?: React.ReactNode;
  }, ref: React.Ref<unknown>) {
    useImperativeHandle(ref, () => ({ fitBounds: mocks.fitBounds, flyTo: mocks.flyTo, getZoom: () => 7, getMap: () => ({}) }));
    return <div>{children}</div>;
  });
  const Null = () => null;
  return { default: MapMock, Layer: Null, Marker: Null, Popup: Null, Source: Null };
});

import { MaplibreMap, shouldEscalateMapFailure } from "@/components/map/maplibre-map";

let document: TestDocument, container: TestElement, root: ReturnType<typeof import("react-dom/client").createRoot>;
let createRoot: typeof import("react-dom/client").createRoot;
beforeAll(async () => { document = installTestDom(); ({ createRoot } = await import("react-dom/client")); });
beforeEach(() => {
  mocks.fitBounds.mockClear();
  mocks.flyTo.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container as unknown as Element);
});
afterEach(() => { act(() => root.unmount()); document.body.removeChild(container); });

const route = (): [number, number][] => [[3.139, 101.686], [5.414, 100.329], [2.196, 102.249]];

async function render(fitCoordinates: [number, number][], onMapMovingChange?: (moving: boolean) => void) {
  await act(async () => {
    root.render(<MaplibreMap pins={[]} center={[3.1, 101.7]} zoom={7} height="100%" fitCoordinates={fitCoordinates} onMapMovingChange={onMapMovingChange} />);
  });
}

it("fits the route once when it first appears", async () => {
  await render(route());
  expect(mocks.fitBounds).toHaveBeenCalledTimes(1);
});

it("does not re-fit when a re-render passes a new array with the same coordinates", async () => {
  await render(route());
  await render(route());
  await render(route());
  expect(mocks.fitBounds).toHaveBeenCalledTimes(1);
});

it("re-fits when the route's coordinates actually change", async () => {
  await render(route());
  await render([...route(), [4.6, 101.1]]);
  expect(mocks.fitBounds).toHaveBeenCalledTimes(2);
});

it("ignores isolated tile failures but offers recovery when many distinct tiles fail", () => {
  const tileFailure = (at: number, tileKey: string) => ({ at, sourceId: "basemap", tileKey });
  expect(shouldEscalateMapFailure([tileFailure(1_000, "8/1/1")], 1_000)).toBe(false);
  expect(shouldEscalateMapFailure([tileFailure(1_000, "8/1/1"), tileFailure(1_100, "8/1/2"), tileFailure(1_200, "8/2/1")], 1_200)).toBe(false);
  expect(shouldEscalateMapFailure(Array.from({ length: 6 }, (_, i) => tileFailure(1_000 + i * 100, `8/${i}/1`)), 1_500)).toBe(true);
  expect(shouldEscalateMapFailure(Array.from({ length: 6 }, (_, i) => tileFailure(1_000 + i * 100, `8/${i}/1`)), 12_000)).toBe(false);
});

it("offers recovery for repeated map-level or source metadata errors", () => {
  expect(shouldEscalateMapFailure([{ at: 1_000 }, { at: 1_100 }, { at: 1_200 }], 1_200)).toBe(true);
  expect(shouldEscalateMapFailure([
    { at: 1_000, sourceId: "basemap" },
    { at: 1_100, sourceId: "basemap" },
    { at: 1_200, sourceId: "basemap" },
  ], 1_200)).toBe(true);
});

it("does not escalate weather overlay tile failures into a basemap failure", () => {
  const weatherTileFailures = Array.from({ length: 8 }, (_, i) => ({
    at: 1_000 + i * 100,
    sourceId: "trip-weather-radar",
    tileKey: `8/${i}/1`,
  }));
  expect(shouldEscalateMapFailure(weatherTileFailures, 1_700)).toBe(false);
});
