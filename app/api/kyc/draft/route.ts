import { createHash } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk } from '@/lib/validation/schemas';
import { readBoundedFormData, RequestBodyError } from '@/lib/validation/request-body';
import { validateKycUploadFile } from '@/lib/kyc/submission';
import { prepareKycEvidenceImage } from '@/lib/kyc/evidence-image';
import { randomUUID } from 'node:crypto';
import { withPortalWorkload, WorkloadUnavailableError } from '@/lib/operations/workload';
import { reserveGuestRateLimit } from '@/lib/checkout/guest-session';

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
  if(!await reserveGuestRateLimit(`kyc-draft:${user.id}`,3,600))return privateResponse(apiFail('RATE_LIMITED','Too many draft saves; please try again later',429));
  const idle=integerEnv('KYC_DRAFT_IDLE_TTL_SECONDS'),absolute=integerEnv('KYC_DRAFT_ABSOLUTE_TTL_SECONDS');
  if(!idle||!absolute||idle>absolute)return privateResponse(apiFail('DRAFT_DISABLED','Saved drafts are not configured',503));
  let form:FormData;
  try{form=await readBoundedFormData(request,10*1024*1024+96*1024,request.signal)}
  catch(error){return privateResponse(apiFail('INVALID_FORM','Could not read draft images',error instanceof RequestBodyError&&error.code==='too_large'?413:400))}
  const documentType=form.get('documentType'),holderName=form.get('holderName'),draftIdText=form.get('draftId'),versionText=form.get('version');
  const frontEntry=form.get('frontFile'),backEntry=form.get('backFile');
  const frontFile=frontEntry instanceof File?frontEntry:null,backFile=backEntry instanceof File?backEntry:null;
  const reuseFront=form.get('reuseFront')==='true',reuseBack=form.get('reuseBack')==='true';
  if(!validDocType(documentType)||typeof holderName!=='string'||holderName.trim().length>100
    ||(!frontFile&&!reuseFront)||(!backFile&&!reuseBack))return privateResponse(apiFail('INVALID_DRAFT','Draft fields and evidence are required',422));
  const service=createServiceClient();
  const {data: previousData}=await service.rpc('get_kyc_draft',{p_owner_user_id:user.id});
  const previous=Array.isArray(previousData)?previousData[0]:previousData;
  const draftId=typeof draftIdText==='string'&&/^[0-9a-f-]{36}$/i.test(draftIdText)?draftIdText:previous?.id??randomUUID();
  if(previous&&previous.id!==draftId)return privateResponse(apiFail('CONFLICT','A saved draft already exists; reload it before saving changes',409));
  const version=typeof versionText==='string'&&/^\d+$/.test(versionText)?Number(versionText):previous&&previous.id===draftId?Number(previous.version):null;
  const existingFrontPath=typeof previous?.front_storage_path==='string'?previous.front_storage_path:null;
  const existingBackPath=typeof previous?.back_storage_path==='string'?previous.back_storage_path:null;
  if((reuseFront||!frontFile)&&!existingFrontPath||(reuseBack||!backFile)&&!existingBackPath)
    return privateResponse(apiFail('CONFLICT','Saved evidence is unavailable; reload the draft',409));
  const bucket=service.storage.from('kyc-documents');
  const removeOrQueue = async (paths: string[]) => {
    if(!paths.length)return;
    const [{data:currentDraft,error:draftError},{data:formalReferences,error:referenceError}]=await Promise.all([
      service.rpc('get_kyc_draft',{p_owner_user_id:user.id}),
      service.from('kyc_submission_documents').select('storage_path').in('storage_path',paths),
    ]);
    if(draftError||referenceError||!Array.isArray(formalReferences)){
      await Promise.all(paths.map((path)=>Promise.resolve(service.rpc('record_kyc_draft_cleanup_orphan',{p_owner_user_id:user.id,p_storage_path:path}))
        .then(({error})=>{if(error)console.error('kyc_draft_cleanup_orphan_record_failed',{draftId});})
        .catch(()=>console.error('kyc_draft_cleanup_orphan_record_failed',{draftId}))));
      return;
    }
    const draft=Array.isArray(currentDraft)?currentDraft[0]:currentDraft;
    const referenced=new Set([draft?.front_storage_path,draft?.back_storage_path,...formalReferences.map((row:{storage_path:string})=>row.storage_path)]);
    const safePaths=paths.filter((path)=>!referenced.has(path));
    const removed=safePaths.length?await bucket.remove(safePaths).catch(()=>({error:{message:'remove_failed'}})):{error:null};
    if(removed.error)await Promise.all(safePaths.map((path)=>Promise.resolve(service.rpc('record_kyc_draft_cleanup_orphan',{p_owner_user_id:user.id,p_storage_path:path}))
      .then(({error})=>{if(error)console.error('kyc_draft_cleanup_orphan_record_failed',{draftId});})
      .catch(()=>console.error('kyc_draft_cleanup_orphan_record_failed',{draftId}))));
  };
  const newlyUploaded:string[]=[];
  const resolveSide=async (side:'front'|'back',file:File|null,reuse:boolean,oldPath:string|null)=>{
    const oldInput=previous?.[`${side}_input_sha256`];
    const oldEvidence=previous?.[`${side}_evidence_sha256`];
    if(reuse||!file){
      if(!oldPath)return null;
      let evidenceHash=typeof oldEvidence==='string'?oldEvidence:null;
      if(!evidenceHash){
        const downloaded=await bucket.download(oldPath);
        if(downloaded.error||!downloaded.data)throw new Error('draft_evidence_unavailable');
        evidenceHash=createHash('sha256').update(Buffer.from(await downloaded.data.arrayBuffer())).digest('hex');
      }
      return {path:oldPath,inputHash:typeof oldInput==='string'?oldInput:null,evidenceHash};
    }
    const checked=await validateKycUploadFile(file);
    if(!checked.ok||!extension(file.type))throw new Error('invalid_draft_evidence');
    const inputHash=createHash('sha256').update(Buffer.from(checked.buffer)).digest('hex');
    if(typeof oldInput==='string'&&oldInput===inputHash&&oldPath){
      let evidenceHash=typeof oldEvidence==='string'?oldEvidence:null;
      if(!evidenceHash){
        const downloaded=await bucket.download(oldPath);
        if(downloaded.error||!downloaded.data)throw new Error('draft_evidence_unavailable');
        evidenceHash=createHash('sha256').update(Buffer.from(await downloaded.data.arrayBuffer())).digest('hex');
      }
      return {path:oldPath,inputHash,evidenceHash};
    }
    const prepared=await prepareKycEvidenceImage(Buffer.from(checked.buffer),file.type);
    const evidenceHash=createHash('sha256').update(prepared.stored).digest('hex');
    const path=`${user.id}/drafts/${draftId}/${randomUUID()}/${side}.${extension(file.type)}`;
    const uploaded=await bucket.upload(path,prepared.stored,{contentType:file.type,upsert:false});
    if(uploaded.error)throw new Error('draft_upload_failed');
    newlyUploaded.push(path);
    return {path,inputHash,evidenceHash};
  };
  let front:{path:string;inputHash:string|null;evidenceHash:string}|null=null;
  let back:{path:string;inputHash:string|null;evidenceHash:string}|null=null;
  const resolveBothSides=async () => Promise.all([
    resolveSide('front',frontFile,reuseFront,existingFrontPath),
    resolveSide('back',backFile,reuseBack,existingBackPath),
  ]);
  try{
    [front,back]=frontFile||backFile
      ? await withPortalWorkload('kyc_upload',resolveBothSides,request.signal)
      : await resolveBothSides();
  }catch(error){
    await removeOrQueue(newlyUploaded);
    const invalid=error instanceof Error&&error.message==='invalid_draft_evidence';
    const busy=error instanceof WorkloadUnavailableError&&error.code==='busy';
    const response=apiFail(invalid?'INVALID_EVIDENCE':busy?'DRAFT_BUSY':'DRAFT_SAVE_FAILED',invalid?'Draft images are invalid':busy?'Document processing is busy; keep your files and try again shortly':'Draft images could not be saved',invalid?422:busy?429:503);
    if(busy)response.headers.set('Retry-After','10');
    return privateResponse(response);
  }
  if(!front||!back){await removeOrQueue(newlyUploaded);return privateResponse(apiFail('INVALID_DRAFT','Both evidence sides are required',422));}
  const revision=createHash('sha256').update(`kyc-evidence-v1\0${front.evidenceHash}\0${back.evidenceHash}`).digest('hex');
  const {data,error}=await service.rpc('save_kyc_draft_v2',{
    p_owner_user_id:user.id,p_draft_id:draftId,p_expected_version:version,p_document_type:documentType,p_holder_name:holderName.trim()||null,
    p_front_storage_path:front.path,p_back_storage_path:back.path,p_front_input_sha256:front.inputHash,p_back_input_sha256:back.inputHash,
    p_front_evidence_sha256:front.evidenceHash,p_back_evidence_sha256:back.evidenceHash,p_evidence_revision:revision,
    p_idle_ttl_seconds:idle,p_absolute_ttl_seconds:absolute,
  });
  if(error){await removeOrQueue(newlyUploaded);const status=error.message.includes('kyc_draft_conflict')?409:503;return privateResponse(apiFail(status===409?'CONFLICT':'DRAFT_SAVE_FAILED',status===409?'Draft changed in another tab; reload the saved draft':'Draft could not be saved',status))}
  const row=Array.isArray(data)?data[0]:data;
  if(!row||typeof row.draft_id!=='string')return privateResponse(apiFail('DRAFT_SAVE_FAILED','Draft could not be confirmed as saved',503));
    return privateResponse(apiOk({draft:{id:row.draft_id,version:row.version,documentType,holderName:holderName.trim(),hasFront:true,hasBack:true,expiresAt:row.expires_at,evidenceRevision:revision,changed:row.changed===true}}));
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
