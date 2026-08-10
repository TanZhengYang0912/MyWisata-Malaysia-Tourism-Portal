// DEV ONLY — entry point for the place-model prototype. See lib/dev/place-fixtures.ts.
// Hardcoded data, no Supabase, no migration. Delete this folder to undo.

import Link from "next/link";
import { MapPin } from "lucide-react";
import { getStates, getChildren, DEV_PLACES } from "@/lib/dev/place-fixtures";

export const metadata = { title: "Dev: place model prototype" };

export default function PlaceModelIndexPage() {
  const states = getStates();
  const poiCount = DEV_PLACES.filter((place) => place.level === "poi").length;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Prototype</p>
      <h1 className="mt-1 text-2xl font-bold text-foreground">Place-first navigation</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
        Three levels — state → region → place — served by one table and one page
        component. Vendors, outlets and products are unchanged; they attach to a
        place either explicitly (a guide service) or by distance (whatever is
        nearby). Everything on these pages is hardcoded in{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">lib/dev/place-fixtures.ts</code>.
      </p>

      <div className="mt-6 rounded-2xl border border-dashed border-border bg-muted/30 p-4 text-xs leading-6 text-muted-foreground">
        <p className="font-bold text-foreground">Four cases worth clicking through:</p>
        <ul className="mt-2 space-y-1">
          <li>
            <strong className="text-foreground">Nobody owns it, several vendors sell there</strong> —
            Pahang → Cameron Highlands → Gunung Brinchang Rafflesia Trail
          </li>
          <li>
            <strong className="text-foreground">Nobody owns it, nobody sells anything</strong> —
            Pahang → Kuantan → Teluk Cempedak Beach
          </li>
          <li>
            <strong className="text-foreground">One vendor controls everything</strong> —
            Sabah → Kundasang &amp; Ranau → Mount Kinabalu Summit Trail
          </li>
          <li>
            <strong className="text-foreground">Three vendors, three different things, one place</strong> —
            Penang → Penang National Park → Monkey Beach Trail
          </li>
        </ul>
      </div>

      <h2 className="mt-10 text-sm font-bold uppercase tracking-wide text-muted-foreground">
        {states.length} states · {poiCount} places
      </h2>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {states.map((state) => {
          const regions = getChildren(state.id);
          return (
            <Link
              key={state.id}
              href={`/dev/place-model/${state.id}`}
              className="group overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              {state.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={state.image} alt={state.name} className="h-32 w-full object-cover" />
              )}
              <div className="p-4">
                <h3 className="text-base font-bold text-foreground">{state.name}</h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{state.tagline}</p>
                <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-primary">
                  <MapPin size={13} />
                  {regions.map((region) => region.name).join(" · ")}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
