import {
  IconClimate, IconEconomy, IconHealth, IconPolitics, IconSociety, IconSport, IconTech, IconTop, IconWire,
} from "@/components/ui/icons";

const ICONS = {
  top: IconTop, politics: IconPolitics, economy: IconEconomy, climate: IconClimate, tech: IconTech,
  health: IconHealth, society: IconSociety, sport: IconSport, wire: IconWire,
} as const;

export function CategoryIcon({ slug, size = 20 }: { slug: string; size?: number }) {
  const I = ICONS[slug as keyof typeof ICONS] ?? IconTop;
  return <I size={size} />;
}

/** Nav items: Top (home), the topic categories, and the Wire (everything newest-first). */
export const NAV_ITEMS: { slug: string; label: string; href: string }[] = [
  { slug: "top", label: "Top", href: "/" },
  { slug: "politics", label: "Politics", href: "/browse/politics" },
  { slug: "economy", label: "Economy", href: "/browse/economy" },
  { slug: "climate", label: "Climate & Disasters", href: "/browse/climate" },
  { slug: "tech", label: "Tech", href: "/browse/tech" },
  { slug: "health", label: "Health", href: "/browse/health" },
  { slug: "society", label: "Society", href: "/browse/society" },
  { slug: "sport", label: "Sport", href: "/browse/sport" },
  { slug: "wire", label: "Wire", href: "/browse/wire" },
];
