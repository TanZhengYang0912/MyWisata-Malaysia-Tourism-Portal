import crypto from "node:crypto";

const REVIEW_RATINGS = [5, 4, 5, 3, 4, 5, 4, 5, 4, 5, 3, 5];
const VISIT_CONTEXTS = [
  "It fitted neatly into our afternoon plans",
  "We visited as part of a relaxed weekend itinerary",
  "It was an easy stop to add between two nearby sights",
  "Our small group found it comfortable and unhurried",
  "It gave us a pleasant change of pace during the trip",
  "We would recommend it for a first visit to the area",
  "The timing worked well for our family day out",
  "It was a welcome highlight before we headed home",
  "We appreciated having clear details before arriving",
  "The visit felt personal even though we had booked ahead",
  "It was exactly the kind of local stop we were looking for",
  "We left with a good memory of the neighbourhood",
];

const REVIEW_PROFILES = Object.freeze({
  food: [
    {
      title: "A flavourful stop",
      body: ({ productName, outletName }) => `${productName} was an easy pick at ${outletName}; the flavours were balanced and the portion suited a relaxed stop.`,
    },
    {
      title: "Good local flavours",
      body: ({ productName, outletName }) => `We tried ${productName} at ${outletName} between sightseeing stops and enjoyed the familiar local flavours without a long wait.`,
    },
    {
      title: "A handy taste of the city",
      body: ({ productName, outletName }) => `${outletName} made ${productName} a convenient way to sample something regional during our day out.`,
    },
    {
      title: "Fresh and satisfying",
      body: ({ productName, outletName }) => `The ${productName} at ${outletName} arrived fresh, tasted homemade, and was filling enough to share.`,
    },
    {
      title: "Worth a second visit",
      body: ({ productName, outletName }) => `We picked up ${productName} from ${outletName} before heading home and would happily make the same stop again.`,
    },
    {
      title: "A relaxed meal break",
      body: ({ productName, outletName }) => `${productName} gave us a pleasant break at ${outletName}; service was friendly and the flavours had plenty of character.`,
    },
  ],
  activity: [
    {
      title: "A well-paced outing",
      body: ({ productName, outletName }) => `${productName} at ${outletName} had a comfortable pace, with enough time to ask questions and take photos.`,
    },
    {
      title: "The guide made it easy",
      body: ({ productName, outletName }) => `Our guide for ${productName} at ${outletName} was welcoming and shared useful context without making the visit feel rushed.`,
    },
    {
      title: "Easy to fit into our day",
      body: ({ productName, outletName }) => `${productName} was straightforward to join at ${outletName}; the meeting point and instructions were clear.`,
    },
    {
      title: "A memorable local view",
      body: ({ productName, outletName }) => `The ${productName} route from ${outletName} showed us a side of the area we would have missed on our own.`,
    },
    {
      title: "Friendly and informative",
      body: ({ productName, outletName }) => `We left ${productName} at ${outletName} with a better feel for the place, thanks to the friendly and informative host.`,
    },
    {
      title: "Smooth from start to finish",
      body: ({ productName, outletName }) => `The check-in for ${productName} at ${outletName} was smooth, and the experience delivered what the listing promised.`,
    },
  ],
  retail: [
    {
      title: "A thoughtful find",
      body: ({ productName, outletName }) => `${productName} at ${outletName} felt thoughtfully selected, with staff who were happy to explain the options.`,
    },
    {
      title: "Easy gifts to take home",
      body: ({ productName, outletName }) => `We found ${productName} at ${outletName} easy to pack and a lovely reminder of the trip.`,
    },
    {
      title: "Helpful recommendations",
      body: ({ productName, outletName }) => `The team at ${outletName} helped us choose ${productName} without any pressure, which made browsing enjoyable.`,
    },
    {
      title: "A nice break from sightseeing",
      body: ({ productName, outletName }) => `Shopping for ${productName} at ${outletName} was a calm break in the middle of a busy afternoon.`,
    },
    {
      title: "Good quality and presentation",
      body: ({ productName, outletName }) => `${productName} was nicely presented at ${outletName}, and the quality matched what we hoped to bring home.`,
    },
    {
      title: "A local purchase we enjoyed",
      body: ({ productName, outletName }) => `Our visit to ${outletName} for ${productName} felt personal and gave us a better sense of the local craft.`,
    },
  ],
  accommodation: [
    {
      title: "A comfortable base",
      body: ({ productName, outletName }) => `${productName} at ${outletName} gave us a comfortable base and made the rest of the itinerary easy to enjoy.`,
    },
    {
      title: "Warm welcome",
      body: ({ productName, outletName }) => `We received a warm welcome at ${outletName}; ${productName} was clean, calm, and well looked after.`,
    },
    {
      title: "Convenient for exploring",
      body: ({ productName, outletName }) => `${productName} was a convenient choice at ${outletName}, especially for fitting nearby sights into our plans.`,
    },
    {
      title: "Peaceful after a full day",
      body: ({ productName, outletName }) => `After a full day out, ${productName} at ${outletName} was a peaceful place to slow down and recharge.`,
    },
    {
      title: "Details were well considered",
      body: ({ productName, outletName }) => `The small details at ${outletName} made our stay with ${productName} feel considered rather than generic.`,
    },
    {
      title: "A reliable stay",
      body: ({ productName, outletName }) => `${productName} at ${outletName} was a reliable choice with clear arrival information and a comfortable atmosphere.`,
    },
  ],
  generic: [
    {
      title: "A pleasant local experience",
      body: ({ productName, outletName }) => `${productName} at ${outletName} was a pleasant way to spend part of our trip, with helpful service throughout.`,
    },
    {
      title: "Worth adding to the plan",
      body: ({ productName, outletName }) => `We were glad to add ${productName} at ${outletName} to our itinerary; everything felt clear and welcoming.`,
    },
    {
      title: "Simple and enjoyable",
      body: ({ productName, outletName }) => `${productName} at ${outletName} was simple to arrange and enjoyable once we arrived.`,
    },
    {
      title: "A good first visit",
      body: ({ productName, outletName }) => `Our first visit for ${productName} at ${outletName} went smoothly and gave us a good reason to return.`,
    },
    {
      title: "Friendly local service",
      body: ({ productName, outletName }) => `The local team at ${outletName} made ${productName} feel personal and easy to enjoy.`,
    },
    {
      title: "A useful travel highlight",
      body: ({ productName, outletName }) => `${productName} at ${outletName} fitted neatly into our plans and was one of the more enjoyable stops that day.`,
    },
  ],
});

function digestNumber(value) {
  return Number.parseInt(crypto.createHash("sha1").update(String(value)).digest("hex").slice(0, 8), 16);
}

function productType(product) {
  const value = String(product?.product_type ?? product?.type ?? "").toLowerCase();
  if (value.includes("food") || value.includes("dining") || value.includes("restaurant")) return "food";
  if (value.includes("retail") || value.includes("shop")) return "retail";
  if (value.includes("accommodation") || value.includes("hotel") || value.includes("stay")) return "accommodation";
  if (value.includes("activity") || value.includes("experience") || value.includes("tour")) return "activity";
  return "generic";
}

function token(value, length = 10) {
  return crypto.createHash("sha1").update(String(value)).digest("hex").slice(0, length).toUpperCase();
}

export function buildDemoReviewCopy({ product, outlet, reviewIndex = 0, scenarioKey = "" } = {}) {
  const productName = String(product?.name ?? "this experience");
  const outletName = String(outlet?.name ?? "the outlet");
  const profiles = REVIEW_PROFILES[productType(product)];
  const contextKey = `${product?.id ?? productName}:${outlet?.id ?? outletName}:${scenarioKey}`;
  const offset = digestNumber(contextKey) % profiles.length;
  const profile = profiles[(offset + Number(reviewIndex)) % profiles.length];
  const rating = REVIEW_RATINGS[(digestNumber(`${contextKey}:rating`) + Number(reviewIndex)) % REVIEW_RATINGS.length];
  const visitContext = VISIT_CONTEXTS[Math.abs(Number(reviewIndex)) % VISIT_CONTEXTS.length];

  return {
    rating,
    title: profile.title,
    body: `${profile.body({ productName, outletName })} ${visitContext}.`,
  };
}

export function buildDemoReviewRefreshRows({
  existingReviews = [],
  products = [],
  outlets = [],
  canonicalOrderItemIds = [],
  approvedVendorIds = [],
  customerIds = [],
} = {}) {
  const canonicalItems = new Set(canonicalOrderItemIds);
  const approvedVendors = new Set(approvedVendorIds);
  const demoCustomers = new Set(customerIds);
  const productsById = new Map(products.map((product) => [product.id, product]));
  const outletsById = new Map(outlets.map((outlet) => [outlet.id, outlet]));

  return existingReviews
    .filter((review) => (
      demoCustomers.has(review.user_id)
      && approvedVendors.has(review.vendor_id)
      && !canonicalItems.has(review.order_item_id)
    ))
    .sort((left, right) => (
      String(left.created_at ?? "").localeCompare(String(right.created_at ?? ""))
      || String(left.id).localeCompare(String(right.id))
    ))
    .map((review, index) => {
      const product = productsById.get(review.product_id);
      const outlet = outletsById.get(review.outlet_id);
      const copy = buildDemoReviewCopy({
        product,
        outlet,
        reviewIndex: index,
        scenarioKey: `legacy-refresh:${review.vendor_id}`,
      });
      return { ...review, ...copy };
    });
}

export function buildDemoOrderNote({ product, outlet, scenarioKey = "" } = {}) {
  const productName = String(product?.name ?? "the experience");
  const outletName = String(outlet?.name ?? "the outlet");
  const notes = {
    upcoming: `Planning ${productName} at ${outletName}.`,
    completed: `Completed ${productName} at ${outletName}.`,
    "recent-completed": `Enjoyed ${productName} during a recent visit to ${outletName}.`,
    "month-paid": `Visit arranged for ${productName} at ${outletName}.`,
    "month-completed": `Trip stop completed at ${outletName} for ${productName}.`,
    "month-cancelled": `Reservation for ${productName} at ${outletName} was cancelled before the visit.`,
    "previous-completed-a": `Earlier itinerary included ${productName} at ${outletName}.`,
    "previous-completed-b": `Previous visit recorded for ${productName} at ${outletName}.`,
    "annual-completed-a": `Travel plan included ${productName} at ${outletName}.`,
    "annual-completed-b": `Completed travel visit for ${productName} at ${outletName}.`,
    "annual-completed-c": `Returned to ${outletName} for ${productName}.`,
    "annual-completed-d": `Past itinerary stop: ${productName} at ${outletName}.`,
  };
  return notes[scenarioKey] ?? `Booked ${productName} at ${outletName}.`;
}

export function buildDemoVoucherCopy(vendorKey) {
  return {
    code: `EXPLORE-${token(`voucher:${vendorKey}`, 8)}`,
    name: "Local explorer welcome offer",
  };
}

export function buildDemoBookingReference(orderItemId) {
  return `MW-${token(`booking:${orderItemId}`, 12)}`;
}
