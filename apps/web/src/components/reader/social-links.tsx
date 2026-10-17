import { socialLinks } from "@openlens/config";
import { IconArrowUpRight } from "@/components/ui/icons";

/** Where to follow OpenLens: every YouTube, Instagram and Facebook account that exists (the list lives in packages/config). */
export function SocialLinks({ heading = true, className = "" }: { heading?: boolean; className?: string }) {
  const links = socialLinks();
  if (!links.length) return null;
  return (
    <nav aria-label="Follow OpenLens" className={className}>
      {heading ? <p className="eyebrow mb-1.5">Follow OpenLens</p> : null}
      <ul className="grid gap-1">
        {links.map((l) => (
          <li key={l.url}>
            <a href={l.url} target="_blank" rel="noopener noreferrer" className="group block py-0.5 text-[13px] font-semibold leading-5 text-ink-2 hover:text-ink">
              <span className="inline-flex items-center gap-1">{l.platform} · {l.language} <IconArrowUpRight size={12} /></span>
              <span className="block text-xs font-normal leading-4 text-ink-3 group-hover:text-ink-2">{l.handle}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
