"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ConfirmRequest = {
  id: number;
  kind: "confirm";
  message: string;
  resolve: (value: boolean) => void;
};

type PromptRequest = {
  id: number;
  kind: "prompt";
  message: string;
  defaultValue: string;
  resolve: (value: string | null) => void;
};

type AlertRequest = {
  id: number;
  kind: "alert";
  message: string;
  resolve: () => void;
};

type DialogRequest = ConfirmRequest | PromptRequest | AlertRequest;

type AppDialogContextValue = {
  confirm: (message: string) => Promise<boolean>;
  prompt: (message: string, defaultValue?: string) => Promise<string | null>;
  alert: (message: string) => Promise<void>;
};

const AppDialogContext = createContext<AppDialogContextValue | null>(null);

function PromptBody({
  request,
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  request: PromptRequest;
  cancelLabel: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: (value: string) => void;
}) {
  const [value, setValue] = useState(request.defaultValue);

  return (
    <form onSubmit={(event) => { event.preventDefault(); onConfirm(value); }}>
      <Input
        autoFocus
        value={value}
        onChange={(event) => setValue(event.target.value)}
        aria-label={request.message}
      />
      <DialogFooter className="mt-5">
        <Button type="button" variant="outline" onClick={onCancel}>{cancelLabel}</Button>
        <Button type="submit">{confirmLabel}</Button>
      </DialogFooter>
    </form>
  );
}

export function AppDialogProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation("common");
  const nextId = useRef(0);
  const [queue, setQueue] = useState<DialogRequest[]>([]);
  const current = queue[0];

  const confirm = useCallback((message: string) => new Promise<boolean>((resolve) => {
    const id = nextId.current++;
    setQueue((requests) => [...requests, { id, kind: "confirm", message, resolve }]);
  }), []);

  const prompt = useCallback((message: string, defaultValue = "") => new Promise<string | null>((resolve) => {
    const id = nextId.current++;
    setQueue((requests) => [...requests, { id, kind: "prompt", message, defaultValue, resolve }]);
  }), []);

  const alert = useCallback((message: string) => new Promise<void>((resolve) => {
    const id = nextId.current++;
    setQueue((requests) => [...requests, { id, kind: "alert", message, resolve }]);
  }), []);

  const settleCurrent = useCallback((result: boolean | string | null = false) => {
    const request = queue[0];
    if (!request) return;
    if (request.kind === "confirm") request.resolve(result === true);
    if (request.kind === "prompt") request.resolve(typeof result === "string" ? result : null);
    if (request.kind === "alert") request.resolve();
    setQueue((requests) => requests[0]?.id === request.id ? requests.slice(1) : requests);
  }, [queue]);

  const value = useMemo(() => ({ confirm, prompt, alert }), [alert, confirm, prompt]);

  return (
    <AppDialogContext.Provider value={value}>
      {children}
      <Dialog open={Boolean(current)} onOpenChange={(open) => { if (!open) settleCurrent(); }}>
        {current && (
          <DialogContent className="rounded-2xl border-border bg-card p-6 shadow-2xl sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{current.message}</DialogTitle>
              <DialogDescription className="sr-only">{t("actions.confirm")}</DialogDescription>
            </DialogHeader>
            {current.kind === "prompt" ? (
              <PromptBody
                key={current.id}
                request={current}
                cancelLabel={t("actions.cancel")}
                confirmLabel={t("actions.confirm")}
                onCancel={() => settleCurrent()}
                onConfirm={(input) => settleCurrent(input)}
              />
            ) : (
              <DialogFooter className="mt-2">
                {current.kind !== "alert" && <Button type="button" variant="outline" onClick={() => settleCurrent()}>{t("actions.cancel")}</Button>}
                <Button type="button" onClick={() => settleCurrent(true)}>{current.kind === "alert" ? t("actions.close") : t("actions.confirm")}</Button>
              </DialogFooter>
            )}
          </DialogContent>
        )}
      </Dialog>
    </AppDialogContext.Provider>
  );
}

export function useAppDialog() {
  const context = useContext(AppDialogContext);
  if (!context) throw new Error("useAppDialog must be used within AppDialogProvider");
  return context;
}
