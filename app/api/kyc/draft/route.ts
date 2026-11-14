import { createHash, createHmac } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk } from '@/lib/validation/schemas';
import { readBoundedFormData, RequestBodyError } from '@/lib/validation/request-body';
import { hasDuplicateKycDocumentSides, validateKycUploadFile } from '@/lib/kyc/submission';
import { prepareKycEvidenceImage } from '@/lib/kyc/evidence-image';
import { randomUUID } from 'node:crypto';
import { withPortalWorkload, WorkloadUnavailableError } from '@/lib/operations/workload';
import { guestAddressRateKey, reserveGuestRateLimit } from '@/lib/checkout/guest-session';
import { getRequiredKycDocumentSides, type KycDocumentType } from '@/lib/kyc/document-policy';
import { createKycEvidenceRevision } from '@/lib/kyc/submission';
import { extractKycPreviewFields } from '@/lib/kyc/ocr';
import { hashICWithHmac } from '@/lib/kyc/hash';
import { buildKycOcrSourceRevision } from '@/lib/kyc/ocr-observation';

const validDocType = (value: FormDataEntryValue | null): value is 'national_id'|'passport'|'driving_license' =>
  value==='national_id'||value==='passport'||value==='driving_license';
const extension = (mime: string) => mime==='image/jpeg'?'jpg':mime==='image/png'?'png':mime==='image/webp'?'webp':null;
const integerEnv = (key: string) => { const value=Number(process.env[key]); return Number.isSafeInteger(value)&&value>0?value:null; };
const privateResponse = (response: Response) => { response.headers.set('Cache-Control','private, no-store, max-age=0'); response.headers.set('Referrer-Policy','no-referrer'); return response; };
const cleanTransformVersion='clean-v1',parserVersion='kyc-parser-v1',policyVersion='kyc-policy-v1';
const uuidPattern=/^[0-9a-f-]{36}$/i;
const cleanOcrEnabled=()=>process.env.KYC_CLEAN_OCR_ENABLED==='true'&&process.env.KYC_OCR_PREVIEW_ENABLED==='true';
function capabilities(){
  const configuredQuality=process.env.KYC_DOCUMENT_QUALITY_MODE;
  return {documentCapture:process.env.KYC_DOCUMENT_CAPTURE_ENABLED==='true',qualityMode:configuredQuality==='advisory'?'advisory':'off',
    cleanOcr:cleanOcrEnabled(),chinesePassportOcr:process.env.KYC_CHINESE_PASSPORT_OCR_ENABLED==='true'};
}
function withAbortSignal<T>(query:PromiseLike<T>&{abortSignal?:(signal:AbortSignal)=>PromiseLike<T>},signal:AbortSignal){
  return query.abortSignal?.(signal)??query;
}

export async function GET() {
  const auth=await createClient(); const {data:{user}}=await auth.auth.getUser();
  if(!user)return privateResponse(apiFail('UNAUTHORIZED','Sign in required',401));
  const service=createServiceClient();
  const {data,error}=await service.rpc('get_kyc_draft',{p_owner_user_id:user.id});
  if(error)return privateResponse(apiFail('DRAFT_UNAVAILABLE','Saved KYC draft could not be loaded',503));
  const row=Array.isArray(data)?data[0]:data;
  if(!row)return privateResponse(apiOk({draft:null,capabilities:capabilities()}));
  return privateResponse(apiOk({draft:{id:row.id,version:row.version,documentType:row.document_type,holderName:row.holder_name,
    hasFront:Boolean(row.front_storage_path),hasBack:Boolean(row.back_storage_path),evidenceRevision:row.evidence_revision,
    expiresAt:row.expires_at},capabilities:capabilities()}));
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
  const intentEntry=form.get('intent'),intent=intentEntry==='save_and_recognize'?'save_and_recognize':'save';
  const operationIdEntry=form.get('operationId');
  const frontEntry=form.get('frontFile'),backEntry=form.get('backFile');
  const frontFile=frontEntry instanceof File?frontEntry:null,backFile=backEntry instanceof File?backEntry:null;
  const reuseFront=form.get('reuseFront')==='true',reuseBack=form.get('reuseBack')==='true';
  if(!validDocType(documentType)||typeof holderName!=='string'||holderName.trim().length>100
    ||(!frontFile&&!reuseFront)
    ||(getRequiredKycDocumentSides(documentType as KycDocumentType).includes('back')&&!backFile&&!reuseBack))return privateResponse(apiFail('INVALID_DRAFT','Draft fields and evidence are required',422));
  const service=createServiceClient();
  const {data: previousData}=await service.rpc('get_kyc_draft',{p_owner_user_id:user.id});
  const previous=Array.isArray(previousData)?previousData[0]:previousData;
  const draftId=typeof draftIdText==='string'&&/^[0-9a-f-]{36}$/i.test(draftIdText)?draftIdText:previous?.id??randomUUID();
  if(previous&&previous.id!==draftId)return privateResponse(apiFail('CONFLICT','A saved draft already exists; reload it before saving changes',409));
  const version=typeof versionText==='string'&&/^\d+$/.test(versionText)?Number(versionText):previous&&previous.id===draftId?Number(previous.version):null;
  const existingFrontPath=typeof previous?.front_storage_path==='string'?previous.front_storage_path:null;
  const existingBackPath=typeof previous?.back_storage_path==='string'?previous.back_storage_path:null;
  const requiredSides=getRequiredKycDocumentSides(documentType as KycDocumentType);
  if(intent==='save_and_recognize'){
    if(!cleanOcrEnabled()||documentType==='passport'&&process.env.KYC_CHINESE_PASSPORT_OCR_ENABLED!=='true')
      return privateResponse(apiFail('PREVIEW_DISABLED','Document recognition is not available yet',503));
    if(form.get('ocrConsent')!=='true')return privateResponse(apiFail('OCR_CONSENT_REQUIRED','Consent is required for document recognition',422));
    if(typeof operationIdEntry!=='string'||!uuidPattern.test(operationIdEntry))return privateResponse(apiFail('INVALID_OPERATION','A valid recognition operation is required',422));
    if(requiredSides.some((side)=>!(form.get(`${side}File`) instanceof File)))
      return privateResponse(apiFail('SOURCE_REQUIRED','Re-select the original photo for each document side',409));
    const userLimit=integerEnv('KYC_OCR_PREVIEW_USER_LIMIT'),ipLimit=integerEnv('KYC_OCR_PREVIEW_IP_LIMIT'),windowSeconds=integerEnv('KYC_OCR_PREVIEW_RATE_WINDOW_SECONDS');
    if(!userLimit||!ipLimit||!windowSeconds)return privateResponse(apiFail('PREVIEW_DISABLED','Document recognition is not configured',503));
    if(!await reserveGuestRateLimit(`kyc-preview-user:${user.id}`,userLimit,windowSeconds)
      ||!await reserveGuestRateLimit(`kyc-preview-ip:${guestAddressRateKey(request)}`,ipLimit,windowSeconds)){
      const response=privateResponse(apiFail('RATE_LIMITED','Too many document recognitions; please try later',429));
      response.headers.set('Retry-After',String(windowSeconds));return response;
    }
  }
  if((reuseFront||!frontFile)&&!existingFrontPath
    ||(requiredSides.includes('back')&&(reuseBack||!backFile)&&!existingBackPath))
    return privateResponse(apiFail('CONFLICT','Saved evidence is unavailable; reload the draft',409));
  const prevalidated=new Map<'front'|'back',{buffer:ArrayBuffer;inputHash:string;mimeType:string}>();
  try {
    for(const side of requiredSides){
      const file=side==='front'?frontFile:backFile;
      if(!file)continue;
      const checked=await validateKycUploadFile(file);
      if(!checked.ok||!extension(file.type))return privateResponse(apiFail('INVALID_EVIDENCE','The selected document photo is invalid',422));
      prevalidated.set(side,{buffer:checked.buffer,inputHash:createHash('sha256').update(Buffer.from(checked.buffer)).digest('hex'),mimeType:file.type});
    }
  } catch { return privateResponse(apiFail('INVALID_EVIDENCE','The selected document photo is invalid',422)); }
  const frontInputHash=prevalidated.get('front')?.inputHash??(typeof previous?.front_input_sha256==='string'?previous.front_input_sha256:null);
  const backInputHash=requiredSides.includes('back')?(prevalidated.get('back')?.inputHash??(typeof previous?.back_input_sha256==='string'?previous.back_input_sha256:null)):null;
  if(documentType==='national_id'&&hasDuplicateKycDocumentSides(frontInputHash,backInputHash))
    return privateResponse(apiFail('DUPLICATE_DOCUMENT_SIDES','The same photo cannot be used for both sides of a MyKad',422));
  const operationId=intent==='save_and_recognize'?String(operationIdEntry).toLowerCase():null;
  let operationFingerprint:string|null=null,leaseToken:string|null=null;
  let operationSignal:AbortSignal=request.signal;
  let operationService=service;
  const stagingPathBySide=new Map<'front'|'back',string>();
  if(intent==='save_and_recognize'&&operationId){
    try{
      for(const side of requiredSides){
        if(!prevalidated.has(side))return privateResponse(apiFail('SOURCE_REQUIRED','Re-select the original photo for each document side',409));
      }
      const operationKey=process.env.KYC_IC_HMAC_KEY;
      if(!operationKey)return privateResponse(apiFail('PREVIEW_DISABLED','Document recognition is not configured',503));
      const normalizedName=holderName.trim().normalize('NFC').replace(/\s+/gu,' ');
      const fingerprintPayload=JSON.stringify({owner:user.id,draftId,expectedVersion:version,documentType,holderName:normalizedName,
        sides:requiredSides.map((side)=>({side,inputSha256:prevalidated.get(side)?.inputHash,mimeType:prevalidated.get(side)?.mimeType})),
        transform:cleanTransformVersion,parser:parserVersion,policy:policyVersion,intent});
      operationFingerprint=createHmac('sha256',operationKey).update(fingerprintPayload,'utf8').digest('hex');
      const {data:claim,error:claimError}=await service.rpc('claim_kyc_draft_ocr_operation',{p_operation_id:operationId,p_owner_user_id:user.id,
        p_draft_id:draftId,p_expected_version:version,p_request_fingerprint:operationFingerprint});
      if(claimError)return privateResponse(apiFail(claimError.message.includes('kyc_draft_conflict')?'CONFLICT':'PREVIEW_UNAVAILABLE',
        'Document recognition could not be started',claimError.message.includes('kyc_draft_conflict')?409:503));
      const claimStatus=claim?.status;
      if(claimStatus!=='claimed')return privateResponse(apiFail(claimStatus==='succeeded'?'OPERATION_COMPLETED':claimStatus==='processing'?'OPERATION_IN_PROGRESS':'OPERATION_RECONCILIATION_REQUIRED',
        'Check recognition status or continue with manual entry',409));
      if(typeof claim.leaseToken!=='string'||!uuidPattern.test(claim.leaseToken))return privateResponse(apiFail('PREVIEW_UNAVAILABLE','Document recognition could not be started',503));
      leaseToken=claim.leaseToken;
      operationSignal=AbortSignal.any([request.signal,AbortSignal.timeout(45_000)]);
      operationService=createServiceClient({signal:operationSignal});
    }catch{
      return privateResponse(apiFail('PREVIEW_UNAVAILABLE','Document recognition could not be started',503));
    }
  }
  const bucket=operationService.storage.from('kyc-documents');
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
    const unreferencedPaths:string[]=[];
    const unresolvedPaths:string[]=[];
    for(const path of paths){
      if(referenced.has(path))continue;
      const {data:isReferenced,error:referenceCheckError}=await service.rpc('is_kyc_draft_storage_path_referenced',{p_storage_path:path});
      if(referenceCheckError||typeof isReferenced!=='boolean')unresolvedPaths.push(path);
      else if(!isReferenced)unreferencedPaths.push(path);
    }
    await Promise.all(unresolvedPaths.map((path)=>Promise.resolve(service.rpc('record_kyc_draft_cleanup_orphan',{p_owner_user_id:user.id,p_storage_path:path}))
      .then(({error})=>{if(error)console.error('kyc_draft_cleanup_orphan_record_failed',{draftId});})
      .catch(()=>console.error('kyc_draft_cleanup_orphan_record_failed',{draftId}))));
    const safePaths=unreferencedPaths;
    const removed=safePaths.length?await bucket.remove(safePaths).catch(()=>({error:{message:'remove_failed'}})):{error:null};
    if(removed.error)await Promise.all(safePaths.map((path)=>Promise.resolve(service.rpc('record_kyc_draft_cleanup_orphan',{p_owner_user_id:user.id,p_storage_path:path}))
      .then(({error})=>{if(error)console.error('kyc_draft_cleanup_orphan_record_failed',{draftId});})
      .catch(()=>console.error('kyc_draft_cleanup_orphan_record_failed',{draftId}))));
  };
  const newlyUploaded:string[]=[];
  const failOperation=async(safeCode:string)=>{
    if(operationId&&leaseToken){try{await service.rpc('fail_kyc_draft_ocr_operation',{p_operation_id:operationId,p_owner_user_id:user.id,p_lease_token:leaseToken,p_safe_code:safeCode});}catch{ /* Keep the operation available for status reconciliation. */ }}
  };
  if(operationId&&leaseToken){
    const paths=requiredSides.map((side)=>{
      const mimeType=prevalidated.get(side)!.mimeType;
      const path=`${user.id}/drafts/${draftId}/staging/${operationId}/${side}.${extension(mimeType)}`;
      stagingPathBySide.set(side,path);return path;
    });
    const {data:registered,error:registerError}=await withAbortSignal(operationService.rpc('register_kyc_draft_ocr_staging_paths',{
      p_operation_id:operationId,p_owner_user_id:user.id,p_lease_token:leaseToken,p_document_type:documentType,p_storage_paths:paths,
    }),operationSignal);
    if(registerError||registered!==true){await failOperation('staging_registration_failed');return privateResponse(apiFail('PREVIEW_UNAVAILABLE','Document recognition could not be prepared',503));}
  }
  const resolveSide=async (side:'front'|'back',file:File|null,reuse:boolean,oldPath:string|null)=>{
    if(intent==='save_and_recognize')operationSignal.throwIfAborted();
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
      return {path:oldPath,inputHash:typeof oldInput==='string'?oldInput:null,evidenceHash,clean:null as Buffer|null,cleanSha256:null as string|null,mimeType:null as string|null};
    }
    if(!extension(file.type))throw new Error('invalid_draft_evidence');
    const cached=prevalidated.get(side);
    let checkedBuffer:ArrayBuffer,inputHash:string;
    if(cached){checkedBuffer=cached.buffer;inputHash=cached.inputHash;}
    else{
      const checked=await validateKycUploadFile(file);
      if(!checked.ok)throw new Error('invalid_draft_evidence');
      checkedBuffer=checked.buffer;inputHash=createHash('sha256').update(Buffer.from(checked.buffer)).digest('hex');
    }
    const prepared=await prepareKycEvidenceImage(Buffer.from(checkedBuffer),file.type);
    if(intent==='save_and_recognize')operationSignal.throwIfAborted();
    if(typeof oldInput==='string'&&oldInput===inputHash&&oldPath){
      let evidenceHash=typeof oldEvidence==='string'?oldEvidence:null;
      if(!evidenceHash){
        const downloaded=await bucket.download(oldPath);
        if(downloaded.error||!downloaded.data)throw new Error('draft_evidence_unavailable');
        evidenceHash=createHash('sha256').update(Buffer.from(await downloaded.data.arrayBuffer())).digest('hex');
      }
      return {path:oldPath,inputHash,evidenceHash,clean:intent==='save_and_recognize'?Buffer.from(prepared.ocr):null,
        cleanSha256:intent==='save_and_recognize'?createHash('sha256').update(prepared.ocr).digest('hex'):null,mimeType:file.type};
    }
    const evidenceHash=createHash('sha256').update(prepared.stored).digest('hex');
    const path=intent==='save_and_recognize'&&operationId
      ?stagingPathBySide.get(side)!
      :`${user.id}/drafts/${draftId}/${randomUUID()}/${side}.${extension(file.type)}`;
    if(intent==='save_and_recognize'){
      newlyUploaded.push(path);
      const existing=await bucket.download(path);
      if(existing.data){
        const existingHash=createHash('sha256').update(Buffer.from(await existing.data.arrayBuffer())).digest('hex');
        if(existingHash!==evidenceHash)throw new Error('draft_staging_conflict');
      }else{
        const uploaded=await bucket.upload(path,prepared.stored,{contentType:file.type,upsert:false});
        if(uploaded.error){
          const afterError=await bucket.download(path);
          if(!afterError.data||createHash('sha256').update(Buffer.from(await afterError.data.arrayBuffer())).digest('hex')!==evidenceHash)
            throw new Error('draft_upload_failed');
        }
      }
      operationSignal.throwIfAborted();
    }else{
      newlyUploaded.push(path);
      const uploaded=await bucket.upload(path,prepared.stored,{contentType:file.type,upsert:false});
      if(uploaded.error)throw new Error('draft_upload_failed');
    }
    return {path,inputHash,evidenceHash,clean:intent==='save_and_recognize'?Buffer.from(prepared.ocr):null,
      cleanSha256:intent==='save_and_recognize'?createHash('sha256').update(prepared.ocr).digest('hex'):null,mimeType:file.type};
  };
  let front:{path:string;inputHash:string|null;evidenceHash:string;clean:Buffer|null;cleanSha256:string|null;mimeType:string|null}|null=null;
  let back:{path:string;inputHash:string|null;evidenceHash:string;clean:Buffer|null;cleanSha256:string|null;mimeType:string|null}|null=null;
  const resolveBothSides=async () => Promise.all([
    resolveSide('front',frontFile,reuseFront,existingFrontPath),
    resolveSide('back',backFile,reuseBack,existingBackPath),
  ]);
  try{
    [front,back]=frontFile||backFile
      ? await withPortalWorkload('kyc_upload',resolveBothSides,operationSignal)
      : await resolveBothSides();
  }catch(error){
    await removeOrQueue(newlyUploaded);
    const invalid=error instanceof Error&&error.message==='invalid_draft_evidence';
    const busy=error instanceof WorkloadUnavailableError&&error.code==='busy';
    const stagingConflict=error instanceof Error&&error.message==='draft_staging_conflict';
    if(invalid||busy||stagingConflict)await failOperation(invalid?'invalid_evidence':busy?'workload_busy':'staging_conflict');
    const response=apiFail(invalid?'INVALID_EVIDENCE':busy?'DRAFT_BUSY':stagingConflict?'OPERATION_CONFLICT':'DRAFT_SAVE_FAILED',invalid?'Draft images are invalid':busy?'Document processing is busy; keep your files and try again shortly':stagingConflict?'Recognition operation conflicts with saved evidence':'Draft images could not be saved',invalid?422:busy?429:stagingConflict?409:503);
    if(busy)response.headers.set('Retry-After','10');
    return privateResponse(response);
  }
  if(!front||(requiredSides.includes('back')&&!back)){await removeOrQueue(newlyUploaded);return privateResponse(apiFail('INVALID_DRAFT','Required document evidence is missing',422));}
  if(!back) back={path:'',inputHash:null,evidenceHash:'',clean:null,cleanSha256:null,mimeType:null};
  if(intent==='save_and_recognize'&&operationSignal.aborted){await removeOrQueue(newlyUploaded);return privateResponse(apiFail('PREVIEW_UNAVAILABLE','Recognition timed out; check its status before trying again',503));}
  const revision=createKycEvidenceRevision(front.evidenceHash,requiredSides.includes('back')?back.evidenceHash:null);
  const {data,error}=await withAbortSignal(operationService.rpc('save_kyc_draft_v2',{
    p_owner_user_id:user.id,p_draft_id:draftId,p_expected_version:version,p_document_type:documentType,p_holder_name:holderName.trim()||null,
    p_front_storage_path:front.path,p_back_storage_path:requiredSides.includes('back')?back.path:null,p_front_input_sha256:front.inputHash,p_back_input_sha256:back.inputHash,
    p_front_evidence_sha256:front.evidenceHash,p_back_evidence_sha256:requiredSides.includes('back')?back.evidenceHash:null,p_evidence_revision:revision,
    p_idle_ttl_seconds:idle,p_absolute_ttl_seconds:absolute,
  }),operationSignal);
  if(error){await removeOrQueue(newlyUploaded);const conflict=error.message.includes('kyc_draft_conflict');if(conflict)await failOperation('draft_conflict');const status=conflict?409:503;return privateResponse(apiFail(status===409?'CONFLICT':'DRAFT_SAVE_FAILED',status===409?'Draft changed in another tab; reload the saved draft':'Draft could not be saved',status))}
  const row=Array.isArray(data)?data[0]:data;
  if(!row||typeof row.draft_id!=='string'){await removeOrQueue(newlyUploaded);return privateResponse(apiFail('DRAFT_SAVE_FAILED','Draft could not be confirmed as saved',503));}
  const draft={id:row.draft_id,version:row.version,documentType,holderName:holderName.trim(),hasFront:true,hasBack:requiredSides.includes('back'),expiresAt:row.expires_at,evidenceRevision:revision,changed:row.changed===true};
  if(intent!=='save_and_recognize'||!operationId||!leaseToken||!operationFingerprint)return privateResponse(apiOk({draft}));
  try{
    operationSignal.throwIfAborted();
    if(!front.clean||!front.cleanSha256||!front.mimeType||requiredSides.includes('back')&&(!back.clean||!back.cleanSha256||!back.mimeType))
      return privateResponse(apiFail('SOURCE_REQUIRED','Re-select the original photo for each document side',409));
    const {result}=await withPortalWorkload('kyc_preview',async(signal)=>{
      signal.throwIfAborted();
      const preview=await extractKycPreviewFields({documentType:documentType as KycDocumentType,
        front:{mimeType:front!.mimeType!,bytes:new Uint8Array(front!.clean!)},
        ...(requiredSides.includes('back')&&back!.clean&&back!.mimeType?{back:{mimeType:back!.mimeType,bytes:new Uint8Array(back!.clean)}}:{})});
      signal.throwIfAborted();return {result:preview};
    },operationSignal);
    const sourceRevision=buildKycOcrSourceRevision({documentType:documentType as KycDocumentType,cleanTransformVersion,
      frontInputSha256:front.inputHash!,frontCleanSha256:front.cleanSha256!,
      backInputSha256:requiredSides.includes('back')?back.inputHash:null,backCleanSha256:requiredSides.includes('back')?back.cleanSha256:null});
    const numberFingerprint=result.documentNumber?await hashICWithHmac(result.documentNumber):null;
    operationSignal.throwIfAborted();
    const {data:completed,error:completeError}=await withAbortSignal(operationService.rpc('complete_kyc_draft_ocr_operation_v2',{
      p_operation_id:operationId,p_owner_user_id:user.id,p_lease_token:leaseToken,p_request_fingerprint:operationFingerprint,
      p_saved_version:Number(row.version),p_draft_id:draftId,p_artifact_revision:revision,p_source_revision:sourceRevision,
      p_front_input_sha256:front.inputHash,p_front_clean_sha256:front.cleanSha256,p_back_input_sha256:requiredSides.includes('back')?back.inputHash:null,
      p_back_clean_sha256:requiredSides.includes('back')?back.cleanSha256:null,p_clean_transform_version:cleanTransformVersion,
      p_parser_version:parserVersion,p_policy_version:policyVersion,p_engine:result.providerModel,p_holder_name:result.holderName,
      p_document_number_hmac:numberFingerprint?.value??null,p_document_number_last4:result.documentNumber?result.documentNumber.replace(/[^A-Z0-9]/gi,'').toUpperCase().slice(-4)||null:null,
      p_status:result.status,p_confidence:result.confidence,p_issuer_country:result.issuerCountry??null,p_nationality:result.nationality??null,
      p_mrz_status:result.mrzStatus??null,p_visual_comparison_status:result.visualComparisonStatus??null,p_expiry_date:result.expiryDate??null,
      p_failure_code:result.failureCode??(result.visualComparisonStatus?`passport_visual_${result.visualComparisonStatus}`:null),
    }),operationSignal);
    if(completeError||completed?.status!=='succeeded')return privateResponse(apiFail('PREVIEW_UNAVAILABLE','Draft was saved; enter document details manually or check recognition status',503));
    const evidence = documentType === 'passport' ? result.passportFieldEvidence : undefined;
    const passportFieldEvidence = evidence ? {
      ...(evidence.holderName && ['matched', 'missing', 'conflict'].includes(evidence.holderName) ? { holderName: evidence.holderName } : {}),
      ...(evidence.documentNumber && ['matched', 'missing', 'conflict'].includes(evidence.documentNumber) ? { documentNumber: evidence.documentNumber } : {}),
    } : undefined;
    return privateResponse(apiOk({draft,preview:{status:result.status,holderName:result.holderName,documentNumber:result.documentNumber,
      expiryDate:result.expiryDate,mrzStatus:result.mrzStatus,visualComparisonStatus:result.visualComparisonStatus,
      passportFieldEvidence}}));
  }catch(error){
    if(error instanceof WorkloadUnavailableError){
      const status=error.code==='busy'?429:503;
      const response=privateResponse(apiFail(error.code==='busy'?'PREVIEW_BUSY':'PREVIEW_UNAVAILABLE','Draft was saved; enter document details manually or try recognition again',status));
      if(status===429)response.headers.set('Retry-After','10');return response;
    }
    return privateResponse(apiFail('PREVIEW_UNAVAILABLE','Draft was saved; enter document details manually or check recognition status',503));
  }
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
