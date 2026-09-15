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

const icons: Record<string, LucideIcon> = {
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

const legacyIcons: Record<string, LucideIcon> = {
  '✦': Sparkles,
  '◌': Bath,
  '☼': Sun,
  '〰': Waves,
  '◐': Palette,
  '⌑': Baby,
  '◉': Lightbulb,
  '⌂': House,
  '◇': Gift,
};

export function CategoryIcon({ name }: { name: string }) {
  const Icon = icons[name] ?? legacyIcons[name] ?? Sparkles;
  return <Icon aria-hidden="true" strokeWidth={1.5} />;
}