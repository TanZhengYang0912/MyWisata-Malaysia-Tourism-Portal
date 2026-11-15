export const NAV_FORWARD = "nav-forward";
/** enter/exit class map for page and step boundaries: typed forward = slide, everything else = fade (back always fades). */
export const PAGE_TRANSITION = { [NAV_FORWARD]: "nav-forward", default: "page-fade" } as const;
