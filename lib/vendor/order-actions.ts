export type FulfilmentAction = 'ready' | 'fulfilled';
export type OrderLevelAction = FulfilmentAction | 'review' | null;

const PAYABLE_ORDER_STATES = new Set(['paid', 'completed']);

export function getItemFulfilmentAction(
  orderStatus: string,
  fulfilStatus: string,
): FulfilmentAction | null {
  if (!PAYABLE_ORDER_STATES.has(orderStatus)) return null;
  if (fulfilStatus === 'pending') return orderStatus === 'paid' ? 'ready' : 'fulfilled';
  if (fulfilStatus === 'ready') return 'fulfilled';
  return null;
}

export function getOrderFulfilmentAction(
  orderStatus: string,
  fulfilStatuses: string[],
): OrderLevelAction {
  if (!fulfilStatuses.length) return null;
  const actions = new Set(
    fulfilStatuses
      .map((status) => getItemFulfilmentAction(orderStatus, status))
      .filter((action): action is FulfilmentAction => Boolean(action)),
  );
  if (actions.size === 1) return [...actions][0];
  if (actions.size > 1) return 'review';
  return null;
}

export function getBatchFulfilmentActions(
  items: Array<{ orderStatus: string; fulfilStatus: string }>,
) {
  return items.reduce(
    (counts, item) => {
      const action = getItemFulfilmentAction(item.orderStatus, item.fulfilStatus);
      if (action) counts[action] += 1;
      return counts;
    },
    { ready: 0, fulfilled: 0 },
  );
}
