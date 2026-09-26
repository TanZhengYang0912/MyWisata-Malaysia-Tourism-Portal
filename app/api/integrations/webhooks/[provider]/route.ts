import { createServiceClient } from "@/lib/supabase/service";
import { apiFail, apiOk } from "@/lib/validation/schemas";
import {
  parseExternalWebhookBody,
  parseExternalWebhookSourceIdentifier,
  readBoundedWebhookBody,
  verifyWebhookSignature,
} from "@/lib/integrations/webhook-verifier";

const ALLOWED_PROVIDERS = new Set([
  "generic_webhook",
  "ical",
  "klook",
  "agoda",
  "airbnb",
  "booking_com",
]);

interface Props {
  params: Promise<{ provider: string }>;
}

export async function POST(request: Request, { params }: Props) {
  const { provider } = await params;

  if (!ALLOWED_PROVIDERS.has(provider)) {
    return apiFail("INVALID_PROVIDER", `Unsupported provider: ${provider}`, 400);
  }

  const signature =
    request.headers.get("x-mywisata-signature") ||
    request.headers.get("x-signature") ||
    request.headers.get("x-hub-signature-256");

  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return apiFail("UNSUPPORTED_CONTENT_TYPE", "Webhook body must be JSON", 415);
  }

  let rawBodyText: string;
  let parsedJson: unknown;
  try {
    rawBodyText = await readBoundedWebhookBody(request);
    parsedJson = JSON.parse(rawBodyText);
  } catch (error) {
    if (error instanceof Error && error.message === "Webhook body is too large") {
      return apiFail("PAYLOAD_TOO_LARGE", "Webhook body exceeds the 64 KB limit", 413);
    }
    return apiFail("INVALID_JSON", "Body is not valid JSON", 400);
  }

  let sourceIdentifier: string;
  try {
    sourceIdentifier = parseExternalWebhookSourceIdentifier(parsedJson);
  } catch {
    return apiFail("VALIDATION_FAILED", "Invalid source identifier", 422);
  }

  const supabase = createServiceClient();

  // Find source configuration
  const { data: source, error: sourceError } = await supabase
    .from("external_booking_sources")
    .select("id, vendor_id, outlet_id, product_id, webhook_secret, sync_enabled")
    .eq("provider", provider)
    .eq("external_source_identifier", sourceIdentifier)
    .maybeSingle();

  if (sourceError) {
    return apiFail("DB_ERROR", sourceError.message, 500);
  }
  if (!source) {
    return apiFail("SOURCE_NOT_FOUND", "No matching external booking source configured", 404);
  }
  if (!source.sync_enabled) {
    return apiFail("SYNC_DISABLED", "Synchronization is disabled for this external source", 403);
  }

  // Cryptographic signature check
  const isValidSignature = verifyWebhookSignature(rawBodyText, signature, source.webhook_secret);
  if (!isValidSignature) {
    return apiFail("UNAUTHORIZED", "Invalid or missing webhook signature", 401);
  }

  let eventPayload;
  try {
    eventPayload = parseExternalWebhookBody(parsedJson);
  } catch (err) {
    return apiFail("VALIDATION_FAILED", err instanceof Error ? err.message : "Validation failed", 422);
  }

  // Invoke atomic capacity check RPC
  const { data: rpcResult, error: rpcError } = await supabase.rpc("apply_external_reservation", {
    p_source_id: source.id,
    p_external_booking_id: eventPayload.externalBookingId,
    p_slot_id: eventPayload.slotId,
    p_quantity: eventPayload.quantity,
    p_action: eventPayload.action,
    p_guest_name: eventPayload.guestName ?? null,
    p_guest_email: eventPayload.guestEmail ?? null,
    p_payload: eventPayload.metadata ?? {},
  });

  if (rpcError) {
    return apiFail("RESERVATION_FAILED", rpcError.message, 400);
  }

  const res = rpcResult as {
    success: boolean;
    conflict?: string;
    action?: string;
    reservation_id?: string;
    capacity?: number;
    booked?: number;
    requested?: number;
  };

  // Database capacity authority: If slot is full, fail with 409 conflict
  if (res && res.success === false && res.conflict === "overbooked") {
    return apiFail(
      "CAPACITY_EXCEEDED",
      "External reservation exceeds available slot capacity. Reservation flagged as overbooked.",
      409,
      res,
    );
  }

  return apiOk(res);
}
