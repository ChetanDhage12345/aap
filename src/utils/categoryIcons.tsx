import {
  Briefcase,
  Car,
  Cigarette,
  Coffee,
  Droplets,
  Dumbbell,
  Fuel,
  Gift,
  GraduationCap,
  HeartPulse,
  Home,
  Milk,
  Music,
  Package,
  Plane,
  Shield,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Tag,
  Utensils,
  Wifi,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';

export const CATEGORY_ICON_MAP: Record<string, LucideIcon> = {
  ShoppingCart,
  Milk,
  Fuel,
  Zap,
  Droplets,
  Smartphone,
  Wifi,
  Home,
  HeartPulse,
  GraduationCap,
  ShoppingBag,
  Plane,
  Utensils,
  Cigarette,
  Package,
  Tag,
  Car,
  Coffee,
  Briefcase,
  Gift,
  Shield,
  Music,
  Dumbbell,
  Wrench,
};

export const SELECTABLE_CATEGORY_ICONS = Object.keys(CATEGORY_ICON_MAP);

export const SELECTABLE_CATEGORY_COLORS = [
  '#0D9488',
  '#0284C7',
  '#D97706',
  '#CA8A04',
  '#0EA5E9',
  '#6366F1',
  '#4F46E5',
  '#7C3AED',
  '#DC2626',
  '#2563EB',
  '#DB2777',
  '#059669',
  '#EA580C',
  '#64748B',
  '#0F766E',
  '#B45309',
];

export function CategoryIcon({
  name,
  className = 'w-4 h-4',
}: {
  name: string;
  className?: string;
}) {
  const Icon = CATEGORY_ICON_MAP[name] || Tag;
  return <Icon className={className} aria-hidden="true" />;
}
