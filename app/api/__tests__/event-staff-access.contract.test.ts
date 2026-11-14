import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Event staff are customers granted one vendor's event pickups. authorizeVendor
// only returns the event_staff role to routes that opt in with
// { allowEventStaff: true }; this contract keeps that set to the two scanner
// routes staff need (look up a pickup, mark it collected).

const EVENT_STAFF_ALLOWED = [
  "app/api/vendors/[vendorId]/scanner/fulfil-event-pickup/route.ts",
  "app/api/vendors/[vendorId]/scanner/resolve/route.ts",
];
const AUTHORIZATION = "lib/vendor-authorization.ts";

const root = process.cwd();
const read = (file: string) => readFileSync(resolve(root, file), "utf8");

function sourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(resolve(root, directory), { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name !== "__tests__" && entry.name !== "node_modules") files.push(...sourceFiles(path));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

const sources = [...sourceFiles("app"), ...sourceFiles("lib"), ...sourceFiles("components")];

describe("event staff API access contract", () => {
  it("opts in exactly the two scanner routes", () => {
    const optedIn = sources.filter((file) => read(file).includes("allowEventStaff: true")).sort();
    expect(optedIn).toEqual([...EVENT_STAFF_ALLOWED].sort());
  });

  it("mentions allowEventStaff nowhere else, so a variable options object cannot slip past", () => {
    const mentions = sources.filter((file) => read(file).includes("allowEventStaff")).sort();
    expect(mentions).toEqual([...EVENT_STAFF_ALLOWED, AUTHORIZATION].sort());
  });

  it("grants the event_staff role only behind the opt-in", () => {
    const source = read(AUTHORIZATION);
    expect(source.match(/role: 'event_staff'/g)).toHaveLength(1);
    expect(source.match(/options\.allowEventStaff \? await eventStaffAccess\(/g)).toHaveLength(2);
    expect(source.match(/eventStaffAccess\(/g)).toHaveLength(3); // definition + the two gated calls
  });
});
