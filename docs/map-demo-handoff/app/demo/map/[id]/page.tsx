import { notFound } from "next/navigation";
import { PlaceDetail } from "@/components/demo-map/place-detail";
import { getPlace } from "@/lib/demo-map/data";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function DemoPlacePage({ params }: Props) {
  const { id } = await params;
  const place = getPlace(id);
  if (!place) notFound();
  return <PlaceDetail place={place} />;
}
