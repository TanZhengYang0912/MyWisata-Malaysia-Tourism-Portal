import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const script = path.resolve(__dirname, "../staff-passkey-enrollment.mjs");
const userId = "aaaaaaaa-0000-0000-0000-000000000001";

function run(url: string, extraArgs: string[] = []) {
  return spawnSync(
    process.execPath,
    [script, "--user", userId, "--confirm-user", userId, "--reason", "Identity verified; ref TEST-0001", ...extraArgs],
    {
      // NODE_ENV is required by the ProcessEnv type Next.js declares; the script does not read it.
      env: { PATH: process.env.PATH, NODE_ENV: "test", NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: "test-key" },
      encoding: "utf8",
      timeout: 20_000,
    },
  );
}

describe("staff passkey enrollment environment gate", () => {
  it("refuses a hosted Supabase target by default", () => {
    const result = run("https://example-project.supabase.co");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Refusing to issue a grant on remote host example-project.supabase.co");
  });

  it("refuses --allow-remote when the host is not confirmed", () => {
    const result = run("https://example-project.supabase.co", ["--allow-remote", "--confirm-host", "other.supabase.co"]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Refusing to issue a grant on remote host");
  });

  it("passes the gate for a local target and fails later at the unreachable RPC", () => {
    const result = run("http://127.0.0.1:9");
    expect(result.stderr).toContain("Target Supabase: 127.0.0.1 (local)");
    expect(result.stderr).not.toContain("Refusing to issue a grant");
    expect(result.stderr).toContain("Enrollment grant could not be issued");
  });
});
