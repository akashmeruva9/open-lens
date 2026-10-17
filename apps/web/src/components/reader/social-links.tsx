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
            <a href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[13px] font-semibold leading-6 text-ink-2 hover:text-ink">
              {l.platform} · {l.language} <span className="font-normal text-ink-3">{l.handle}</span> <IconArrowUpRight size={12} />
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
