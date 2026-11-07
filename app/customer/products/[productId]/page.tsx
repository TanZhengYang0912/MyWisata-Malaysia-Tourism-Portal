import ActivityDetailPage, { generateMetadata as activityMetadata } from "../../activity/[id]/page";

type Props = { params: Promise<{ productId: string }>; searchParams?: Promise<{ outletId?: string; source?: string; returnTo?: string }> };
function adapt(props: Props) { return { ...props, params: props.params.then(({ productId }) => ({ id: productId })) }; }
export function generateMetadata(props: Props) { return activityMetadata(adapt(props)); }
export default function ProductPage(props: Props) { return ActivityDetailPage(adapt(props)); }
