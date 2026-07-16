import { expect, it } from "vitest";
import { DEMO_PLACES } from "@/lib/demo-map/data";
import { filterPlaces } from "@/lib/demo-map/store";

it("returns all demo places when no filter is active", () => {
  expect(filterPlaces(DEMO_PLACES, {}).length).toBe(DEMO_PLACES.length);
});
