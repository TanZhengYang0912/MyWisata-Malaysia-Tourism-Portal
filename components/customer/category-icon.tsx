import { BedDouble, Compass, Gem, ShoppingBag, Utensils, type LucideProps } from "lucide-react";

const CATEGORY_ICONS = {
  food: Utensils,
  activity: Compass,
  accommodation: BedDouble,
  retail: ShoppingBag,
  hidden_gem: Gem,
} as const;

export function CategoryIcon({ category, ...props }: { category: string } & LucideProps) {
  const Icon = CATEGORY_ICONS[category as keyof typeof CATEGORY_ICONS] ?? Compass;
  return <Icon aria-hidden="true" {...props} />;
}
