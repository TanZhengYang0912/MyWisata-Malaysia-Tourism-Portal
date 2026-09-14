import { z } from 'zod';
import { apiFail, apiOk, parseBody } from '@/lib/validation/schemas';
import { authorizeVendor } from '@/lib/vendor-authorization';
import { normalizeVoucherCsvDraft, type VoucherCsvDraftDocument } from '@/lib/vendor/voucher-csv-draft';

interface Props { params: Promise<{ vendorId: string }> }

const rowSchema = z.object({
  code: z.string().max(50),
  name: z.string().max(255),
  voucherType: z.enum(['fixed', 'percent', 'bogo']),
  discountValue: z.string().max(32),
  minSpend: z.string().max(32),
  maxUses: z.string().max(32),
  perCustomerLimit: z.string().max(32),
  validFrom: z.string().max(64),
  validUntil: z.string().max(64),
  outletId: z.string().max(64),
  productId: z.string().max(64),
  buyQuantity: z.string().max(32),
  freeQuantity: z.string().max(32),
}).strict();

const documentSchema = z.object({
  title: z.string().trim().min(1).max(120),
  rows: z.array(rowSchema).min(1).max(500),
  autoGenerate: z.boolean(),
  codePrefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{0,20}$/),
}).strict();

const saveSchema = z.object({
  id: z.string().uuid().optional(),
  document: documentSchema,
  expectedDraftVersion: z.number().int().min(1).optional(),
}).strict();

function draftResponse(row: Record<string, unknown>) {
  return {
    id: row.id,
    title: row.title,
    document: row.document,
    draftVersion: Number(row.draft_version || 1),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function GET(request: Request, { params }: Props) {
  const { vendorId } = await params;
  const access = await authorizeVendor(vendorId);
  if (!access.ok) return access.response;
  const managerOutletId = access.access.isOutletManager && access.access.outletIds.length === 1 ? access.access.outletIds[0] : null;
  if (access.access.isOutletManager && !managerOutletId) return apiFail('FORBIDDEN', 'Outlet managers must have exactly one assigned outlet to manage voucher CSV drafts.', 403);

  const draftId = new URL(request.url).searchParams.get('id');
  let baseQuery = access.access.serviceDb
    .from('vendor_voucher_csv_drafts')
    .select('id,title,document,draft_version,created_at,updated_at')
    .eq('vendor_id', vendorId)
    .order('updated_at', { ascending: false });
  if (access.access.isOutletManager) baseQuery = baseQuery.eq('created_by', access.access.userId);
  if (draftId) {
    const { data, error } = await baseQuery.eq('id', draftId).maybeSingle();
    if (error) return apiFail('DB_ERROR', error.message, 500);
    if (!data) return apiFail('NOT_FOUND', 'Voucher CSV draft not found', 404);
    return apiOk(draftResponse(data as Record<string, unknown>));
  }
  const { data, error } = await baseQuery;
  if (error) return apiFail('DB_ERROR', error.message, 500);
  return apiOk((data || []).map((row) => draftResponse(row as Record<string, unknown>)));
}

export async function POST(request: Request, { params }: Props) {
  const { vendorId } = await params;
  const access = await authorizeVendor(vendorId);
  if (!access.ok) return access.response;
  const managerOutletId = access.access.isOutletManager && access.access.outletIds.length === 1 ? access.access.outletIds[0] : null;
  if (access.access.isOutletManager && !managerOutletId) return apiFail('FORBIDDEN', 'Outlet managers must have exactly one assigned outlet to manage voucher CSV drafts.', 403);
  const parsed = await parseBody(request, saveSchema);
  if (!parsed.ok) return parsed.response;

  const normalizedDocument = normalizeVoucherCsvDraft(parsed.data.document as VoucherCsvDraftDocument);
  if (access.access.isOutletManager && normalizedDocument.rows.some((row) => row.outletId && row.outletId !== managerOutletId)) {
    return apiFail('FORBIDDEN', 'Voucher CSV draft contains an outlet outside your assigned scope.', 403, { reason: 'outlet is outside your assigned scope' });
  }
  const document = access.access.isOutletManager
    ? { ...normalizedDocument, rows: normalizedDocument.rows.map((row) => ({ ...row, outletId: managerOutletId })) }
    : normalizedDocument;
  const db = access.access.serviceDb;
  if (parsed.data.id) {
    let existingQuery = db
      .from('vendor_voucher_csv_drafts')
      .select('draft_version')
      .eq('id', parsed.data.id)
      .eq('vendor_id', vendorId);
    if (access.access.isOutletManager) existingQuery = existingQuery.eq('created_by', access.access.userId);
    const { data: existing, error: existingError } = await existingQuery.maybeSingle();
    if (existingError) return apiFail('DB_ERROR', existingError.message, 500);
    if (!existing) return apiFail('NOT_FOUND', 'Voucher CSV draft not found', 404);
    const currentVersion = Number(existing.draft_version || 1);
    if (parsed.data.expectedDraftVersion !== undefined && parsed.data.expectedDraftVersion !== currentVersion) {
      return apiFail('STALE_DRAFT', 'This draft changed elsewhere. Reload before saving.', 409, { currentVersion });
    }
    let updateQuery = db
      .from('vendor_voucher_csv_drafts')
      .update({ title: document.title, document, draft_version: currentVersion + 1, updated_at: new Date().toISOString() })
      .eq('id', parsed.data.id)
      .eq('vendor_id', vendorId);
    if (access.access.isOutletManager) updateQuery = updateQuery.eq('created_by', access.access.userId);
    const { data, error } = await updateQuery.select('id,title,document,draft_version,created_at,updated_at').single();
    if (error) return apiFail('DB_ERROR', error.message, 500);
    return apiOk(draftResponse(data as Record<string, unknown>));
  }

  const { data, error } = await db
    .from('vendor_voucher_csv_drafts')
    .insert({ vendor_id: vendorId, created_by: access.access.userId, title: document.title, document })
    .select('id,title,document,draft_version,created_at,updated_at')
    .single();
  if (error) return apiFail('DB_ERROR', error.message, 500);
  return apiOk(draftResponse(data as Record<string, unknown>), { status: 201 });
}

export async function DELETE(request: Request, { params }: Props) {
  const { vendorId } = await params;
  const access = await authorizeVendor(vendorId);
  if (!access.ok) return access.response;
  const managerOutletId = access.access.isOutletManager && access.access.outletIds.length === 1 ? access.access.outletIds[0] : null;
  if (access.access.isOutletManager && !managerOutletId) return apiFail('FORBIDDEN', 'Outlet managers must have exactly one assigned outlet to manage voucher CSV drafts.', 403);
  const draftId = new URL(request.url).searchParams.get('id');
  if (!draftId || !z.string().uuid().safeParse(draftId).success) return apiFail('INVALID_DRAFT', 'A valid draft id is required', 400);
  let deleteQuery = access.access.serviceDb
    .from('vendor_voucher_csv_drafts')
    .delete()
    .eq('id', draftId)
    .eq('vendor_id', vendorId);
  if (access.access.isOutletManager) deleteQuery = deleteQuery.eq('created_by', access.access.userId);
  const { error } = await deleteQuery;
  if (error) return apiFail('DB_ERROR', error.message, 500);
  return apiOk({ id: draftId, deleted: true });
}
