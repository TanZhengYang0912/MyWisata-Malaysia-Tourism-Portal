"use client";

import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ShieldCheck, Upload, CheckCircle2, Clock, FileCheck2,
  Info, AlertTriangle, ArrowLeft,
} from "lucide-react";
import Link from "next/link";
import { BackLink } from "@/components/shared/back-link";
import { z } from "zod";
import { useAuth } from "@/components/providers/auth";
import { useActionFeedback } from "@/components/providers/action-feedback";
import { CustomerPageShell, CustomerPageTitle } from "@/components/customer/customer-page-shell";
import { validateKycFile, KYC_ACCEPTED_TYPES } from "@/backend/domains/identity";
import { KycPhotoPreview } from "@/components/customer/kyc-photo-preview";
import { KycDocumentCameraDialog } from "@/components/customer/kyc-document-camera-dialog";
import { Button } from "@/components/ui/button";
import type { CustomerKycSubmission } from "@/backend/core/types";
import { useSearchParams } from "next/navigation";
import { GuestAccountEmptyState } from "@/components/customer/guest-account-empty-state";
import { postLoginPath } from "@/lib/auth/guest-mode";
import { ApiErrorNotice } from "@/components/shared/api-error-notice";
import { compareKycDraftValues, compareKycOcrField, type KycOcrPreviewValues } from "@/lib/kyc/draft-client";
import { getRequiredKycDocumentSides, hasRequiredKycFramingConfirmation, isSupportedDocumentNumber } from "@/lib/kyc/document-policy";
import { useImageCrop } from "@/components/shared/image-crop-dialog";

const IC_PATTERNS: Record<string, { hintKey: string }> = {
  national_id:     { hintKey: "ui.kyc.myKadHint" },
  driving_license: { hintKey: "ui.kyc.drivingLicenseHint" },
  passport:        { hintKey: "ui.kyc.passportHint" },
};

function createKycSchema(t: TFunction<"customer">) {
  return z.object({
    icNumber: z.string().min(1, t("ui.kyc.idRequired")),
    docType:  z.enum(["national_id", "passport", "driving_license"]),
  }).superRefine((val, ctx) => {
    const pattern = IC_PATTERNS[val.docType];
    if (val.icNumber && !isSupportedDocumentNumber(val.docType, val.icNumber)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["icNumber"], message: t(pattern.hintKey) });
    }
  });
}
function localizedKycFileError(file: File | null, t: TFunction<"customer">): string | null {
  const error = validateKycFile(file);
  if (!error) return null;
  if (!file) return t("ui.kyc.uploadRequired");
  if (!KYC_ACCEPTED_TYPES.includes(file.type)) return t("ui.kyc.invalidFileType");
  return t("ui.kyc.fileTooLarge", { size: (file.size / 1024 / 1024).toFixed(1) });
}

export default function KycPage() {
  const { currentUser } = useAuth();
  return <KycPageContent key={currentUser?.id ?? "guest"} />;
}

function KycPageContent() {
  const { t: tCustomer, i18n } = useTranslation("customer");
  const { currentUser, refreshUser, verificationFacts } = useAuth();
  const searchParams = useSearchParams();
  const continuation = postLoginPath(searchParams.get("next"));
  const { showFeedback } = useActionFeedback();
  const { cropToTwoDocumentSides, cropDialog } = useImageCrop();
  const [submitting,        setSubmitting]        = useState(false);
  const [form,              setForm]              = useState<{ icNumber: string; docType: "national_id" | "passport" | "driving_license" }>({ icNumber: "", docType: "national_id" });
  const [holderName,        setHolderName]        = useState("");
  const [ocrFields,         setOcrFields]          = useState<KycOcrPreviewValues & { expiryDate: string | null; generation: number } | null>(null);
  const [previewing,        setPreviewing]         = useState(false);
  const [savingDraft,       setSavingDraft]        = useState(false);
  const [draftId,           setDraftId]            = useState<string | null>(null);
  const [draftVersion,      setDraftVersion]       = useState<number | null>(null);
  const [draftNotice,       setDraftNotice]        = useState<string | null>(null);
  const [draftBaseline,     setDraftBaseline]      = useState<{ documentType: "national_id" | "passport" | "driving_license"; holderName: string } | null>(null);
  const [frontChanged,      setFrontChanged]       = useState(false);
  const [backChanged,       setBackChanged]        = useState(false);
  const [submitUncertain,   setSubmitUncertain]    = useState(false);
  const [operationChecking, setOperationChecking]  = useState(false);
  const [submitRequestId,   setSubmitRequestId]     = useState<string | null>(null);
  const submitOperationIdRef = useRef<string | null>(null);
  const isMountedRef = useRef(false);
  const evidenceGenerationRef = useRef(0);
  const [evidenceGeneration, setEvidenceGeneration] = useState(0);
  const nameEditRevisionRef = useRef(0);
  const numberEditRevisionRef = useRef(0);
  const previewRequestRef = useRef(false);
  const kycMutationRef = useRef<"preview" | "draft" | "submit" | null>(null);
  const recognitionOperationRef = useRef<string | null>(null);
  const [draftCapabilities, setDraftCapabilities] = useState({ documentCapture: false, qualityMode: "off" as "off" | "advisory", cleanOcr: false, chinesePassportOcr: false });
  const ocrResultCacheRef = useRef<{ generation: number; preview: KycOcrPreviewValues & { expiryDate: string | null } } | null>(null);
  const [formError,         setFormError]         = useState<string | null>(null);
  const [fileErrors,        setFileErrors]        = useState<{ front: string | null; back: string | null }>({ front: null, back: null });
  const [submitError,       setSubmitError]       = useState<string | null>(null);
  const [frontFile,         setFrontFile]         = useState<File | null>(null);
  const [backFile,          setBackFile]          = useState<File | null>(null);
  const [duplicateDocumentSidesResult, setDuplicateDocumentSidesResult] = useState<{ generation: number; isDuplicate: boolean } | null>(null);
  const [frontFramingConfirmed, setFrontFramingConfirmed] = useState(false);
  const [backFramingConfirmed, setBackFramingConfirmed] = useState(false);
  const [frontOriginal,     setFrontOriginal]     = useState(false);
  const [backOriginal,      setBackOriginal]      = useState(false);
  const [ocrConsent,        setOcrConsent]        = useState(false);
  const [cameraSide,        setCameraSide]        = useState<"front" | "back" | null>(null);
  const [withdrawing,       setWithdrawing]       = useState(false);
  const [confirmWithdrawal, setConfirmWithdrawal] = useState(false);
  const [statusChecking,    setStatusChecking]    = useState(false);
  const [ocrNotice,         setOcrNotice]         = useState<string | null>(null);
  const [activeSubmission,  setActiveSubmission]  = useState<CustomerKycSubmission | null | undefined>(undefined);
  const frontFileInputRef = useRef<HTMLInputElement>(null);
  const backFileInputRef = useRef<HTMLInputElement>(null);
  const combinedFileInputRef = useRef<HTMLInputElement>(null);
  const holderNameInputRef = useRef<HTMLInputElement>(null);
  const documentNumberInputRef = useRef<HTMLInputElement>(null);

  const kycStatus = verificationFacts?.kycStatus ?? "unverified";
  const isVerified = kycStatus === "approved";
  const canSubmit = verificationFacts?.emailVerified === true
    && verificationFacts.accountStatus === "active";
  const loading          = activeSubmission === undefined;

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const refreshSubmissionStatus = useCallback(async () => {
    setStatusChecking(true);
    try {
      const response = await fetch("/api/kyc/submission", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error("status_unavailable");
      setActiveSubmission(body.data?.submission ?? null);
      setSubmitError(null);
    } catch {
      setSubmitError(tCustomer("ui.kyc.statusCheckFailed"));
    } finally {
      setStatusChecking(false);
    }
  }, [tCustomer]);

  useEffect(() => {
    if (!currentUser?.id) {
      const timer = window.setTimeout(() => setActiveSubmission(null), 0);
      return () => window.clearTimeout(timer);
    }
    let active = true;
    const initialEvidenceGeneration = evidenceGenerationRef.current;
    const initialNameRevision = nameEditRevisionRef.current;
    (async () => {
      try {
        const operationKey = `mylawatan:kyc-operation:${currentUser.id}`;
        const savedOperationId = window.localStorage.getItem(operationKey);
        if (savedOperationId && /^[0-9a-f-]{36}$/i.test(savedOperationId)) {
          submitOperationIdRef.current = savedOperationId;
          setSubmitUncertain(true);
        }
        const [response, draftResponse] = await Promise.all([
          fetch("/api/kyc/submission", { cache: "no-store" }),
          fetch("/api/kyc/draft", { cache: "no-store" }),
        ]);
        const body = await response.json().catch(() => ({}));
        const draftBody = await draftResponse.json().catch(() => ({}));
        if (!active) return;
        const capabilities = draftBody.data?.capabilities;
        if (capabilities && typeof capabilities === "object") setDraftCapabilities({
          documentCapture: capabilities.documentCapture === true,
          qualityMode: capabilities.qualityMode === "advisory" ? "advisory" : "off",
          cleanOcr: capabilities.cleanOcr === true,
          chinesePassportOcr: capabilities.chinesePassportOcr === true,
        });
        setActiveSubmission(response.ok ? (body.data?.submission ?? null) : null);
        if (savedOperationId && /^[0-9a-f-]{36}$/i.test(savedOperationId)) {
          const operationResponse = await fetch(`/api/kyc/operation/${savedOperationId}`, { cache: "no-store" });
          const operationBody = await operationResponse.json().catch(() => ({}));
          const operation = operationBody.data?.operation;
          if (active && operationResponse.ok && operation?.state === "succeeded") {
            window.localStorage.removeItem(operationKey); submitOperationIdRef.current = null; setSubmitUncertain(false);
            if (!response.ok || !body.data?.submission) await refreshSubmissionStatus();
          }
        }
        const restoreGeneration = initialEvidenceGeneration;
        const draft = draftResponse.ok ? draftBody.data?.draft : null;
        if (draft?.id && typeof draft.version === "number") {
          const canRestoreMetadata = evidenceGenerationRef.current === restoreGeneration
            && nameEditRevisionRef.current === initialNameRevision;
          if (canRestoreMetadata) {
            setDraftId(draft.id);
            setDraftVersion(draft.version);
            setHolderName(typeof draft.holderName === "string" ? draft.holderName : "");
            setForm((value) => ({ ...value, docType: draft.documentType }));
            setDraftBaseline({ documentType: draft.documentType, holderName: typeof draft.holderName === "string" ? draft.holderName : "" });
            setFrontChanged(false);
            setBackChanged(false);
          }
          const restore = async (side: "front" | "back") => {
            const image = await fetch(`/api/kyc/draft/documents/${draft.id}/${side}`, { cache: "no-store" });
            if (!image.ok) return null;
            const blob = await image.blob();
            return new File([blob], `${side}.${blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg"}`, { type: blob.type });
          };
          const [front, back] = await Promise.all([restore("front"), draft.hasBack ? restore("back") : Promise.resolve(null)]);
          if (active && evidenceGenerationRef.current === restoreGeneration) {
            if (front) { setFrontFile(front); setFrontOriginal(false); }
            if (back) { setBackFile(back); setBackOriginal(false); }
            setDraftNotice(tCustomer("ui.kyc.draftRestored"));
          }
        }
      } catch {
        if (active) setActiveSubmission(null);
      }
    })();
    return () => { active = false; };
  }, [currentUser?.id, refreshSubmissionStatus, tCustomer]);

  function handleFileChange(side: "front" | "back", file: File | null) {
    evidenceGenerationRef.current += 1;
    setEvidenceGeneration(evidenceGenerationRef.current);
    recognitionOperationRef.current = null;
    if (currentUser) window.sessionStorage.removeItem(`mylawatan:kyc-preview-operation:${currentUser.id}`);
    ocrResultCacheRef.current = null;
    setOcrFields(null);
    setDraftNotice(null);
    if (side === "front") { setFrontFile(file); setFrontChanged(Boolean(file)); setFrontOriginal(Boolean(file)); }
    else { setBackFile(file); setBackChanged(Boolean(file)); setBackOriginal(Boolean(file)); }
    if (side === "front") setFrontFramingConfirmed(false);
    else setBackFramingConfirmed(false);
    setSubmitError(null);
    setFileErrors((errors) => ({ ...errors, [side]: localizedKycFileError(file, tCustomer) }));
  }

  async function splitCombinedMyKadPhoto(file: File | null) {
    if (!file || submitting || savingDraft || previewing) return;
    const startingGeneration = evidenceGenerationRef.current;
    const sourceError = localizedKycFileError(file, tCustomer);
    if (sourceError) { setOcrNotice(sourceError); return; }
    const result = await cropToTwoDocumentSides(file);
    if (startingGeneration !== evidenceGenerationRef.current || !isMountedRef.current) return;
    if (!result) { setOcrNotice(tCustomer("ui.kyc.combinedPhotoFailed")); return; }
    const frontError = localizedKycFileError(result.front, tCustomer);
    const backError = localizedKycFileError(result.back, tCustomer);
    if (frontError || backError) { setOcrNotice(tCustomer("ui.kyc.combinedPhotoFailed")); return; }
    evidenceGenerationRef.current += 1;
    setEvidenceGeneration(evidenceGenerationRef.current);
    recognitionOperationRef.current = null;
    if (currentUser) window.sessionStorage.removeItem(`mylawatan:kyc-preview-operation:${currentUser.id}`);
    ocrResultCacheRef.current = null;
    setOcrFields(null);
    setDraftNotice(null);
    setFrontFile(result.front); setBackFile(result.back);
    setFrontChanged(true); setBackChanged(true);
    setFrontOriginal(true); setBackOriginal(true);
    setFrontFramingConfirmed(true); setBackFramingConfirmed(true);
    setDuplicateDocumentSidesResult(null);
    setFileErrors({ front: null, back: null });
    setOcrNotice(null);
    setSubmitError(null);
  }

  function handleDocumentTypeChange(documentType: typeof form.docType) {
    if (documentType === form.docType) return;
    evidenceGenerationRef.current += 1;
    setEvidenceGeneration(evidenceGenerationRef.current);
    recognitionOperationRef.current = null;
    if (currentUser) window.sessionStorage.removeItem(`mylawatan:kyc-preview-operation:${currentUser.id}`);
    ocrResultCacheRef.current = null;
    setForm({ docType: documentType, icNumber: "" });
    setHolderName("");
    setOcrFields(null);
    setOcrNotice(null);
    setFrontFile(null);
    setBackFile(null);
    setDuplicateDocumentSidesResult(null);
    setFrontFramingConfirmed(false);
    setBackFramingConfirmed(false);
    setFrontOriginal(false);
    setBackOriginal(false);
    setFrontChanged(true);
    setBackChanged(true);
    setFileErrors({ front: null, back: null });
  }

  async function previewDocument() {
    const snapshot = { frontFile, backFile, documentType: form.docType, holderName, documentNumber: form.icNumber, generation: evidenceGenerationRef.current,
      nameRevision: nameEditRevisionRef.current, numberRevision: numberEditRevisionRef.current };
    if (!snapshot.frontFile || (snapshot.documentType !== "passport" && !snapshot.backFile)
      || !hasRequiredKycFramingConfirmation(snapshot.documentType, frontFramingConfirmed, backFramingConfirmed)
      || previewRequestRef.current || kycMutationRef.current || !ocrConsent) return;
    if (!draftCapabilities.cleanOcr || snapshot.documentType === "passport" && !draftCapabilities.chinesePassportOcr) return;
    if (!frontOriginal || snapshot.documentType !== "passport" && !backOriginal) {
      setOcrNotice(tCustomer("ui.kyc.previewOriginalRequired"));
      return;
    }
    if (ocrResultCacheRef.current?.generation === snapshot.generation) return;
    previewRequestRef.current = true;
    kycMutationRef.current = "preview";
    setPreviewing(true); setFormError(null); setOcrNotice(null);
    try {
      const operationKey = currentUser ? `mylawatan:kyc-preview-operation:${currentUser.id}` : null;
      let operationId = recognitionOperationRef.current;
      if (operationKey) {
        const pendingId = operationId ?? window.sessionStorage.getItem(operationKey);
        if (pendingId && /^[0-9a-f-]{36}$/i.test(pendingId)) {
          const statusResponse = await fetch(`/api/kyc/operation/${pendingId}`, { cache: "no-store" });
          const statusBody = await statusResponse.json().catch(() => ({}));
          if (!isMountedRef.current) return;
          if (!statusResponse.ok && statusResponse.status !== 404) { setOcrNotice(tCustomer("ui.kyc.previewUnavailable")); return; }
          const state = statusBody.data?.operation?.state;
          if (state === "processing") { setOcrNotice(tCustomer("ui.kyc.previewUnavailable")); return; }
          if (state === "succeeded") { window.sessionStorage.removeItem(operationKey); recognitionOperationRef.current=null; setOcrNotice(tCustomer("ui.kyc.previewManualEntry")); return; }
          window.sessionStorage.removeItem(operationKey);
          recognitionOperationRef.current=null;
          operationId=null;
        }
      }
      if (!operationId) operationId = crypto.randomUUID();
      recognitionOperationRef.current = operationId;
      if (operationKey) window.sessionStorage.setItem(operationKey, operationId);
      const data = new FormData();
      data.set("intent", "save_and_recognize"); data.set("operationId", operationId); data.set("ocrConsent", "true");
      data.set("draftId", draftId ?? ""); if (draftVersion !== null) data.set("version", String(draftVersion));
      data.set("documentType", snapshot.documentType); data.set("holderName", snapshot.holderName.trim());
      data.set("frontFile", snapshot.frontFile);
      if (snapshot.documentType !== "passport" && snapshot.backFile) data.set("backFile", snapshot.backFile);
      const response = await fetch("/api/kyc/draft", { method: "POST", body: data });
      const body = await response.json().catch(() => ({}));
      if (!isMountedRef.current) return;
      if (snapshot.generation !== evidenceGenerationRef.current) return;
      if (!response.ok) {
        if (body.error?.code === "DUPLICATE_DOCUMENT_SIDES") throw new Error(tCustomer("ui.kyc.duplicateDocumentSides"));
        if (["SOURCE_REQUIRED", "SOURCE_CHANGED"].includes(body.error?.code)) throw new Error(tCustomer("ui.kyc.previewOriginalRequired"));
        if (["OPERATION_COMPLETED", "OPERATION_RECONCILIATION_REQUIRED"].includes(body.error?.code)) {
          recognitionOperationRef.current = null;
          if (operationKey) window.sessionStorage.removeItem(operationKey);
          throw new Error(tCustomer("ui.kyc.previewManualEntry"));
        }
        throw new Error(body.error?.message ?? tCustomer("ui.kyc.previewUnavailable"));
      }
      const saved = body.data?.draft;
      if (!saved?.id || typeof saved.version !== "number") throw new Error(tCustomer("ui.kyc.previewUnavailable"));
      setDraftId(saved.id); setDraftVersion(saved.version);
      setDraftBaseline({ documentType: snapshot.documentType, holderName: snapshot.holderName.trim() });
      setFrontChanged(false); setBackChanged(false);
      const preview = body.data?.preview;
      if (!preview) throw new Error(tCustomer("ui.kyc.previewUnavailable"));
      recognitionOperationRef.current = null;
      if (operationKey) window.sessionStorage.removeItem(operationKey);
      ocrResultCacheRef.current = { generation: snapshot.generation, preview };
      setOcrFields({ holderName: preview.holderName ?? null, documentNumber: preview.documentNumber ?? null,
        expiryDate: preview.expiryDate ?? null, mrzStatus: preview.mrzStatus, visualComparisonStatus: preview.visualComparisonStatus,
        passportFieldEvidence: preview.passportFieldEvidence, status: preview.status, generation: snapshot.generation });
      if (snapshot.documentType === "passport" && preview.visualComparisonStatus !== "conflict") {
        const nameResult = compareKycOcrField(snapshot.documentType, "holderName", snapshot.holderName, preview);
        const numberResult = compareKycOcrField(snapshot.documentType, "documentNumber", snapshot.documentNumber, preview);
        if (!snapshot.holderName.trim() && !holderName.trim() && snapshot.nameRevision === nameEditRevisionRef.current
          && nameResult.status === "empty" && preview.holderName) setHolderName(preview.holderName);
        if (!snapshot.documentNumber.trim() && !form.icNumber.trim() && snapshot.numberRevision === numberEditRevisionRef.current
          && numberResult.status === "empty" && preview.documentNumber) setForm((value) => ({ ...value, icNumber: preview.documentNumber! }));
      }
      if (preview.status !== "extracted" || snapshot.documentType === "passport" && preview.visualComparisonStatus !== "consistent") setOcrNotice(tCustomer("ui.kyc.previewManualEntry"));
    } catch (error) {
      setOcrNotice(error instanceof Error ? error.message : tCustomer("ui.kyc.previewUnavailable"));
    } finally {
      if (kycMutationRef.current === "preview") kycMutationRef.current = null;
      if (isMountedRef.current) { previewRequestRef.current = false; setPreviewing(false); }
    }
  }

  async function saveDraft(fromSubmission = false): Promise<{ id: string; version: number } | null> {
    if (kycMutationRef.current && !(fromSubmission && kycMutationRef.current === "submit")) return null;
    const snapshot = { generation: evidenceGenerationRef.current, nameRevision: nameEditRevisionRef.current,
      documentType: form.docType, holderName: holderName.trim(), frontFile, backFile, frontChanged, backChanged,
      draftId, draftVersion, draftBaseline };
    if (!snapshot.frontFile || (snapshot.documentType !== "passport" && !snapshot.backFile) || savingDraft) return null;
    if (snapshot.draftId && snapshot.draftVersion !== null && snapshot.draftBaseline) {
      const comparison = compareKycDraftValues({
        documentType: snapshot.documentType,
        holderName: snapshot.holderName,
        frontChanged: snapshot.frontChanged,
        backChanged: snapshot.backChanged,
      }, { ...snapshot.draftBaseline, frontChanged: false, backChanged: false });
      if (!comparison.changed) return { id: snapshot.draftId, version: snapshot.draftVersion };
    }
    const ownsMutation = !fromSubmission;
    if (ownsMutation) kycMutationRef.current = "draft";
    setSavingDraft(true); setDraftNotice(null);
    try {
      const data = new FormData();
      data.append("draftId", snapshot.draftId ?? ""); if (snapshot.draftVersion !== null) data.append("version", String(snapshot.draftVersion));
      data.append("documentType", snapshot.documentType); data.append("holderName", snapshot.holderName);
      if (snapshot.frontChanged) data.append("frontFile", snapshot.frontFile); else data.append("reuseFront", "true");
      if (snapshot.documentType !== "passport") {
        if (snapshot.backChanged && snapshot.backFile) data.append("backFile", snapshot.backFile); else data.append("reuseBack", "true");
      }
      const response = await fetch("/api/kyc/draft", { method: "POST", body: data });
      const body = await response.json().catch(() => ({}));
      if (!isMountedRef.current) return null;
      if (snapshot.generation !== evidenceGenerationRef.current) return null;
      if (!response.ok) throw new Error(body.error?.code === "DUPLICATE_DOCUMENT_SIDES"
        ? tCustomer("ui.kyc.duplicateDocumentSides") : body.error?.message ?? tCustomer("ui.kyc.draftSaveFailed"));
      setDraftId(body.data.draft.id); setDraftVersion(body.data.draft.version);
      if (snapshot.generation !== evidenceGenerationRef.current) return null;
      setDraftNotice(tCustomer("ui.kyc.draftSaved"));
      setDraftBaseline({ documentType: snapshot.documentType, holderName: snapshot.holderName });
      if (snapshot.generation === evidenceGenerationRef.current) { setFrontChanged(false); setBackChanged(false); }
      return { id: body.data.draft.id as string, version: body.data.draft.version as number };
    } catch (error) { setDraftNotice(error instanceof Error ? error.message : tCustomer("ui.kyc.draftSaveFailed")); return null; }
    finally {
      if (ownsMutation && kycMutationRef.current === "draft") kycMutationRef.current = null;
      if (isMountedRef.current) setSavingDraft(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUser || kycMutationRef.current) return;
    setFormError(null);
    setFileErrors({ front: null, back: null });
    setSubmitError(null);

    const result = createKycSchema(tCustomer).safeParse(form);
    if (!result.success) { setFormError(result.error.issues[0].message); return; }
    const frontError = localizedKycFileError(frontFile, tCustomer);
    const backError = form.docType === "passport" ? null : localizedKycFileError(backFile, tCustomer);
    if (frontError || backError) { setFileErrors({ front: frontError, back: backError }); return; }
    if (!hasRequiredKycFramingConfirmation(form.docType, frontFramingConfirmed, backFramingConfirmed)) {
      setSubmitError(tCustomer("ui.kyc.framingConfirmationRequired"));
      return;
    }
    if (!ocrConsent && !submitUncertain) { setSubmitError(tCustomer("ui.kyc.consentRequired")); return; }

    kycMutationRef.current = "submit";
    setSubmitting(true);
    try {
      const savedDraft = submitUncertain && draftId && draftVersion !== null
        ? { id: draftId, version: draftVersion }
        : await saveDraft(true);
      if (!isMountedRef.current) return;
      if (!savedDraft) { setSubmitting(false); return; }
      const fd = new FormData();
      const operationId = submitOperationIdRef.current ?? crypto.randomUUID();
      submitOperationIdRef.current = operationId;
      window.localStorage.setItem(`mylawatan:kyc-operation:${currentUser.id}`, operationId);
      fd.append("operationId", operationId);
      fd.append("icNumber", result.data.icNumber.toUpperCase());
      fd.append("holderName", holderName.trim());
      fd.append("docType",  result.data.docType);
      fd.append("draftId", savedDraft.id);
      fd.append("draftVersion", String(savedDraft.version));
      fd.append("ocrConsent", "true");
      const res = await fetch("/api/kyc/upload", { method: "POST", headers: { "Idempotency-Key": operationId }, body: fd });
      if (!isMountedRef.current) return;
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setSubmitRequestId(body.error?.requestId ?? null);
        if (res.status >= 500) setSubmitUncertain(true);
        else { submitOperationIdRef.current = null; window.localStorage.removeItem(`mylawatan:kyc-operation:${currentUser.id}`); }
        const submissionError = body as { error?: { code?: string; message?: string } };
        throw new Error(submissionError.error?.code === "DUPLICATE_DOCUMENT_SIDES"
          ? tCustomer("ui.kyc.duplicateDocumentSides") : submissionError.error?.message ?? tCustomer("ui.kyc.submissionFailed"));
      }
      const { data: resData } = await res.json() as { data: { submissionId: string; status: "pending"; manualReviewRequired?: boolean } };
      if (!isMountedRef.current) return;
      setOcrNotice(resData.manualReviewRequired ? tCustomer("ui.kyc.manualReview") : null);
      await refreshUser();
      if (!isMountedRef.current) return;
      submitOperationIdRef.current = null;
      window.localStorage.removeItem(`mylawatan:kyc-operation:${currentUser.id}`);
      setSubmitUncertain(false);
      setSubmitRequestId(null);
      setActiveSubmission({
        id:            resData.submissionId,
        status:        "pending",
        docType:       result.data.docType,
        queuePosition: null,
        submittedAt:   new Date().toISOString(),
        reviewedAt:    null,
        reviewReasonCode: null,
        reviewReasonDetail: null,
      });
      await refreshSubmissionStatus();
      if (!isMountedRef.current) return;
      setFrontFile(null);
      setBackFile(null);
      evidenceGenerationRef.current += 1;
      setEvidenceGeneration(evidenceGenerationRef.current);
      ocrResultCacheRef.current = null;
      setFrontFramingConfirmed(false);
      setBackFramingConfirmed(false);
      setOcrConsent(false);
      setForm({ icNumber: "", docType: "national_id" });
      setHolderName(""); setOcrFields(null); setDraftId(null); setDraftVersion(null); setFrontOriginal(false); setBackOriginal(false);
      showFeedback("success", tCustomer("ui.kyc.submitted"));
    } catch (err) {
      if (!isMountedRef.current) return;
      const message = err instanceof Error ? err.message : tCustomer("ui.kyc.submissionFailed");
      setSubmitError(message);
      if (submitOperationIdRef.current) setSubmitUncertain(true);
      showFeedback("error", message);
    } finally {
      if (kycMutationRef.current === "submit") kycMutationRef.current = null;
      if (isMountedRef.current) setSubmitting(false);
    }
  }

  const canStartNewSubmission = !activeSubmission || ["rejected", "info_requested", "superseded", "withdrawn"].includes(activeSubmission.status);
  const showForm = canSubmit && !isVerified && !loading && canStartNewSubmission;
  const framingConfirmed = hasRequiredKycFramingConfirmation(form.docType, frontFramingConfirmed, backFramingConfirmed);
  const duplicateDocumentSides = duplicateDocumentSidesResult?.generation === evidenceGeneration && duplicateDocumentSidesResult.isDuplicate;
  const evidenceControlsDisabled = submitting || savingDraft || previewing;
  const submitDisabled = submitting || savingDraft || previewing || duplicateDocumentSides || !frontFile || (form.docType !== "passport" && !backFile) || !framingConfirmed || !holderName.trim() || Boolean(fileErrors.front || (form.docType !== "passport" && fileErrors.back));

  useEffect(() => {
    let active = true;
    if (form.docType !== "national_id" || !frontFile || !backFile) {
      return () => { active = false; };
    }
    void Promise.all([frontFile, backFile].map(async (file) => {
      const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    })).then(([frontHash, backHash]) => { if (active) setDuplicateDocumentSidesResult({ generation: evidenceGeneration, isDuplicate: frontHash === backHash }); })
      .catch(() => { /* The server remains the authoritative duplicate-image guard. */ });
    return () => { active = false; };
  }, [form.docType, frontFile, backFile, evidenceGeneration]);
  const currentOcrPreview = ocrFields?.generation === evidenceGeneration
    ? ocrFields : null;
  const nameOcrComparison = currentOcrPreview
    ? compareKycOcrField(form.docType, "holderName", holderName, currentOcrPreview) : null;
  const numberOcrComparison = currentOcrPreview
    ? compareKycOcrField(form.docType, "documentNumber", form.icNumber, currentOcrPreview) : null;

  function adoptOcrCandidate(field: "holderName" | "documentNumber") {
    const preview = currentOcrPreview;
    if (!preview || preview !== ocrFields || !frontFile || evidenceGenerationRef.current !== ocrResultCacheRef.current?.generation
      || previewRequestRef.current || submitting || savingDraft || submitUncertain) return;
    const value = field === "holderName" ? holderName : form.icNumber;
    const comparison = compareKycOcrField(form.docType, field, value, preview);
    if ((comparison.status !== "different" && comparison.status !== "empty") || !comparison.candidate) return;
    if (field === "holderName") {
      nameEditRevisionRef.current += 1;
      setHolderName(comparison.candidate);
      holderNameInputRef.current?.focus();
    } else {
      numberEditRevisionRef.current += 1;
      setForm((current) => ({ ...current, icNumber: comparison.candidate! }));
      setFormError(null);
      documentNumberInputRef.current?.focus();
    }
  }

  async function refreshOperationStatus() {
    const operationId = submitOperationIdRef.current;
    if (!operationId || operationChecking) return;
    setOperationChecking(true);
    try {
      const response = await fetch(`/api/kyc/operation/${operationId}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error("operation_unavailable");
      if (body.data?.operation?.state === "succeeded") {
        window.localStorage.removeItem(`mylawatan:kyc-operation:${currentUser?.id}`);
        submitOperationIdRef.current = null; setSubmitUncertain(false); setSubmitError(null);
        await refreshSubmissionStatus();
      }
    } catch { setSubmitError(tCustomer("ui.kyc.statusCheckFailed")); }
    finally { setOperationChecking(false); }
  }

  async function withdrawSubmission() {
    if (!activeSubmission || activeSubmission.status !== "pending" || typeof activeSubmission.reviewVersion !== "number" || withdrawing) return;
    setWithdrawing(true);
    setSubmitError(null);
    const operationId = crypto.randomUUID();
    try {
      const response = await fetch("/api/kyc/submission/withdraw", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId: activeSubmission.id, expectedVersion: activeSubmission.reviewVersion, operationId }),
      });
      if (!response.ok) {
        await refreshSubmissionStatus();
        return;
      }
      setActiveSubmission({ ...activeSubmission, status: "withdrawn" });
      setConfirmWithdrawal(false);
      showFeedback("success", tCustomer("ui.kyc.withdrawn"));
    } catch {
      // Resolve the case state instead of encouraging a blind resubmission.
      await refreshSubmissionStatus();
    } finally {
      setWithdrawing(false);
    }
  }

  if (!currentUser) return <CustomerPageShell><GuestAccountEmptyState title={tCustomer("ui.kyc.guestTitle")} description={tCustomer("ui.kyc.guestDescription")} nextPath={continuation ?? "/customer/kyc"} /></CustomerPageShell>;

  return (
    <>
      <CustomerPageTitle
        eyebrow={tCustomer("accountGroups.account")}
        title={tCustomer("ui.profileSections.identityVerification")}
        description={tCustomer("ui.kyc.description")}
        icon={<ShieldCheck size={14} />}
        actions={
          <Button asChild variant="outline">
            <BackLink fallbackHref="/customer/profile">
              <ArrowLeft size={16} />
              {tCustomer("actions.back", { ns: "common" })}
            </BackLink>
          </Button>
        }
      />

      <CustomerPageShell wide className="pt-0 sm:pt-0">

      {(isVerified || activeSubmission?.status === "pending") && continuation && <div className="mb-6"><Button asChild><Link href={continuation}>{tCustomer("ui.kyc.continue")}</Link></Button></div>}

      {/* Status badge */}
      <div
        className="flex items-center gap-3 p-4 rounded-2xl mb-8 border"
        style={{
          backgroundColor: isVerified
            ? "color-mix(in srgb, var(--primary) 8%, transparent)"
            : activeSubmission?.status === "info_requested"
            ? "color-mix(in srgb, orange 8%, transparent)"
            : activeSubmission?.status === "rejected"
            ? "color-mix(in srgb, var(--destructive) 8%, transparent)"
            : activeSubmission?.status === "pending"
            ? "color-mix(in srgb, var(--accent) 10%, transparent)"
            : "var(--card)",
          borderColor: isVerified
            ? "color-mix(in srgb, var(--primary) 30%, transparent)"
            : activeSubmission?.status === "info_requested"
            ? "color-mix(in srgb, orange 30%, transparent)"
            : activeSubmission?.status === "rejected"
            ? "color-mix(in srgb, var(--destructive) 30%, transparent)"
            : activeSubmission?.status === "pending"
            ? "color-mix(in srgb, var(--accent) 30%, transparent)"
            : "var(--border)",
        }}
      >
        {isVerified ? (
          <CheckCircle2 size={20} className="text-primary shrink-0" />
        ) : activeSubmission?.status === "info_requested" ? (
          <AlertTriangle size={20} className="shrink-0" style={{ color: "orange" }} />
        ) : activeSubmission?.status === "rejected" ? (
          <AlertTriangle size={20} className="text-destructive shrink-0" />
        ) : activeSubmission?.status === "pending" ? (
          <Clock size={20} className="text-accent shrink-0" />
        ) : (
          <Info size={20} className="text-muted-foreground shrink-0" />
        )}
        <div>
          <p className="text-sm font-semibold text-foreground">
            {isVerified
              ? tCustomer("ui.kyc.verified")
              : activeSubmission?.status === "info_requested"
              ? tCustomer("ui.kyc.infoRequired")
              : activeSubmission?.status === "rejected"
              ? tCustomer("ui.kyc.rejected")
              : activeSubmission?.status === "pending"
              ? tCustomer("ui.kyc.underReview")
              : activeSubmission?.status === "withdrawn"
              ? tCustomer("ui.kyc.withdrawn")
              : canSubmit
              ? tCustomer("ui.kyc.ready")
              : tCustomer("ui.kyc.baseAccountRequired")}
          </p>
          {activeSubmission?.status === "pending" && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {tCustomer("ui.kyc.reviewWindow")}
              {activeSubmission.queuePosition != null && ` ${tCustomer("ui.kyc.queue", { position: activeSubmission.queuePosition })}`}
            </p>
          )}
          {activeSubmission?.status === "info_requested" && (
            <div className="mt-0.5">
              <p className="text-xs" style={{ color: "darkorange" }}>
                {tCustomer(`ui.kyc.reviewReasons.${activeSubmission.reviewReasonCode ?? "default"}`)}
              </p>
              {activeSubmission.reviewReasonDetail && <p className="text-xs text-muted-foreground mt-1">{tCustomer("ui.kyc.reviewerNote", { note: activeSubmission.reviewReasonDetail })}</p>}
              {activeSubmission.reviewedAt && <p className="text-xs text-muted-foreground mt-1">{tCustomer("ui.kyc.reviewed", { date: new Date(activeSubmission.reviewedAt).toLocaleString(i18n.language === "en" ? "en-MY" : i18n.language) })}</p>}
            </div>
          )}
          {activeSubmission?.status === "rejected" && (
            <div className="mt-0.5">
              <p className="text-xs text-destructive">{tCustomer(`ui.kyc.reviewReasons.${activeSubmission.reviewReasonCode ?? "default"}`)}</p>
              {activeSubmission.reviewReasonDetail && <p className="text-xs text-muted-foreground mt-1">{tCustomer("ui.kyc.reviewerNote", { note: activeSubmission.reviewReasonDetail })}</p>}
              {activeSubmission.reviewedAt && <p className="text-xs text-muted-foreground mt-1">{tCustomer("ui.kyc.reviewed", { date: new Date(activeSubmission.reviewedAt).toLocaleString(i18n.language === "en" ? "en-MY" : i18n.language) })}</p>}
            </div>
          )}
        </div>
      </div>

      {activeSubmission?.status === "pending" && <section className="mb-6 rounded-2xl border border-border bg-card p-4">
        {!confirmWithdrawal ? <Button variant="outline" disabled={withdrawing || Boolean(submitError)} onClick={() => setConfirmWithdrawal(true)}>{tCustomer("ui.kyc.withdrawApplication")}</Button> : <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{tCustomer("ui.kyc.withdrawConfirm")}</p>
          <div className="flex gap-2"><Button variant="destructive" disabled={withdrawing || Boolean(submitError)} onClick={() => void withdrawSubmission()}>{withdrawing ? tCustomer("ui.kyc.submitting") : tCustomer("ui.kyc.confirmWithdraw")}</Button><Button variant="outline" disabled={withdrawing} onClick={() => setConfirmWithdrawal(false)}>{tCustomer("actions.cancel", { ns: "common" })}</Button></div>
        </div>}
      </section>}
      {submitUncertain && <div className="mb-6 rounded-xl border border-amber-500/30 p-3 text-sm" role="status">
        <p>{tCustomer("ui.kyc.submissionChecking")}</p>
        {submitError && <div className="mt-1"><ApiErrorNotice message={submitError} requestId={submitRequestId ?? undefined} /></div>}
        <Button variant="outline" size="sm" disabled={operationChecking} onClick={() => void refreshOperationStatus()} className="mt-2">{operationChecking ? tCustomer("ui.kyc.checkingStatus") : tCustomer("ui.kyc.checkStatus")}</Button>
        {!form.icNumber && <div className="mt-3 space-y-1"><label htmlFor="kyc-retry-ic-number" className="text-xs font-semibold text-muted-foreground">{tCustomer("ui.kyc.reenterNumberForRetry")}</label>
          <input id="kyc-retry-ic-number" value={form.icNumber} onChange={(event) => { numberEditRevisionRef.current += 1; setForm((value) => ({ ...value, icNumber: event.target.value })); }}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" /></div>}
        <Button variant="outline" size="sm" disabled={submitting || !form.icNumber || !frontFile || (form.docType !== "passport" && !backFile) || !framingConfirmed} onClick={() => void handleSubmit({ preventDefault() {} } as React.FormEvent)} className="mt-2">
          {tCustomer("ui.kyc.retrySameOperation")}
        </Button>
      </div>}
      {submitError && activeSubmission?.status === "pending" && !submitUncertain && <div className="mb-6 rounded-xl border border-destructive/30 p-3 text-sm text-destructive" role="alert">
        <p>{submitError}</p><Button variant="outline" size="sm" disabled={statusChecking} onClick={() => void refreshSubmissionStatus()} className="mt-2">{statusChecking ? tCustomer("ui.kyc.checkingStatus") : tCustomer("ui.kyc.checkStatus")}</Button>
      </div>}

      {/* KYC submission form */}
      {showForm && !submitUncertain && (
        <form onSubmit={handleSubmit} className="rounded-2xl border border-border bg-card p-6 space-y-5">
          <h2 className="font-bold text-foreground">
            {activeSubmission?.status === "info_requested" || activeSubmission?.status === "rejected" ? tCustomer("ui.kyc.newSubmission") : tCustomer("ui.kyc.submitDocuments")}
          </h2>

          {(activeSubmission?.status === "info_requested" || activeSubmission?.status === "rejected") && (
            <div className="flex items-start gap-2 p-3 rounded-xl border text-xs" style={{ backgroundColor: "color-mix(in srgb, orange 8%, transparent)", borderColor: "color-mix(in srgb, orange 30%, transparent)", color: "darkorange" }}>
              <AlertTriangle size={13} className="shrink-0 mt-0.5" />
              <span>
                <><strong>{activeSubmission.status === "rejected" ? tCustomer("ui.kyc.previousRejected") : tCustomer("ui.kyc.moreInfo")}</strong> {tCustomer(`ui.kyc.reviewReasons.${activeSubmission.reviewReasonCode ?? "default"}`)}</>
              </span>
            </div>
          )}

          <div className="space-y-1">
            <label htmlFor="kyc-holder-name" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{tCustomer(form.docType === "passport" ? "ui.kyc.passportLatinName" : "ui.kyc.holderName")}</label>
            <input id="kyc-holder-name" ref={holderNameInputRef} value={holderName} disabled={evidenceControlsDisabled} onChange={(event) => { nameEditRevisionRef.current += 1; recognitionOperationRef.current = null; if (currentUser) window.sessionStorage.removeItem(`mylawatan:kyc-preview-operation:${currentUser.id}`); setHolderName(event.target.value); }} maxLength={100}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-border bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/30" />
            {nameOcrComparison?.status === "matched" && <p className="text-xs text-muted-foreground" role="status">{tCustomer("ui.kyc.ocrFieldMatched")}</p>}
            {(nameOcrComparison?.status === "different" || nameOcrComparison?.status === "empty") && nameOcrComparison.candidate && <div className="flex flex-wrap items-center gap-2 text-xs" role="status">
              <span className="text-muted-foreground">{tCustomer("ui.kyc.ocrFieldSuggestion", { value: nameOcrComparison.candidate })}</span>
              <Button type="button" variant="outline" size="sm" disabled={previewing || savingDraft || submitting || submitUncertain} onClick={() => adoptOcrCandidate("holderName")}>{tCustomer("ui.kyc.useOcrName")}</Button>
            </div>}
            {nameOcrComparison?.status === "document_conflict" && <p className="text-xs text-amber-700 dark:text-amber-200" role="status">{tCustomer("ui.kyc.ocrDocumentConflict")}</p>}
            {nameOcrComparison?.status === "unconfirmed" && <p className="text-xs text-muted-foreground" role="status">{tCustomer("ui.kyc.ocrFieldUnconfirmed")}</p>}
          </div>

          <div className="space-y-1">
            <label htmlFor="kyc-ic-number" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {tCustomer("ui.kyc.idNumber")}
            </label>
            <input
              id="kyc-ic-number"
              ref={documentNumberInputRef}
              value={form.icNumber}
              disabled={evidenceControlsDisabled}
              onChange={(e) => { numberEditRevisionRef.current += 1; setForm((f) => ({ ...f, icNumber: e.target.value })); setFormError(null); }}
              placeholder={tCustomer(IC_PATTERNS[form.docType]?.hintKey ?? "ui.kyc.idPlaceholder")}
              className="w-full px-3 py-2.5 text-sm rounded-xl border bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              style={{ borderColor: formError ? "var(--destructive)" : "var(--border)" }}
            />
            {formError && <p className="text-xs text-destructive">{formError}</p>}
            {numberOcrComparison?.status === "matched" && <p className="text-xs text-muted-foreground" role="status">{tCustomer("ui.kyc.ocrFieldMatched")}</p>}
            {(numberOcrComparison?.status === "different" || numberOcrComparison?.status === "empty") && numberOcrComparison.candidate && <div className="flex flex-wrap items-center gap-2 text-xs" role="status">
              <span className="text-muted-foreground">{tCustomer("ui.kyc.ocrFieldSuggestion", { value: numberOcrComparison.candidate })}</span>
              <Button type="button" variant="outline" size="sm" disabled={previewing || savingDraft || submitting || submitUncertain} onClick={() => adoptOcrCandidate("documentNumber")}>{tCustomer("ui.kyc.useOcrNumber")}</Button>
            </div>}
            {numberOcrComparison?.status === "document_conflict" && <p className="text-xs text-amber-700 dark:text-amber-200" role="status">{tCustomer("ui.kyc.ocrDocumentConflict")}</p>}
            {numberOcrComparison?.status === "unconfirmed" && <p className="text-xs text-muted-foreground" role="status">{tCustomer("ui.kyc.ocrFieldUnconfirmed")}</p>}
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{tCustomer("ui.kyc.documentType")}</label>
            <select
              value={form.docType}
              disabled={evidenceControlsDisabled}
              onChange={(e) => handleDocumentTypeChange(e.target.value as typeof form.docType)}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-border bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="national_id">{tCustomer("ui.kyc.myKad")}</option>
              <option value="passport">{tCustomer("ui.kyc.passport")}</option>
              <option value="driving_license">{tCustomer("ui.kyc.drivingLicense")}</option>
            </select>
          </div>

          {form.docType === "national_id" && <div className="space-y-2">
            <input ref={combinedFileInputRef} type="file" accept={KYC_ACCEPTED_TYPES.join(",")} className="sr-only"
              onChange={(event) => { void splitCombinedMyKadPhoto(event.target.files?.[0] ?? null); event.target.value = ""; }} />
            <Button type="button" variant="outline" disabled={evidenceControlsDisabled}
              onClick={() => frontFile && frontOriginal ? void splitCombinedMyKadPhoto(frontFile) : combinedFileInputRef.current?.click()}>
              {frontFile && frontOriginal ? tCustomer("ui.kyc.splitCurrentMyKadPhoto") : tCustomer("ui.kyc.useCombinedMyKadPhoto")}
            </Button>
          </div>}

          {getRequiredKycDocumentSides(form.docType).map((side) => {
            const file = side === "front" ? frontFile : backFile;
            const inputRef = side === "front" ? frontFileInputRef : backFileInputRef;
            const fileError = fileErrors[side];
            const sideLabel = form.docType === "passport" ? tCustomer("ui.kyc.passportDataPage") : tCustomer(side === "front" ? "ui.kyc.frontOf" : "ui.kyc.backOf");
            return <div className="space-y-1" key={side}>
              <label htmlFor={`kyc-${side}-file`} className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{sideLabel}</label>
              <input id={`kyc-${side}-file`} ref={inputRef} type="file" accept={KYC_ACCEPTED_TYPES.join(",")} className="sr-only"
                onChange={(e) => handleFileChange(side, e.target.files?.[0] ?? null)} disabled={evidenceControlsDisabled} />
              <div className="flex gap-2">
              {draftCapabilities.documentCapture && <Button type="button" variant="outline" disabled={evidenceControlsDisabled} onClick={() => setCameraSide(side)} className="flex-1">
                {tCustomer("ui.kyc.cameraOpen")}
              </Button>}
              <button type="button" disabled={evidenceControlsDisabled} onClick={() => inputRef.current?.click()}
                className="w-full flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed transition-colors"
                style={{ borderColor: fileError ? "var(--destructive)" : file ? "var(--primary)" : "var(--border)", backgroundColor: file ? "color-mix(in srgb, var(--primary) 6%, transparent)" : "transparent" }}>
                {file ? <><FileCheck2 size={22} className="text-primary" /><p className="text-sm font-semibold text-primary">{file.name}</p><p className="text-xs text-muted-foreground">{tCustomer("strictMigration.kyc.fileMeta", { size: (file.size / 1024 / 1024).toFixed(2), type: tCustomer("ui.kyc.clickChange") })}</p></>
                  : <><Upload size={20} className="text-muted-foreground" /><p className="text-sm text-muted-foreground">{tCustomer("ui.kyc.clickUpload", { side: sideLabel })}</p><p className="text-xs text-muted-foreground">{tCustomer("ui.kyc.fileHint")}</p></>}
              </button>
              </div>
              <KycPhotoPreview
                file={fileError ? null : file}
                label={sideLabel}
                documentType={form.docType}
                confirmed={side === "front" ? frontFramingConfirmed : backFramingConfirmed}
                disabled={evidenceControlsDisabled}
                onConfirmationChange={side === "front" ? setFrontFramingConfirmed : setBackFramingConfirmed}
              />
              {fileError && <p className="text-xs text-destructive">{fileError}</p>}
            </div>;
          })}
          {duplicateDocumentSides && <p className="text-xs text-amber-700 dark:text-amber-200" role="alert">{tCustomer("ui.kyc.duplicateDocumentSides")}</p>}

          <label className="flex items-start gap-3 rounded-xl border border-border p-3 text-xs text-muted-foreground">
            <input type="checkbox" checked={ocrConsent} disabled={evidenceControlsDisabled} onChange={(e) => setOcrConsent(e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />
            <span>{tCustomer("ui.kyc.consent")}</span>
          </label>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={evidenceControlsDisabled || duplicateDocumentSides || !draftCapabilities.cleanOcr || form.docType === "passport" && !draftCapabilities.chinesePassportOcr || !frontFile || (form.docType !== "passport" && !backFile) || !framingConfirmed || !ocrConsent} onClick={() => void previewDocument()}>
              {previewing ? tCustomer("ui.kyc.previewing") : tCustomer("ui.kyc.recognizeDocument")}
            </Button>
            <Button type="button" variant="outline" disabled={evidenceControlsDisabled || duplicateDocumentSides || !frontFile || (form.docType !== "passport" && !backFile)} onClick={() => void saveDraft()}>
              {savingDraft ? tCustomer("ui.kyc.savingDraft") : tCustomer("ui.kyc.saveDraft")}
            </Button>
          </div>
          {currentOcrPreview && <div className="text-xs text-muted-foreground">
            {currentOcrPreview.expiryDate && <p>{tCustomer("ui.kyc.expiryDate", { date: currentOcrPreview.expiryDate })}</p>}
            {currentOcrPreview.mrzStatus && <p>{tCustomer("ui.kyc.mrzStatus", { status: currentOcrPreview.mrzStatus })}</p>}
          </div>}
          {draftNotice && <p className="text-xs text-muted-foreground" role="status">{draftNotice}</p>}

          {submitError && <ApiErrorNotice message={submitError} requestId={submitRequestId ?? undefined} />}
          {ocrNotice && <p className="text-xs text-amber-700 dark:text-amber-200 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg px-3 py-2">{ocrNotice}</p>}

          <Button type="submit" disabled={submitDisabled || !ocrConsent} className="w-full">
            {submitting ? tCustomer("ui.kyc.submitting") : activeSubmission?.status === "rejected" || activeSubmission?.status === "info_requested" ? tCustomer("ui.kyc.startNew") : tCustomer("ui.kyc.submitForReview")}
          </Button>
        </form>
      )}
      </CustomerPageShell>
      <KycDocumentCameraDialog open={cameraSide !== null} documentType={form.docType} qualityMode={draftCapabilities.qualityMode}
        onOpenChange={(open) => { if (!open) setCameraSide(null); }}
        onAccept={(file) => { if (cameraSide) handleFileChange(cameraSide, file); }} />
      {cropDialog}
    </>
  );
}
