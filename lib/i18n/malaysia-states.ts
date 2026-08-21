const MALAYSIA_STATE_TRANSLATION_KEYS: Record<string, string> = {
  "all malaysia": "ui.malaysiaStates.allMalaysia",
  johor: "ui.malaysiaStates.johor",
  kedah: "ui.malaysiaStates.kedah",
  kelantan: "ui.malaysiaStates.kelantan",
  melaka: "ui.malaysiaStates.melaka",
  "negeri sembilan": "ui.malaysiaStates.negeriSembilan",
  pahang: "ui.malaysiaStates.pahang",
  perak: "ui.malaysiaStates.perak",
  perlis: "ui.malaysiaStates.perlis",
  penang: "ui.malaysiaStates.penang",
  sabah: "ui.malaysiaStates.sabah",
  sarawak: "ui.malaysiaStates.sarawak",
  selangor: "ui.malaysiaStates.selangor",
  terengganu: "ui.malaysiaStates.terengganu",
  "kuala lumpur": "ui.malaysiaStates.kualaLumpur",
  putrajaya: "ui.malaysiaStates.putrajaya",
  labuan: "ui.malaysiaStates.labuan",
};

/** Returns a translation key only for canonical Malaysian state values. */
export function getMalaysiaStateTranslationKey(state: string | null | undefined): string | null {
  if (!state) return null;
  return MALAYSIA_STATE_TRANSLATION_KEYS[state.trim().toLowerCase()] ?? null;
}
