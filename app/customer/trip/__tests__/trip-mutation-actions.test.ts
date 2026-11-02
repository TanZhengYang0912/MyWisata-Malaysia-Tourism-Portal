import {beforeEach,describe,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({update:vi.fn(),revalidate:vi.fn()}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({owned:true})}));
vi.mock("@/backend/domains/trips",()=>({createTrip:vi.fn(),deleteTrip:vi.fn(),getTripById:vi.fn(),getTripItems:vi.fn(),getTripNameSequence:vi.fn(),updateTripItem:mocks.update}));
vi.mock("@/backend/domains/catalogue",()=>({searchTripActivities:vi.fn()}));
vi.mock("@/lib/cache/catalogue-cache",()=>({getCachedDiscoveryActivityData:vi.fn(async()=>({activities:[],outlets:[]}))}));
vi.mock("next/cache",()=>({revalidatePath:mocks.revalidate}));
vi.mock("next/navigation",()=>({redirect:vi.fn()}));
const {updateTripItemScheduleAction}=await import("../actions");
beforeEach(()=>vi.resetAllMocks());
describe("Trip mutation transport",()=>{
 it("returns a safe validation failure rather than throwing into the framework",async()=>{
  mocks.update.mockRejectedValue(Object.assign(new Error("Trip times must follow itinerary order"), {code:"TRIP_INVALID"}));
  await expect(updateTripItemScheduleAction("trip","item",{scheduled_date:"2026-10-22",scheduled_time:"09:00"},"version")).resolves.toEqual({ok:false,code:"TRIP_INVALID"});
  expect(mocks.revalidate).not.toHaveBeenCalled();
 });
 it("returns the canonical row and revalidates only after success",async()=>{
  const row={id:"stored",scheduled_time:"11:00:00"};mocks.update.mockResolvedValue({value:row,version:"next"});
  expect(await updateTripItemScheduleAction("trip","item",{scheduled_date:"2026-10-22",scheduled_time:"11:00"},"version")).toEqual({ok:true,value:row,version:"next"});
  expect(mocks.revalidate).toHaveBeenCalledWith("/customer/trip/trip");
 });
 it("keeps a committed mutation successful when cache revalidation fails",async()=>{
  const row={id:"stored",scheduled_time:"11:00:00"};mocks.update.mockResolvedValue({value:row,version:"next"});
  mocks.revalidate.mockImplementation(()=>{throw new Error("cache refresh unavailable");});
  expect(await updateTripItemScheduleAction("trip","item",{scheduled_date:"2026-10-22",scheduled_time:"11:00"},"version"))
   .toEqual({ok:true,value:row,version:"next",refreshRequired:true});
 });
});
