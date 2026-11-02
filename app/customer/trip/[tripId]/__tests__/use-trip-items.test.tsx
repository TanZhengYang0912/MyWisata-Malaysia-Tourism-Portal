import React, {act} from "react";
import {beforeAll, describe, expect, it, vi} from "vitest";
import {installTestDom, type TestDocument} from "@/components/shared/__tests__/render-test-dom";
import type {TripItem} from "@/backend/domains/trips";
const actions = vi.hoisted(()=>({getTripItemsStateAction:vi.fn(),addTripItemAction:vi.fn(), deleteTripItemAction:vi.fn(), reorderTripItemsAction:vi.fn(), updateTripItemLocationAction:vi.fn(), updateTripItemScheduleAction:vi.fn(), clearTripItemsAction:vi.fn(), replaceTripItemAction:vi.fn()}));
vi.mock("../../actions",()=>actions);
vi.mock("react-i18next",()=>({useTranslation:()=>({t:(key:string)=>key})}));
vi.mock("@/components/providers/app-dialog",()=>({useAppDialog:()=>({alert:vi.fn(),confirm:async()=>true})}));
import {useTripItems} from "../use-trip-items";
let document:TestDocument;
let createRoot:typeof import("react-dom/client").createRoot;
beforeAll(async()=>{document=installTestDom();({createRoot}=await import("react-dom/client"));});
const saved=<T,>(value:T)=>({ok:true as const,value,version:"next-version"});
const row:TripItem={id:"stored-id", trip_id:"trip", experience_id:null, sequence:0, scheduled_date:null,scheduled_time:null, created_at:"now",source:"location",lat:3,lng:101,label:"Old"};
describe("canonical trip state",()=>{
  it("retains an origin on failed save and adopts the new stored ID",async()=>{
    let trip!:ReturnType<typeof useTripItems>;
    function Probe({initial}:{initial:TripItem[]}) {trip=useTripItems("trip",initial,"initial-version");return null;}
    const container=document.createElement("div");document.body.appendChild(container);
    const root=createRoot(container as unknown as Element);
    await act(async()=>root.render(<Probe initial={[row]}/>));
    actions.updateTripItemLocationAction.mockResolvedValueOnce({ok:false});
    await act(async()=>{await trip.setLocation({label:"New",lat:4,lng:102});});
    expect(trip.items).toEqual([row]);
    expect(actions.addTripItemAction).not.toHaveBeenCalled();
    actions.updateTripItemLocationAction.mockResolvedValueOnce(saved({...row,label:"Saved"}));
    await act(async()=>{await trip.setLocation({label:"Saved",lat:4,lng:102});});
    expect(trip.origin?.id).toBe("stored-id");
    expect(trip.origin?.label).toBe("Saved");
    await act(async()=>root.unmount());
    const next=createRoot(container as unknown as Element);
    await act(async()=>next.render(<Probe initial={[]}/>));
    actions.addTripItemAction.mockResolvedValueOnce(saved({...row,id:"new-real-id"}));
    await act(async()=>{await trip.setLocation({label:"New",lat:4,lng:102});});
    expect(trip.origin?.id).toBe("new-real-id");
    await act(async()=>next.unmount());
  });
  it("keeps a newly saved daily origin in canonical sequence order",async()=>{
    let trip!:ReturnType<typeof useTripItems>;
    const stop={...row,id:"stop",sequence:0,scheduled_date:"2026-09-16",scheduled_time:"10:00"};
    function Probe(){trip=useTripItems("trip",[stop],"initial-version");return null;}
    const container=document.createElement("div");const root=createRoot(container as unknown as Element);
    await act(async()=>root.render(<Probe/>));
    actions.addTripItemAction.mockResolvedValueOnce(saved({...row,id:"origin",sequence:0,scheduled_date:"2026-09-16",is_day_origin:true}));

    await act(async()=>{await trip.setLocation({label:"Hotel",lat:4,lng:102},"2026-09-16");});

    expect(trip.items.map(item=>[item.id,item.sequence])).toEqual([["origin",0],["stop",1]]);
    await act(async()=>root.unmount());
  });
  it("serializes quick edits, preserves failed deletes and clears only after success",async()=>{
    let trip!:ReturnType<typeof useTripItems>;
    function Probe(){trip=useTripItems("trip",[row],"initial-version");return null;}
    const container=document.createElement("div"); const root=createRoot(container as unknown as Element);
    await act(async()=>root.render(<Probe/>));
    let finish!:(value:TripItem)=>void;
    actions.updateTripItemLocationAction.mockImplementationOnce(()=>new Promise(resolve=>{finish=value=>resolve(saved(value));}));
    actions.deleteTripItemAction.mockRejectedValueOnce(new Error("offline"));
    let update!:Promise<unknown>; let remove!:Promise<unknown>;
    await act(async()=>{update=trip.update(row.id,{label:"Saved",lat:4,lng:102});remove=trip.remove(row.id);await Promise.resolve();});
    expect(actions.deleteTripItemAction).not.toHaveBeenCalled();
    await act(async()=>{finish({...row,label:"Saved"});await update;await remove;});
    expect(trip.items[0].label).toBe("Saved");
    actions.getTripItemsStateAction.mockResolvedValueOnce({ok:true,items:trip.items,version:"verified"});
    await act(async()=>{await trip.verify();});
    actions.clearTripItemsAction.mockRejectedValueOnce(new Error("offline"));
    await act(async()=>{await trip.clear();});expect(trip.items).toHaveLength(1);
    actions.getTripItemsStateAction.mockResolvedValueOnce({ok:true,items:trip.items,version:"verified-again"});
    await act(async()=>{await trip.verify();});
    actions.clearTripItemsAction.mockResolvedValueOnce(saved(undefined));
    await act(async()=>{await trip.clear();});expect(trip.items).toEqual([]);
    await act(async()=>root.unmount());
  });
  it("reconciles canonical sequence after a move and preserves rows on rejection",async()=>{
    let trip!:ReturnType<typeof useTripItems>;
    const b={...row,id:"b",sequence:1};
    function Probe(){trip=useTripItems("trip",[row,b],"initial-version");return null;}
    const container=document.createElement("div");const root=createRoot(container as unknown as Element);
    await act(async()=>root.render(<Probe/>));
    actions.reorderTripItemsAction.mockResolvedValueOnce(saved([{...b,sequence:0},{...row,sequence:1}]));
    await act(async()=>{await trip.move(1,0);});
    expect(trip.items.map(item=>[item.id,item.sequence])).toEqual([["b",0],["stored-id",1]]);
    actions.reorderTripItemsAction.mockRejectedValueOnce(new Error("offline"));
    await act(async()=>{await trip.move(1,0);});
    expect(trip.items[0].id).toBe("b");
    await act(async()=>root.unmount());
  });

  it("keeps the intended move targets when an earlier queued deletion shifts indexes",async()=>{
    let trip!:ReturnType<typeof useTripItems>;
    const b={...row,id:"b",sequence:1};const c={...row,id:"c",sequence:2};
    function Probe(){trip=useTripItems("trip",[row,b,c],"initial-version");return null;}
    const container=document.createElement("div");const root=createRoot(container as unknown as Element);
    await act(async()=>root.render(<Probe/>));
    let finish!:()=>void;
    actions.deleteTripItemAction.mockImplementationOnce(()=>new Promise(resolve=>{finish=()=>resolve(saved(undefined));}));
    actions.reorderTripItemsAction.mockClear().mockResolvedValueOnce(saved([{...c,sequence:0},{...b,sequence:1}]));
    let remove!:Promise<unknown>;let move!:Promise<unknown>;
    await act(async()=>{remove=trip.remove(row.id);move=trip.move(2,1);await Promise.resolve();});
    await act(async()=>{finish();await remove;await move;});
    expect(actions.reorderTripItemsAction).toHaveBeenCalledWith("trip",["c","b"],"next-version");
    expect(trip.items.map(item=>item.id)).toEqual(["c","b"]);
    await act(async()=>root.unmount());
  });

});
