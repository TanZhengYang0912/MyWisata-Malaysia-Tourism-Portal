import type { DemoState } from "./types";

export const KL_LOCATION = { lat: 3.139, lng: 101.6869 } as const;

export const DEMO_STATES: DemoState[] = [
  { id: "perlis", name: "Perlis", kind: "state", region: "Peninsular", label: [100.25, 6.55] },
  { id: "kedah", name: "Kedah", kind: "state", region: "Peninsular", label: [100.47, 5.95] },
  { id: "penang", name: "Penang", kind: "state", region: "Peninsular", label: [100.33, 5.42] },
  { id: "perak", name: "Perak", kind: "state", region: "Peninsular", label: [101.02, 4.72] },
  { id: "selangor", name: "Selangor", kind: "state", region: "Peninsular", label: [101.48, 3.2] },
  { id: "kuala-lumpur", name: "Kuala Lumpur", kind: "federal-territory", region: "Peninsular", label: [101.69, 3.14] },
  { id: "putrajaya", name: "Putrajaya", kind: "federal-territory", region: "Peninsular", label: [101.7, 2.93] },
  { id: "negeri-sembilan", name: "Negeri Sembilan", kind: "state", region: "Peninsular", label: [102.1, 2.7] },
  { id: "melaka", name: "Melaka", kind: "state", region: "Peninsular", label: [102.25, 2.2] },
  { id: "johor", name: "Johor", kind: "state", region: "Peninsular", label: [103.5, 1.9] },
  { id: "kelantan", name: "Kelantan", kind: "state", region: "Peninsular", label: [102.0, 5.4] },
  { id: "terengganu", name: "Terengganu", kind: "state", region: "Peninsular", label: [102.9, 5.1] },
  { id: "pahang", name: "Pahang", kind: "state", region: "Peninsular", label: [102.8, 3.7] },
  { id: "sarawak", name: "Sarawak", kind: "state", region: "Borneo", label: [113.3, 2.7] },
  { id: "sabah", name: "Sabah", kind: "state", region: "Borneo", label: [117.0, 5.6] },
  { id: "labuan", name: "Labuan", kind: "federal-territory", region: "Borneo", label: [115.23, 5.32] },
];

export const RADIUS_OPTIONS_KM = [25, 50, 100] as const;

export function getState(stateId: string): DemoState | undefined {
  return DEMO_STATES.find((state) => state.id === stateId);
}
