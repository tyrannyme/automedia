import { UserIcon } from "@heroicons/react/24/solid";
import { initialOf } from "@/lib/home.ts";
import { cn } from "@/lib/utils.ts";

/**
 * A round initial for whoever holds a project. `you` inverts it for the person at
 * the keyboard; `live` adds the dot that says a claim is held right now.
 */
export function AgentAvatar({
  name,
  you = false,
  live = false,
  size = 22,
  ring = "var(--background)",
  className,
}: {
  name: string;
  you?: boolean;
  live?: boolean;
  size?: number;
  /** The colour behind the avatar, so the live dot is cut out of it. */
  ring?: string;
  className?: string;
}) {
  const dot = Math.max(7, Math.round(size * 0.42));
  return (
    <span
      className={cn(
        "relative inline-grid shrink-0 place-items-center rounded-full leading-none font-medium tracking-normal",
        you
          ? "bg-foreground text-background"
          : "bg-[color-mix(in_srgb,var(--foreground)_18%,var(--background))] text-foreground",
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size / 2) }}
      aria-hidden="true"
    >
      {you ? <UserIcon style={{ width: size * 0.58, height: size * 0.58 }} /> : initialOf(name)}
      {live && (
        <span
          className="absolute rounded-full bg-foreground"
          style={{ width: dot, height: dot, right: -2, bottom: -2, boxShadow: `0 0 0 2px ${ring}` }}
        />
      )}
    </span>
  );
}
