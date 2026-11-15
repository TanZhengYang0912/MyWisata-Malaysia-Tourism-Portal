import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CUSTOMER_CAPABILITY, resolveCustomerCapabilities, type CustomerCapability } from "@/lib/auth/customer-capabilities";

const auth = vi.hoisted(() => ({ value: { loading: false, currentUser: null as unknown, capabilities: {} as unknown, refreshUser: async () => {} } }));
const showCapabilityGate = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ usePathname: () => "/customer" }));
vi.mock("@/components/providers/auth", () => ({ useAuth: () => auth.value }));
vi.mock("@/components/customer/customer-capability-gate-dialog", () => ({ useCustomerCapabilityGateDialog: () => ({ showCapabilityGate }) }));

import { useCustomerCapabilityGate } from "@/components/customer/use-customer-capability-gate";

function gateResult(capability: CustomerCapability): boolean {
  let result: boolean | undefined;
  function Probe() {
    result = useCustomerCapabilityGate()(capability);
    return null;
  }
  renderToStaticMarkup(<Probe />);
  return result!;
}

describe("useCustomerCapabilityGate", () => {
  beforeEach(() => {
    showCapabilityGate.mockReset();
    auth.value = { loading: false, currentUser: null, capabilities: resolveCustomerCapabilities(null), refreshUser: async () => {} };
  });

  it("blocks every action silently while sign-in state is still loading", () => {
    auth.value.loading = true;
    for (const capability of [CUSTOMER_CAPABILITY.CART_MUTATION, CUSTOMER_CAPABILITY.ACCOUNT_MUTATION, CUSTOMER_CAPABILITY.CHECKOUT]) {
      expect(gateResult(capability)).toBe(false);
    }
    expect(showCapabilityGate).not.toHaveBeenCalled();
  });

  it("keeps guest checkout open and prompts guests for account actions once loaded", () => {
    expect(gateResult(CUSTOMER_CAPABILITY.CHECKOUT)).toBe(true);
    expect(showCapabilityGate).not.toHaveBeenCalled();
    expect(gateResult(CUSTOMER_CAPABILITY.ACCOUNT_MUTATION)).toBe(false);
    expect(showCapabilityGate).toHaveBeenCalledTimes(1);
  });
});
