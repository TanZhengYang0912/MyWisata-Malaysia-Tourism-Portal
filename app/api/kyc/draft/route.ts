import { createHash } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk } from '@/lib/validation/schemas';
import { readBoundedFormData, RequestBodyError } from '@/lib/validation/request-body';
import { validateKycUploadFile } from '@/lib/kyc/submission';
import { prepareKycEvidenceImage } from '@/lib/kyc/evidence-image';
import { randomUUID } from 'node:crypto';

const validDocType = (value: FormDataEntryValue | null): value is 'national_id'|'passport'|'driving_license' =>
  value==='national_id'||value==='passport'||value==='driving_license';
const extension = (mime: string) => mime==='image/jpeg'?'jpg':mime==='image/png'?'png':mime==='image/webp'?'webp':null;
const integerEnv = (key: string) => { const value=Number(process.env[key]); return Number.isSafeInteger(value)&&value>0?value:null; };
const privateResponse = (response: Response) => { response.headers.set('Cache-Control','private, no-store, max-age=0'); response.headers.set('Referrer-Policy','no-referrer'); return response; };

export async function GET() {
  const auth=await createClient(); const {data:{user}}=await auth.auth.getUser();
  if(!user)return privateResponse(apiFail('UNAUTHORIZED','Sign in required',401));
  const service=createServiceClient();
  const {data,error}=await service.rpc('get_kyc_draft',{p_owner_user_id:user.id});
  if(error)return privateResponse(apiFail('DRAFT_UNAVAILABLE','Saved KYC draft could not be loaded',503));
  const row=Array.isArray(data)?data[0]:data;
  if(!row)return privateResponse(apiOk({draft:null}));
  return privateResponse(apiOk({draft:{id:row.id,version:row.version,documentType:row.document_type,holderName:row.holder_name,
    hasFront:Boolean(row.front_storage_path),hasBack:Boolean(row.back_storage_path),evidenceRevision:row.evidence_revision,
    expiresAt:row.expires_at}}));
}

export async function POST(request:Request) {
  const auth=await createClient(); const {data:{user}}=await auth.auth.getUser();
  if(!user)return privateResponse(apiFail('UNAUTHORIZED','Sign in required',401));
  const idle=integerEnv('KYC_DRAFT_IDLE_TTL_SECONDS'),absolute=integerEnv('KYC_DRAFT_ABSOLUTE_TTL_SECONDS');
  if(!idle||!absolute||idle>absolute)return privateResponse(apiFail('DRAFT_DISABLED','Saved drafts are not configured',503));
  let form:FormData;
  try{form=await readBoundedFormData(request,10*1024*1024+96*1024,request.signal)}
  catch(error){return privateResponse(apiFail('INVALID_FORM','Could not read draft images',error instanceof RequestBodyError&&error.code==='too_large'?413:400))}
  const documentType=form.get('documentType'),holderName=form.get('holderName'),draftIdText=form.get('draftId'),versionText=form.get('version');
  const frontFile=form.get('frontFile'),backFile=form.get('backFile');
  if(!validDocType(documentType)||typeof holderName!=='string'||holderName.trim().length>100
    ||!(frontFile instanceof File)||!(backFile instanceof File))return privateResponse(apiFail('INVALID_DRAFT','Draft fields and both images are required',422));
  const service=createServiceClient();
  const {data: previousData}=await service.rpc('get_kyc_draft',{p_owner_user_id:user.id});
  const previous=Array.isArray(previousData)?previousData[0]:previousData;
  const draftId=typeof draftIdText==='string'&&/^[0-9a-f-]{36}$/i.test(draftIdText)?draftIdText:previous?.id??randomUUID();
  if(previous&&previous.id!==draftId)return privateResponse(apiFail('CONFLICT','A saved draft already exists; reload it before saving changes',409));
  const version=typeof versionText==='string'&&/^\d+$/.test(versionText)?Number(versionText):previous&&previous.id===draftId?Number(previous.version):null;
  const [frontCheck,backCheck]=await Promise.all([validateKycUploadFile(frontFile),validateKycUploadFile(backFile)]);
  if(!frontCheck.ok||!backCheck.ok)return privateResponse(apiFail('INVALID_EVIDENCE','Draft images are invalid',422));
  let front:Awaited<ReturnType<typeof prepareKycEvidenceImage>>,back:Awaited<ReturnType<typeof prepareKycEvidenceImage>>;
  try{front=await prepareKycEvidenceImage(Buffer.from(frontCheck.buffer),frontFile.type);back=await prepareKycEvidenceImage(Buffer.from(backCheck.buffer),backFile.type)}
  catch{return privateResponse(apiFail('INVALID_FILE_CONTENT','Draft images could not be processed',422))}
  const revision=createHash('sha256').update(front.stored).update(back.stored).digest('hex');
  const prefix=`${user.id}/drafts/${draftId}/${randomUUID()}`;
  const frontPath=`${prefix}/front.${extension(frontFile.type)}`,backPath=`${prefix}/back.${extension(backFile.type)}`;
  if(!extension(frontFile.type)||!extension(backFile.type))return privateResponse(apiFail('INVALID_EVIDENCE','Draft image type is invalid',422));
  const bucket=service.storage.from('kyc-documents');
  const removeOrQueue = async (paths: string[]) => {
    const removed=await bucket.remove(paths).catch(()=>({error:{message:'remove_failed'}}));
    if(removed.error)await Promise.all(paths.map((path)=>Promise.resolve(service.rpc('record_kyc_draft_cleanup_orphan',{p_owner_user_id:user.id,p_storage_path:path}))
      .then(({error})=>{if(error)console.error('kyc_draft_cleanup_orphan_record_failed',{draftId});})
      .catch(()=>console.error('kyc_draft_cleanup_orphan_record_failed',{draftId}))));
  };
  let upFront:{error:unknown|null},upBack:{error:unknown|null};
  try{[upFront,upBack]=await Promise.all([
    bucket.upload(frontPath,front.stored,{contentType:frontFile.type,upsert:false}),
    bucket.upload(backPath,back.stored,{contentType:backFile.type,upsert:false}),
  ])}catch{await removeOrQueue([frontPath,backPath]);return privateResponse(apiFail('DRAFT_SAVE_FAILED','Draft images could not be saved',503))}
  if(upFront.error||upBack.error){await removeOrQueue([...(upFront.error?[]:[frontPath]),...(upBack.error?[]:[backPath])]);return privateResponse(apiFail('DRAFT_SAVE_FAILED','Draft images could not be saved',503))}
  const {data,error}=await service.rpc('save_kyc_draft',{
    p_owner_user_id:user.id,p_draft_id:draftId,p_expected_version:version,p_document_type:documentType,p_holder_name:holderName.trim()||null,
    p_front_storage_path:frontPath,p_back_storage_path:backPath,p_evidence_revision:revision,
    p_idle_ttl_seconds:idle,p_absolute_ttl_seconds:absolute,p_ocr_holder_name:null,
    p_ocr_number_hmac:null,p_ocr_last4:null,p_ocr_status:null,p_ocr_engine:'unknown',
  });
  if(error){await removeOrQueue([frontPath,backPath]);const status=error.message.includes('kyc_draft_conflict')?409:503;return privateResponse(apiFail(status===409?'CONFLICT':'DRAFT_SAVE_FAILED',status===409?'Draft changed in another tab; reload the saved draft':'Draft could not be saved',status))}
  const row=Array.isArray(data)?data[0]:data;
  if(!row||typeof row.draft_id!=='string')return privateResponse(apiFail('DRAFT_SAVE_FAILED','Draft could not be confirmed as saved',503));
  if(previous&&previous.id===draftId){
    const obsolete=[previous.front_storage_path,previous.back_storage_path].filter((path):path is string=>typeof path==='string'&&!([frontPath,backPath].includes(path)));
    if(obsolete.length){const removed=await bucket.remove(obsolete);if(removed.error)console.error('kyc_draft_old_image_cleanup_failed',{draftId});}
  }
  return privateResponse(apiOk({draft:{id:row.draft_id,version:row.version,documentType,holderName:holderName.trim(),hasFront:true,hasBack:true,expiresAt:row.expires_at,evidenceRevision:revision}}));
}

export async function DELETE(request:Request) {
  const auth=await createClient(); const {data:{user}}=await auth.auth.getUser();
  if(!user)return privateResponse(apiFail('UNAUTHORIZED','Sign in required',401));
  let body:unknown;try{body=await request.json()}catch{return privateResponse(apiFail('INVALID_REQUEST','Invalid draft request',400))}
  if(!body||typeof body!=='object'||!('draftId'in body)||typeof body.draftId!=='string'||!/^[0-9a-f-]{36}$/i.test(body.draftId))return privateResponse(apiFail('INVALID_REQUEST','Draft ID is required',422));
  const {data,error}=await createServiceClient().rpc('delete_kyc_draft',{p_owner_user_id:user.id,p_draft_id:body.draftId});
  if(error)return privateResponse(apiFail('DRAFT_DELETE_FAILED','Draft could not be deleted',503));
  return privateResponse(apiOk({deleted:data===true}));
}
