import {
  Bath,
  Coffee,
  Compass,
  Landmark,
  Mountain,
  Palmtree,
  ShoppingBag,
  Utensils,
  type LucideProps,
} from "lucide-react";

const CATEGORY_ICONS = {
  "Food & Dining": Utensils,
  "Island & Beach": Palmtree,
  "Heritage & Culture": Landmark,
  "Nature & Hiking": Mountain,
  "Shopping & Retail": ShoppingBag,
  "Wellness & Spa": Bath,
  "Nature & Leisure": Coffee,
} as const;

type CategoryName = keyof typeof CATEGORY_ICONS;

export function CategoryIcon({ category, ...props }: { category: string } & LucideProps) {
  const Icon = CATEGORY_ICONS[category as CategoryName] ?? Compass;
  return <Icon aria-hidden="true" {...props} />;
}
