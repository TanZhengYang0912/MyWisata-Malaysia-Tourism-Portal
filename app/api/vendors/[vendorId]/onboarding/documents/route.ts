import { authorizeVendor } from '@/lib/vendor-authorization';
import { apiFail, apiOk } from '@/lib/validation/schemas';
import { validateVendorDocument, safeDocumentName } from '@/lib/vendor/onboarding-documents';

interface Props { params: Promise<{ vendorId: string }> }

export async function POST(request: Request, { params }: Props) {
  const { vendorId } = await params;
  const access = await authorizeVendor(vendorId, ['vendor_owner']);
  if (!access.ok) return access.response;

  let form: FormData;
  try { form = await request.formData(); } catch { return apiFail('INVALID_FORM', 'Could not parse form data', 400); }
  const documentType = form.get('documentType');
  const file = form.get('file');
  if (typeof documentType !== 'string' || !/^[a-z][a-z0-9_-]{2,59}$/i.test(documentType) || !(file instanceof File)) {
    return apiFail('MISSING_FIELDS', 'documentType and file are required', 422);
  }
  const checked = await validateVendorDocument(file);
  if (!checked.ok) return apiFail(checked.code, 'Document must be a valid PDF or image under 10 MB', 422);

  const path = `${vendorId}/${crypto.randomUUID()}-${safeDocumentName(file.name)}`;
  const storage = access.access.serviceDb.storage.from('vendor-documents');
  const uploaded = await storage.upload(path, checked.buffer, { contentType: file.type, upsert: false });
  if (uploaded.error) return apiFail('UPLOAD_FAILED', 'Unable to upload document', 502);
  const { data, error } = await access.access.serviceDb.from('vendor_documents').insert({
    vendor_id: vendorId,
    document_type: documentType,
    storage_path: path,
    original_name: file.name.slice(0, 255),
    mime_type: file.type,
    file_size: file.size,
    uploaded_by: access.access.userId,
  }).select('id,document_type,original_name,status,created_at').single();
  if (error) {
    await storage.remove([path]);
    return apiFail('DB_ERROR', error.message, 500);
  }
  await access.access.serviceDb.from('vendor_onboarding_profiles').update({ status: 'submitted', updated_at: new Date().toISOString() }).eq('vendor_id', vendorId);
  return apiOk(data, { status: 201 });
}

export async function GET(_request: Request, { params }: Props) {
  const { vendorId } = await params;
  const access = await authorizeVendor(vendorId, ['vendor_owner']);
  if (!access.ok) return access.response;
  const { data, error } = await access.access.serviceDb.from('vendor_documents')
    .select('id,document_type,original_name,mime_type,file_size,status,review_note,created_at,storage_path')
    .eq('vendor_id', vendorId).order('created_at', { ascending: false });
  if (error) return apiFail('DB_ERROR', error.message, 500);
  const items = await Promise.all((data ?? []).map(async (document) => {
    const signed = await access.access.serviceDb.storage.from('vendor-documents').createSignedUrl(document.storage_path, 300);
    return { ...document, storage_path: undefined, url: signed.data?.signedUrl ?? null };
  }));
  return apiOk(items);
}
