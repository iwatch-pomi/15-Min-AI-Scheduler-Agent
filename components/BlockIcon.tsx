import type { IconKind } from "@/lib/ui";
import { BookIcon, CalendarIcon, CoffeeIcon, DumbbellIcon, FlaskIcon, LaptopIcon, LeafIcon, UsersIcon, UtensilsIcon } from "./icons";

const ICONS: Record<IconKind, typeof CalendarIcon> = {
  meal: UtensilsIcon,
  coffee: CoffeeIcon,
  study: BookIcon,
  meeting: UsersIcon,
  lab: FlaskIcon,
  work: LaptopIcon,
  gym: DumbbellIcon,
  ai: LeafIcon,
  event: CalendarIcon,
};

export default function BlockIcon({ kind, className }: { kind: IconKind; className?: string }) {
  const Icon = ICONS[kind];
  return <Icon className={className} />;
}
