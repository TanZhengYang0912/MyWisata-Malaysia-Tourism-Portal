import crypto from "node:crypto";

export const LEGACY_SAMPLE_PREFIX = "Sample local tip for ";

const DAY_MS = 24 * 60 * 60 * 1000;
const SCENARIO_COUNT = 3;

export function stableUuid(value) {
  const hex = crypto.createHash("md5").update(value).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function placeArea(place) {
  return place.district?.trim() || place.state.trim();
}

function buildCopy(place, scenarioIndex) {
  const area = placeArea(place);
  const state = place.state.trim();
  const name = place.name.trim();

  if (place.level === "state") {
    return [
      `A relaxed first day in ${name} starts with choosing one neighbourhood as your base. Keep the morning flexible and check opening hours before heading out.`,
      `For ${name}, leave a little buffer between stops; traffic and short food breaks are part of the day, especially around ${area}.`,
      `A practical tip for ${name}: carry water, save offline directions, and plan one indoor stop in case the afternoon weather turns.`,
    ][scenarioIndex];
  }

  if (place.level === "region") {
    return [
      `The quieter way to see ${name} is to arrive before the busiest hour and give yourself time to explore ${area} on foot.`,
      `If ${name} is one stop in a ${state} day, pair it with a nearby meal rather than crossing the state between visits.`,
      `Bring comfortable shoes to ${name}; the best parts are often reached after a short walk from the main drop-off.`,
    ][scenarioIndex];
  }

  return [
    `Morning light makes ${name} easier to enjoy, and ${area} is a convenient place to pause before the next stop.`,
    `Give ${name} more time than a quick photo stop; a slower loop through ${area} makes the visit feel less rushed.`,
    `For ${name}, check the weather and wear shoes with grip. The route around ${area} can be more comfortable at an easy pace.`,
  ][scenarioIndex];
}

function dateFrom(now, placeIndex, scenarioIndex) {
  const daysAgo = 4 + ((placeIndex * 5 + scenarioIndex * 7) % 45);
  const date = new Date(now.getTime() - daysAgo * DAY_MS);
  date.setUTCHours(2 + ((placeIndex + scenarioIndex) % 10), 15, 0, 0);
  return date.toISOString();
}

function commentRow(place, customer, placeIndex, scenarioIndex, id = stableUuid(`place-community:${place.id}:${scenarioIndex}`), createdAt = dateFrom(new Date(), placeIndex, scenarioIndex)) {
  return {
    id,
    place_id: place.id,
    user_id: customer.id,
    body: buildCopy(place, scenarioIndex),
    status: "published",
    is_anonymous: scenarioIndex === 2,
    created_at: createdAt,
  };
}

function customerFor(customers, placeIndex, scenarioIndex) {
  return customers[(placeIndex + scenarioIndex) % customers.length];
}

export function buildPlaceCommunityDemoPlan({ places, customers, existingComments = [], now = new Date() }) {
  const activePlaces = places.filter((place) => place.status === undefined || place.status === "active");
  if (customers.length < SCENARIO_COUNT) {
    throw new Error(`At least ${SCENARIO_COUNT} established demo customers are required.`);
  }

  const updates = [];
  const inserts = [];

  activePlaces.forEach((place, placeIndex) => {
    const firstBody = buildCopy(place, 0);
    const legacy = existingComments.find(
      (comment) => comment.place_id === place.id && comment.body.startsWith(LEGACY_SAMPLE_PREFIX),
    );
    const alreadyNatural = existingComments.some(
      (comment) => comment.place_id === place.id && comment.body === firstBody,
    );

    if (legacy) {
      updates.push(commentRow(
        place,
        customerFor(customers, placeIndex, 0),
        placeIndex,
        0,
        legacy.id,
        legacy.created_at,
      ));
    } else if (!alreadyNatural) {
      inserts.push(commentRow(place, customerFor(customers, placeIndex, 0), placeIndex, 0, undefined, dateFrom(now, placeIndex, 0)));
    }

    for (const scenarioIndex of [1, 2]) {
      inserts.push(commentRow(
        place,
        customerFor(customers, placeIndex, scenarioIndex),
        placeIndex,
        scenarioIndex,
        stableUuid(`place-community:${place.id}:${scenarioIndex}`),
        dateFrom(now, placeIndex, scenarioIndex),
      ));
    }
  });

  return {
    updates,
    inserts,
    stats: {
      places: activePlaces.length,
      updates: updates.length,
      inserts: inserts.length,
      seededNotes: updates.length + inserts.length,
    },
  };
}
