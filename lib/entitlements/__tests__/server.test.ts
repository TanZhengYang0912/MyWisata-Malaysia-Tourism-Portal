import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { parseAuditResult } from "@/lib/audit";
import {
  activatePolicyVersion,
  approvePolicyVersion,
  createPolicyVersion,
  listAccessControlState,
  revokeEntitlementAssignment,
  rollbackEntitlementPolicy,
  setEntitlementAssignment,
} from "@/lib/entitlements/admin";
import { resolveEffectiveCapability } from "@/lib/entitlements/server";

describe("entitlement server adapters", () => {
  const versionId = "11111111-1111-4111-8111-111111111111";
  const assignmentId = "22222222-2222-4222-8222-222222222222";

  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.createClient.mockReset();
    mocks.createClient.mockResolvedValue({ rpc: mocks.rpc });
  });

  it("returns a validated allow decision from the governed resolver", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        capability: "wallet.request_withdrawal",
        allowed: true,
        blockerCode: null,
        qualificationPaths: [],
        entitlementGeneration: 7,
        source: "policy",
      },
      error: null,
    });

    await expect(
      resolveEffectiveCapability("user-1", "wallet.request_withdrawal"),
    ).resolves.toEqual({
      capability: "wallet.request_withdrawal",
      allowed: true,
      blockerCode: null,
      qualificationPaths: [],
      entitlementGeneration: 7,
      source: "policy",
    });
    expect(mocks.rpc).toHaveBeenCalledWith("resolve_user_capability", {
      p_user_id: "user-1",
      p_capability_key: "wallet.request_withdrawal",
    });
  });

  it("preserves a validated hard-guard denial", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        capability: "wallet.request_withdrawal",
        allowed: false,
        blockerCode: "KYC_REQUIRED",
        qualificationPaths: [{ type: "kyc", href: "/customer/kyc" }],
        entitlementGeneration: 8,
        source: "hard_guard",
      },
      error: null,
    });

    await expect(
      resolveEffectiveCapability("user-2", "wallet.request_withdrawal"),
    ).resolves.toMatchObject({
      allowed: false,
      blockerCode: "KYC_REQUIRED",
      entitlementGeneration: 8,
    });
  });

  it("accepts the independent Phone recovery route", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        capability: "commerce.checkout",
        allowed: false,
        blockerCode: "PHONE_VERIFICATION_REQUIRED",
        qualificationPaths: [{ type: "phone", href: "/customer/phone" }],
        entitlementGeneration: 8,
        source: "hard_guard",
      },
      error: null,
    });

    await expect(
      resolveEffectiveCapability("user-2", "commerce.checkout"),
    ).resolves.toMatchObject({
      blockerCode: "PHONE_VERIFICATION_REQUIRED",
      qualificationPaths: [{ type: "phone", href: "/customer/phone" }],
    });
  });

  it.each([
    [{ allowed: true }],
    [{
      capability: "wallet.request_withdrawal",
      allowed: true,
      blockerCode: "KYC_REQUIRED",
      qualificationPaths: [],
      entitlementGeneration: 1,
      source: "policy",
    }],
    [{
      capability: "wallet.request_withdrawal",
      allowed: false,
      blockerCode: "NOT_REGISTERED",
      qualificationPaths: [],
      entitlementGeneration: -1,
      source: "hard_guard",
    }],
  ])("fails closed for malformed resolver JSON %#", async (data) => {
    mocks.rpc.mockResolvedValue({ data, error: null });

    await expect(
      resolveEffectiveCapability("user-3", "wallet.request_withdrawal"),
    ).resolves.toEqual({
      capability: "wallet.request_withdrawal",
      allowed: false,
      blockerCode: "POLICY_UNAVAILABLE",
      qualificationPaths: [],
      entitlementGeneration: 0,
      source: "default_deny",
    });
  });

  it("fails closed when the resolver RPC errors", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "database unavailable" } });

    await expect(
      resolveEffectiveCapability("user-4", "commerce.checkout"),
    ).resolves.toMatchObject({
      capability: "commerce.checkout",
      allowed: false,
      blockerCode: "POLICY_UNAVAILABLE",
      source: "default_deny",
    });
  });

  it("calls policy mutation RPCs without accepting or forwarding actor IDs", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: versionId, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null });

    await expect(createPolicyVersion({
      policyId: "policy-1",
      effect: "allow",
      effectiveFrom: "2026-09-01T00:00:00.000Z",
      effectiveUntil: null,
      requirements: [{
        alternativeGroup: 1,
        factKey: "kyc_status",
        operator: "eq",
        expectedValue: "approved",
      }],
      reason: "Require approved KYC for this capability",
    })).resolves.toBe(versionId);
    await expect(
      approvePolicyVersion(versionId, "Reviewed by an independent administrator"),
    ).resolves.toBeUndefined();
    await expect(
      activatePolicyVersion(versionId, "Publish the independently approved policy"),
    ).resolves.toBeUndefined();

    expect(mocks.rpc.mock.calls[0]).toEqual([
      "create_entitlement_policy_version",
      expect.not.objectContaining({ p_actor_id: expect.anything(), actorId: expect.anything() }),
    ]);
    expect(mocks.rpc.mock.calls[1]).toEqual([
      "approve_entitlement_policy_version",
      {
        p_version_id: versionId,
        p_reason: "Reviewed by an independent administrator",
      },
    ]);
  });

  it("maps an assignment mutation without browser-authored facts or actor identity", async () => {
    mocks.rpc.mockResolvedValue({ data: assignmentId, error: null });

    await expect(setEntitlementAssignment({
      subjectType: "user",
      subjectId: "user-7",
      capabilityKey: "commerce.booking",
      effect: "deny",
      startsAt: "2026-09-01T00:00:00.000Z",
      expiresAt: null,
      reason: "Temporarily restrict booking while the case is reviewed",
    })).resolves.toBe(assignmentId);

    expect(mocks.rpc).toHaveBeenCalledWith("set_entitlement_assignment", {
      p_subject_type: "user",
      p_subject_id: "user-7",
      p_capability_key: "commerce.booking",
      p_effect: "deny",
      p_starts_at: "2026-09-01T00:00:00.000Z",
      p_expires_at: null,
      p_reason: "Temporarily restrict booking while the case is reviewed",
    });
  });

  it("validates the access-control state returned by its governed read RPC", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        capabilities: [],
        policies: [],
        policyVersions: [],
        policyRequirements: [{ fact_key: "kyc_status" }],
        approvals: [{ decision: "approved" }],
        assignments: [],
        generation: 11,
      },
      error: null,
    });

    await expect(listAccessControlState()).resolves.toMatchObject({
      generation: 11,
      policyRequirements: [{ fact_key: "kyc_status" }],
      approvals: [{ decision: "approved" }],
    });

    mocks.rpc.mockResolvedValue({ data: { capabilities: [] }, error: null });
    await expect(listAccessControlState()).rejects.toThrow("policy_state_unavailable");
  });

  it("wraps rollback and revoke without caller-provided actor identity", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: versionId, error: null })
      .mockResolvedValueOnce({ data: null, error: null });

    await expect(rollbackEntitlementPolicy(
      "33333333-3333-4333-8333-333333333333",
      2,
      "Restore the last independently approved stable policy",
    )).resolves.toBe(versionId);
    await expect(revokeEntitlementAssignment(
      assignmentId,
      "Remove access after the documented review concluded",
    )).resolves.toBeUndefined();

    expect(mocks.rpc.mock.calls[0]).toEqual([
      "rollback_entitlement_policy",
      {
        p_policy_id: "33333333-3333-4333-8333-333333333333",
        p_target_version: 2,
        p_reason: "Restore the last independently approved stable policy",
      },
    ]);
    expect(mocks.rpc.mock.calls[1][1]).not.toHaveProperty("p_actor_id");
  });

  it("rejects malformed audit RPC JSON rather than trusting a cast", () => {
    expect(parseAuditResult({
      audit_id: "audit-1",
      notification_ids: ["notification-1"],
      notification_count: 1,
    })).toEqual({
      audit_id: "audit-1",
      notification_ids: ["notification-1"],
      notification_count: 1,
    });
    expect(parseAuditResult({ audit_id: "audit-1", notification_count: 1 })).toBeNull();
  });
});
