import {
  Baby,
  Bath,
  Gift,
  House,
  Lightbulb,
  Palette,
  Sparkles,
  Sun,
  Waves,
  type LucideIcon,
} from 'lucide-react';
import type { CategoryIconName } from '@/lib/category-icons';

const icons: Record<CategoryIconName, LucideIcon> = {
  baby: Baby,
  bath: Bath,
  gift: Gift,
  house: House,
  lightbulb: Lightbulb,
  palette: Palette,
  sparkles: Sparkles,
  sun: Sun,
  waves: Waves,
};

export function CategoryIcon({ name }: { name: string }) {
  const Icon = icons[name as CategoryIconName] ?? Sparkles;
  return <Icon aria-hidden="true" strokeWidth={1.5} />;
}
