/** Starts best-effort affiliate attribution after a confirmed paid order. */
export function attributeCheckout(orderId: string): void {
  fetch("/api/checkout/attribute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderId }),
  }).catch(() => {});
}
