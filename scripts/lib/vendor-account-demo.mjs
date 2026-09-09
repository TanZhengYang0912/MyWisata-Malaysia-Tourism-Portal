import { stableUuid } from "./vendor-customer-demo.mjs";

const EARNING_PREFIX = "vendor-account-demo:earning";
const NOTIFICATION_PREFIX = "vendor-account-demo:notification";

function activeApproved(row) {
  return row.status === "active" && (!row.review_status || row.review_status === "approved");
}

function paidOrCompleted(order) {
  return order.status === "paid" || order.status === "completed";
}

function newestFirst(left, right) {
  const dateOrder = String(right.created_at ?? "").localeCompare(String(left.created_at ?? ""));
  return dateOrder || String(left.id).localeCompare(String(right.id));
}

function issue(code, details) {
  return { code, ...details };
}

function notificationRow({ eventKey, userId, vendorId, outletId, audienceRole, title, body, createdAt }) {
  return {
    id: stableUuid(eventKey),
    user_id: userId,
    type: "vendor_order",
    title,
    body,
    link: "/vendor/orders",
    read_at: null,
    created_at: createdAt,
    vendor_id: vendorId,
    outlet_id: outletId,
    audience_role: audienceRole,
    category: "vendor_orders",
    metadata: {
      demo: true,
      source: "vendor-account-demo",
    },
    event_key: eventKey,
  };
}

/**
 * @param {{
 *   vendors?: Array<Record<string, any>>,
 *   outlets?: Array<Record<string, any>>,
 *   products?: Array<Record<string, any>>,
 *   outletOffers?: Array<Record<string, any>>,
 *   outletManagers?: Array<Record<string, any>>,
 *   orders?: Array<Record<string, any>>,
 *   orderItems?: Array<Record<string, any>>,
 *   wallets?: Array<Record<string, any>>,
 *   walletTransactions?: Array<Record<string, any>>,
 *   notifications?: Array<Record<string, any>>,
 *   authUserIds?: string[],
 *   customerIds?: string[],
 *   now?: Date,
 * }} input
 */
export function buildVendorAccountDemoPlan({
  vendors = [],
  outlets = [],
  products = [],
  outletOffers = [],
  outletManagers = [],
  orders = [],
  orderItems = [],
  wallets = [],
  walletTransactions = [],
  notifications = [],
  authUserIds = [],
  customerIds = [],
  now = new Date(),
} = {}) {
  const approvedVendors = vendors
    .filter((vendor) => vendor.status === "approved")
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
  const approvedVendorIds = new Set(approvedVendors.map((vendor) => vendor.id));
  const activeOutlets = outlets
    .filter((outlet) => approvedVendorIds.has(outlet.vendor_id) && activeApproved(outlet))
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
  const authIds = new Set(authUserIds);
  const commerceCustomerIds = new Set(customerIds);
  const walletOwnerIds = new Set(wallets.map((wallet) => wallet.user_id));
  const existingNotificationKeys = new Set(
    notifications.map((notification) => notification.event_key).filter(Boolean),
  );
  const ordersById = new Map(
    orders
      .filter((order) => commerceCustomerIds.has(order.user_id) && paidOrCompleted(order))
      .map((order) => [order.id, order]),
  );
  const outletsById = new Map(activeOutlets.map((outlet) => [outlet.id, outlet]));
  const productsById = new Map(
    products.filter((product) => approvedVendorIds.has(product.vendor_id) && activeApproved(product))
      .map((product) => [product.id, product]),
  );
  const activeOfferKeys = new Set(
    outletOffers
      .filter((offer) => offer.status === "active")
      .map((offer) => `${offer.product_id}:${offer.outlet_id}`),
  );
  const managersByOutlet = new Map();

  for (const assignment of outletManagers) {
    if (!managersByOutlet.has(assignment.outlet_id)) managersByOutlet.set(assignment.outlet_id, []);
    managersByOutlet.get(assignment.outlet_id).push(assignment.user_id);
  }
  for (const managerIds of managersByOutlet.values()) managerIds.sort();

  const qualifyingItems = orderItems
    .filter((item) => {
      const outlet = outletsById.get(item.outlet_id);
      const product = productsById.get(item.product_id);
      return (
        ordersById.has(item.order_id)
        && approvedVendorIds.has(item.vendor_id)
        && outlet?.vendor_id === item.vendor_id
        && product?.vendor_id === item.vendor_id
        && (
          product.outlet_id === item.outlet_id
          || activeOfferKeys.has(`${item.product_id}:${item.outlet_id}`)
        )
        && Number(item.line_total) > 0
      );
    })
    .sort((left, right) => newestFirst(ordersById.get(left.order_id), ordersById.get(right.order_id)));
  const itemsByVendor = new Map();
  const itemsByOutlet = new Map();

  for (const item of qualifyingItems) {
    if (!itemsByVendor.has(item.vendor_id)) itemsByVendor.set(item.vendor_id, []);
    if (!itemsByOutlet.has(item.outlet_id)) itemsByOutlet.set(item.outlet_id, []);
    itemsByVendor.get(item.vendor_id).push(item);
    itemsByOutlet.get(item.outlet_id).push(item);
  }

  const earningActions = [];
  const notificationRows = [];
  const issues = [];
  const createdAt = now.toISOString();

  for (const vendor of approvedVendors) {
    const details = { vendorId: vendor.id, ownerId: vendor.owner_id };
    const item = itemsByVendor.get(vendor.id)?.[0];
    const ownerHasAuth = authIds.has(vendor.owner_id);
    const ownerHasWallet = walletOwnerIds.has(vendor.owner_id);

    if (!ownerHasAuth) issues.push(issue("vendor_owner_auth_missing", details));
    if (!ownerHasWallet) issues.push(issue("vendor_owner_wallet_missing", details));
    if (!item) issues.push(issue("vendor_customer_order_missing", details));

    if (!ownerHasAuth || !ownerHasWallet || !item) continue;

    const earningKey = `${EARNING_PREFIX}:${vendor.id}:${item.order_id}`;
    const ownerEarningPrefix = `${EARNING_PREFIX}:${vendor.id}:`;
    const ownerHasDemoEarning = walletTransactions.some((transaction) =>
      transaction.user_id === vendor.owner_id
      && transaction.idempotency_key?.startsWith(ownerEarningPrefix),
    );
    if (!ownerHasDemoEarning) {
      earningActions.push({
        vendorId: vendor.id,
        ownerId: vendor.owner_id,
        orderId: item.order_id,
        idempotencyKey: earningKey,
        note: `Demo earning from customer order ${item.order_id}`,
      });
    }

    const ownerEventKey = `${NOTIFICATION_PREFIX}:order:owner:${vendor.id}:${vendor.owner_id}`;
    if (!existingNotificationKeys.has(ownerEventKey)) {
      notificationRows.push(notificationRow({
        eventKey: ownerEventKey,
        userId: vendor.owner_id,
        vendorId: vendor.id,
        outletId: null,
        audienceRole: "vendor_owner",
        title: "Customer order activity",
        body: `A demo customer order is available for ${vendor.name}.`,
        createdAt,
      }));
    }
  }

  for (const outlet of activeOutlets) {
    const managerIds = managersByOutlet.get(outlet.id) ?? [];
    const item = itemsByOutlet.get(outlet.id)?.[0];
    if (managerIds.length === 0) {
      issues.push(issue("outlet_manager_assignment_missing", { vendorId: outlet.vendor_id, outletId: outlet.id }));
    }
    if (!item) {
      issues.push(issue("outlet_customer_order_missing", { vendorId: outlet.vendor_id, outletId: outlet.id }));
    }
    if (!item) continue;

    for (const managerId of managerIds) {
      if (!authIds.has(managerId)) {
        issues.push(issue("outlet_manager_auth_missing", {
          vendorId: outlet.vendor_id,
          outletId: outlet.id,
          managerId,
        }));
        continue;
      }

      const managerEventKey = `${NOTIFICATION_PREFIX}:order:manager:${outlet.id}:${managerId}`;
      if (existingNotificationKeys.has(managerEventKey)) continue;
      notificationRows.push(notificationRow({
        eventKey: managerEventKey,
        userId: managerId,
        vendorId: outlet.vendor_id,
        outletId: outlet.id,
        audienceRole: "outlet_manager",
        title: "Assigned outlet order activity",
        body: `A demo customer order is available for ${outlet.name}.`,
        createdAt,
      }));
    }
  }

  return {
    earningActions,
    notificationRows,
    issues,
    stats: {
      approvedVendors: approvedVendors.length,
      activeOutlets: activeOutlets.length,
      earningActions: earningActions.length,
      notificationRows: notificationRows.length,
      issues: issues.length,
    },
  };
}
