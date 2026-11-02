"use client";

import {useRef, useState} from "react";
import {useTranslation} from "react-i18next";
import type {TripItem, TripMutationCode} from "@/backend/domains/trips";
import type {TripStop} from "./trip-planner-client";
import {applyTripOrder,resolveTripOrigin} from "@/lib/customer/trip-planner";
import {useAppDialog} from "@/components/providers/app-dialog";
import type {TripMutationResult} from "../actions";
import {getTripItemsStateAction, addTripItemAction, clearTripItemsAction, deleteTripItemAction, reorderTripItemsAction, replaceTripItemAction, updateTripItemLocationAction, updateTripItemScheduleAction} from "../actions";

type StopInput = Omit<TripStop, "id"> & {id?: string};

export function useTripItems(tripId: string, initialItems: TripItem[], initialVersion:string) {
  const [items, setItems] = useState(initialItems);
  const current = useRef(initialItems);
  const version = useRef(initialVersion);
  const blocked = useRef<TripMutationCode | null>(null);
  function stored<T>(result:TripMutationResult<T>):T {
    if(!result.ok) {
      if(result.code === "TRIP_CHANGED" || result.code === "TRIP_RESULT_UNKNOWN") blocked.current=result.code;
      throw Object.assign(new Error("Trip mutation rejected"), {code:result.code ?? "TRIP_UNAVAILABLE"});
    }
    version.current=result.version;
    return result.value;
  }
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const {t} = useTranslation("customer");
  const {alert, confirm} = useAppDialog();
  function commit(rows: TripItem[]) {current.current = rows; setItems(rows);}
  function reconcile(row: TripItem) {commit(current.current.map(item=>item.id === row.id ? row : item));}
  // One queue per mounted Trip: failed earlier writes cannot roll back later saves.
  function run<T>(operation:()=>Promise<T>):Promise<T | undefined> {
    setPending(count=>count+1);
    const task = queue.current.then(async()=>{
      setError(null);
      try {if(blocked.current) throw Object.assign(new Error("Trip requires verification"), {code:blocked.current});return await operation();}
      catch (error) {
        const code = typeof error === "object" && error && "code" in error ? String(error.code) : "TRIP_RESULT_UNKNOWN";
        if (code === "TRIP_RESULT_UNKNOWN") blocked.current = "TRIP_RESULT_UNKNOWN";
        const message = t(code === "TRIP_CHANGED" ? "ui.trip.versionConflict"
          : code === "TRIP_INVALID" ? "ui.trip.invalidChange"
          : code === "TRIP_ACCESS_DENIED" ? "ui.trip.accessChanged"
          : code === "TRIP_NOT_AVAILABLE" ? "ui.trip.itemUnavailable"
          : code === "TRIP_RESULT_UNKNOWN" ? "ui.trip.resultUnknown" : "ui.trip.serviceUnavailable");
        setError(message);
        void alert(message);
        return undefined;
      } finally {setPending(count=>count-1);}
    });
    queue.current = task;
    return task;
  }
  function input(stop:StopInput, date:string | null = null, time:string | null = null) {
    return {trip_id:tripId, experience_id:stop.source === "vendor" ? stop.id : undefined, source:stop.source, kind:stop.locationKind, lat:stop.lat, lng:stop.lng,label:stop.label,sublabel:stop.sublabel, scheduled_date:date,scheduled_time:date ? time : null,outlet_id:stop.source === "vendor" ? stop.outletId ?? null : null};
  }
  const stops:TripStop[] = items.map(item=>({id:item.id,lat:item.lat,lng:item.lng,label:item.label,sublabel:item.sublabel,source:item.source,locationKind:item.kind,outletId:item.outlet_id ?? undefined}));
  return {
    items, stops, origin:resolveTripOrigin(items,null), pending:pending>0,error,
    verify: async () => {
      if (pending > 0) return;
      setPending(count=>count+1);
      try {
        const result = await getTripItemsStateAction(tripId);
        if (!result.ok) { setError(t("ui.trip.verifyFailed")); return; }
        commit(result.items); version.current=result.version; blocked.current=null; setError(null);
      } catch { setError(t("ui.trip.verifyFailed")); }
      finally { setPending(count=>count-1); }
    },
    has:(id:string)=>items.some(item=>item.id === id || item.experience_id === id),
    add:(stop:StopInput,schedule?:{date:string | null;time?:string | null})=>run(async()=>{
      const row=stored(await addTripItemAction(input(stop,schedule?.date,schedule?.time),version.current));
      commit([...current.current,row]);return row;
    }),
    remove:(id:string)=>run(async()=>{
      const target=current.current.find(item=>item.id === id || item.experience_id === id);
      if (!target) return;
      stored(await deleteTripItemAction(tripId,target.id,version.current));
      commit(current.current.filter(item=>item.id !== target.id));
    }),
    move:(from:number,to:number)=>{
      const fromId=current.current[from]?.id;
      const toId=current.current[to]?.id;
      return run(async()=>{
        const ordered=[...current.current].sort((a,b)=>a.sequence-b.sequence);
        const sourceIndex=ordered.findIndex(item=>item.id === fromId);
        const targetIndex=ordered.findIndex(item=>item.id === toId);
        if (sourceIndex<0 || targetIndex<0) throw new Error("Trip items changed");
        const [moved]=ordered.splice(sourceIndex,1);ordered.splice(targetIndex,0,moved);
        const proposed=applyTripOrder(current.current,ordered.map(item=>item.id));
        commit(stored(await reorderTripItemsAction(tripId,proposed.map(item=>item.id),version.current)));
      });
    },
    setLocation:(stop:Omit<TripStop,"id" | "source">,date:string | null = null)=>run(async()=>{
      const existing=date ? current.current.find(item=>item.is_day_origin && item.scheduled_date === date) : resolveTripOrigin(current.current,null);
      const row=stored(existing ? await updateTripItemLocationAction(tripId,existing.id,stop,version.current) : await addTripItemAction({...input({...stop,source:"location"},date),...(date ? {is_day_origin:true} : {})},version.current));
      if (existing) reconcile(row);
      else if (date) {
        const ordered = [...current.current].sort((a,b)=>a.sequence-b.sequence);
        const firstSameDayIndex = ordered.findIndex(item=>item.scheduled_date === date);
        ordered.splice(firstSameDayIndex < 0 ? ordered.length : firstSameDayIndex,0,row);
        commit(applyTripOrder([...current.current,row],ordered.map(item=>item.id)));
      } else commit([...current.current,row]);
      return row;
    }),
    update:(id:string,updates:{label:string;lat:number;lng:number})=>run(async()=>{
      const row=stored(await updateTripItemLocationAction(tripId,id,updates,version.current));reconcile(row);return row;
    }),
    schedule:(id:string,date:string | null,time:string | null)=>run(async()=>{
      const row=stored(await updateTripItemScheduleAction(tripId,id,{scheduled_date:date,scheduled_time:date ? time : null},version.current));reconcile(row);return row;
    }),
    replace:(id:string,stop:StopInput)=>run(async()=>{
      if (!stop.id) throw new Error("Activity required");
      const row=stored(await replaceTripItemAction(tripId,id,{experience_id:stop.id,outlet_id:stop.outletId},version.current));reconcile(row);return row;
    }),
    clear:async()=>{
      if (!await confirm(t("ui.trip.clearItemsConfirm"))) return;
      return run(async()=>{stored(await clearTripItemsAction(tripId,version.current));commit([]);});
    },
  };
}
