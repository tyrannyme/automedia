import { useEffect, useMemo, useRef, useState } from "react";
import {
  AdjustmentsHorizontalIcon,
  ArrowsRightLeftIcon,
  ArrowTopRightOnSquareIcon,
  ArrowUpTrayIcon,
  BoltIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  CodeBracketIcon,
  Cog6ToothIcon,
  ExclamationTriangleIcon,
  MapPinIcon,
  PhotoIcon,
  PlusIcon,
  TrashIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { AgentAvatar } from "@/components/agent-avatar.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";
import {
  burstSummary,
  feedItems,
  feedPlainText,
  formatClock,
  formatLeft,
  formatShortClock,
  groupBursts,
  type FeedBurst,
  type FeedIcon,
  type FeedItem,
  type FeedJump,
  type FeedLease,
  type FeedText,
} from "@/lib/activity-feed.ts";
import { cn } from "@/lib/utils.ts";
import { useStudioStore } from "@/stores/studio.ts";

export type FeedJumpHandler = (jump: FeedJump) => void;

/* ---------- Lease ---------- */

export type LiveLease = FeedLease & {
  /** Milliseconds left on the claim. */
  left: number;
  /** Share of the claim left, 0 to 1, measured from the last renewal the studio saw. */
  share: number;
};

// When the studio first saw each holder's lease, and each renewal of it. Leases carry
// only `until`, so this is the earliest moment the studio knows the lease was live.
const firstSeen = new Map<string, number>();
const renewalSeen = new Map<string, number>();
/** The engine's shortest lease: a claim made at t is live until at least t + 30 s. */
const minLeaseMs = 30_000;

export function useNow(active: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [active, intervalMs]);
  return now;
}

/** The live claim on a project, ticking every second, or null when nobody holds it. */
export function useLiveLease(compositionId: string | null): LiveLease | null {
  const lease = useStudioStore((state) =>
    compositionId
      ? (state.compositions.find((item) => item.id === compositionId)?.lease ?? null)
      : null,
  );
  const now = useNow(lease !== null);
  if (!compositionId || !lease) return null;
  const until = Date.parse(lease.until);
  const key = `${compositionId}\0${lease.holder}`;
  if (!Number.isFinite(until) || until <= now) {
    firstSeen.delete(key);
    return null;
  }
  let since = firstSeen.get(key);
  if (since === undefined) {
    since = Math.min(now, until - minLeaseMs);
    firstSeen.set(key, since);
  }
  const renewalKey = `${key}\0${lease.until}`;
  let renewedAt = renewalSeen.get(renewalKey);
  if (renewedAt === undefined) {
    renewedAt = Math.min(now, until - minLeaseMs);
    renewalSeen.set(renewalKey, renewedAt);
  }
  const left = until - now;
  const share = Math.min(1, Math.max(0, left / Math.max(left, until - renewedAt)));
  return { holder: lease.holder, since, until, left, share };
}

/** The open project's activity, phrased, newest first, with its bursts. */
export function useFeed(lease: LiveLease | null) {
  const activity = useStudioStore((state) => state.activity);
  const media = useStudioStore((state) => state.media);
  const controls = useStudioStore((state) => state.controls);
  const exports = useStudioStore((state) => state.exports);
  const items = useMemo(
    () => feedItems(activity, { tracks: media.tracks, markers: media.markers, controls, exports }),
    [activity, controls, exports, media.markers, media.tracks],
  );
  const holder = lease?.holder ?? null;
  const since = lease?.since ?? 0;
  const until = lease?.until ?? 0;
  const bursts = useMemo(
    () => groupBursts(items, holder ? { holder, since, until } : null),
    [holder, items, since, until],
  );
  return { items, bursts };
}

/* ---------- Pieces shared by the presence, the panel and the full log ---------- */

/** A disc that empties as the claim runs out. */
export function LeasePie({ share }: { share: number }) {
  const pct = Math.round(share * 100);
  return (
    <span
      aria-hidden="true"
      className="size-3 shrink-0 rounded-full"
      style={{
        background: `conic-gradient(var(--foreground) 0 ${pct}%, var(--secondary) ${pct}% 100%)`,
      }}
    />
  );
}

export function LeaseLeft({ lease, className }: { lease: LiveLease; className?: string }) {
  return (
    <span
      className={cn(
        "flex h-[26px] shrink-0 items-center gap-1.5 rounded-[7px] bg-[var(--feed-chip)] pr-2.5 pl-2 font-mono text-[12px] tracking-normal text-muted-foreground",
        className,
      )}
    >
      <LeasePie share={lease.share} />
      <span className="text-foreground">{formatLeft(lease.left)}</span>
      left
    </span>
  );
}

const feedIcons = {
  code: CodeBracketIcon,
  change: ArrowsRightLeftIcon,
  remove: TrashIcon,
  check: CheckCircleIcon,
  warn: ExclamationTriangleIcon,
  export: ArrowUpTrayIcon,
  media: PhotoIcon,
  marker: MapPinIcon,
  control: AdjustmentsHorizontalIcon,
  settings: Cog6ToothIcon,
  create: PlusIcon,
  cancel: XCircleIcon,
  other: BoltIcon,
} satisfies Record<FeedIcon, typeof CodeBracketIcon>;

export function FeedGlyph({ icon, className }: { icon: FeedIcon; className?: string }) {
  const Icon = feedIcons[icon];
  return <Icon aria-hidden="true" className={cn("size-4 shrink-0", className)} />;
}

export function FeedTextView({ text }: { text: FeedText }) {
  return (
    <>
      {text.map((part, index) => (
        <span key={index} className={part.file ? "font-mono text-[12.5px] tracking-normal" : ""}>
          {part.value}
        </span>
      ))}
    </>
  );
}

export const jumpLabels = {
  code: "Code",
  track: "Clip",
  export: "Show",
} satisfies Record<FeedJump["kind"], string>;

/** One row of the long feed: clock, icon, plain English, and where it leads. */
export function FeedRow({
  item,
  lit = false,
  onJump,
}: {
  item: FeedItem;
  lit?: boolean;
  onJump?: FeedJumpHandler | undefined;
}) {
  const jump = item.jump;
  const content = (
    <>
      <span className="font-mono text-[12px] tracking-normal text-dim">{formatClock(item.at)}</span>
      <FeedGlyph
        icon={item.icon}
        className={cn("size-[15px]", lit ? "text-foreground" : "text-faint")}
      />
      <span className="min-w-0 truncate">
        <FeedTextView text={item.text} />
        {item.detail && <span className="text-dim"> · {item.detail}</span>}
      </span>
      {jump && onJump ? (
        <span
          className={cn(
            "flex items-center gap-0.5 text-[12px] text-dim",
            !lit &&
              "opacity-0 group-hover/feed-row:opacity-100 group-focus-visible/feed-row:opacity-100",
          )}
        >
          {jumpLabels[jump.kind]}
          <ChevronRightIcon className="size-3" />
        </span>
      ) : (
        <span />
      )}
    </>
  );
  const className = cn(
    "group/feed-row mx-1.5 grid h-8 grid-cols-[62px_22px_minmax(0,1fr)_auto] items-center rounded-lg px-2.5 text-left text-[13px]",
    lit && "bg-[var(--feed-chip)]",
  );
  if (jump && onJump) {
    return (
      <button
        type="button"
        className={cn(
          className,
          "w-[calc(100%-12px)] outline-none hover:bg-[var(--feed-chip)] focus-visible:ring-2 focus-visible:ring-ring",
        )}
        title={feedPlainText(item.text)}
        onClick={() => onJump(jump)}
      >
        {content}
      </button>
    );
  }
  return (
    <div className={className} title={feedPlainText(item.text)}>
      {content}
    </div>
  );
}

/** A burst's header: who (only when the lease says so), when, how much. */
export function BurstHeader({
  burst,
  live,
  now,
}: {
  burst: FeedBurst;
  live: boolean;
  now: number;
}) {
  const recent = now - burst.end < 60_000;
  return (
    <div className="flex h-[30px] items-center gap-2 px-4 text-[12px] text-dim">
      {burst.holder ? (
        <>
          <AgentAvatar name={burst.holder} live={live} size={18} ring="var(--avatar-ring)" />
          <span className="text-[13px] font-medium text-foreground">{burst.holder}</span>
          <span>{recent ? "now" : formatShortClock(burst.start)}</span>
        </>
      ) : (
        <span className="text-[13px] font-medium text-muted-foreground">
          {recent ? "Just now" : formatShortClock(burst.start)}
        </span>
      )}
      <span className="flex-1" />
      <span className="font-mono tracking-normal">{burstSummary(burst)}</span>
    </div>
  );
}

const isMac = /Mac/.test(globalThis.navigator?.platform ?? "");
export const activityShortcutLabel = isMac ? "⇧⌘A" : "Ctrl Shift A";

/* ---------- The titlebar presence ---------- */

const shownBursts = 3;
const rowsPerBurst = 6;

/**
 * Who holds the open project and what they did last. Exists only while a lease is live;
 * clicking opens the project's feed, grouped into bursts, with the claim's time left.
 */
export function AgentPresence({
  onOpenLog,
  onJump,
}: {
  onOpenLog: () => void;
  onJump?: FeedJumpHandler | undefined;
}) {
  const compositionId = useStudioStore((state) => state.compositionId);
  const name = useStudioStore((state) => state.composition?.name ?? "this project");
  const lease = useLiveLease(compositionId);
  const { bursts } = useFeed(lease);
  const [open, setOpen] = useState(false);
  const now = lease ? lease.until - lease.left : Date.now();
  useEffect(() => {
    if (!lease) setOpen(false);
  }, [lease]);
  if (!lease) return null;

  const newest = bursts[0];
  const verb =
    newest?.holder === lease.holder && newest.items[0]
      ? newest.items[0].verb
      : "claimed this project";
  const visible = bursts.slice(0, shownBursts);
  const hidden = bursts.slice(shownBursts);
  const hiddenCount = hidden.reduce((sum, burst) => sum + burst.items.length, 0);
  const firstHidden = hidden[0]?.items[0];
  const jump: FeedJumpHandler | undefined = onJump
    ? (target) => {
        setOpen(false);
        onJump(target);
      }
    : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            data-no-drag=""
            aria-label={`${lease.holder} ${verb}. Show activity`}
            className="flex h-[30px] min-w-0 shrink items-center gap-2 rounded-lg pr-2.5 pl-1 text-[13px] outline-none hover:bg-raised focus-visible:ring-2 focus-visible:ring-ring aria-expanded:bg-raised"
          />
        }
      >
        <AgentAvatar name={lease.holder} live ring="var(--avatar-ring)" />
        <span className="shrink-0 text-foreground">{lease.holder}</span>
        <span className="min-w-0 truncate text-muted-foreground">{verb}</span>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-[404px] max-w-[calc(100vw-24px)] gap-0 overflow-hidden rounded-[14px] p-0 pb-1.5"
      >
        <div className="flex items-center gap-2.5 pt-3.5 pr-3.5 pb-3 pl-4">
          <AgentAvatar name={lease.holder} live ring="var(--avatar-ring)" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{lease.holder} is working here</div>
            <div className="mt-px truncate text-[12px] text-dim">
              Holds {name} until {formatShortClock(lease.until)}
            </div>
          </div>
          <LeaseLeft lease={lease} />
        </div>
        <div className="max-h-[min(460px,calc(100vh-180px))] overflow-y-auto">
          {visible.length === 0 && (
            <p className="border-t border-border px-4 py-3 text-[13px] text-muted-foreground">
              Nothing written yet. Changes appear here as they land.
            </p>
          )}
          {visible.map((burst, index) => (
            <div key={burst.end} className="border-t border-border pt-1.5 pb-1">
              <BurstHeader burst={burst} live={index === 0 && burst.holder !== null} now={now} />
              {burst.items.slice(0, rowsPerBurst).map((item, row) => (
                <FeedRow
                  key={`${item.at}-${row}`}
                  item={item}
                  lit={index === 0 && row === 0 && now - item.at < 60_000}
                  onJump={jump}
                />
              ))}
              {burst.items.length > rowsPerBurst && (
                <div className="flex h-7 items-center px-4 text-[12px] text-dim">
                  {burst.items.length - rowsPerBurst} more in this burst
                </div>
              )}
            </div>
          ))}
          {firstHidden && (
            <button
              type="button"
              className="flex h-[34px] w-full items-center gap-2 border-t border-border px-4 text-left text-[13px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => {
                setOpen(false);
                onOpenLog();
              }}
            >
              <ChevronRightIcon className="size-3.5 text-faint" />
              <span>Earlier</span>
              <span className="min-w-0 truncate text-dim">
                · {feedPlainText(firstHidden.text)}
                {hiddenCount > 1 ? `, ${hiddenCount - 1} more` : ""}
              </span>
            </button>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 border-t border-border px-2 pt-1.5">
          <Button
            variant="ghost"
            size="xs"
            className="text-[13px] text-muted-foreground"
            onClick={() => {
              setOpen(false);
              onOpenLog();
            }}
          >
            Full log
            <ArrowTopRightOnSquareIcon />
          </Button>
          <span className="flex-1" />
          <span className="pr-2 font-mono text-[12px] tracking-normal text-dim">
            {activityShortcutLabel}
          </span>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ---------- The stage change chip ---------- */

const chipHoldMs = 2400;

/**
 * A quiet chip over the top of the picture when the lease holder writes a file. It holds for
 * 2.4 s and a second write in that window replaces it. Writes while nobody holds the project,
 * or while you are in a code editor, never raise it: those are yours.
 */
export function AgentChangeChip({ onJump }: { onJump?: FeedJumpHandler | undefined }) {
  const compositionId = useStudioStore((state) => state.compositionId);
  const sourceMode = useStudioStore((state) => state.mode !== "preview");
  const lease = useLiveLease(compositionId);
  const { items } = useFeed(lease);
  const newest = items[0];
  const [shown, setShown] = useState<FeedItem | null>(null);
  const [pinned, setPinned] = useState(false);
  const holder = lease?.holder ?? null;
  const since = lease?.since ?? Number.POSITIVE_INFINITY;

  // Only entries that arrive while the studio watches raise the chip; the log as it
  // stood when the project opened never does.
  const seenAt = useRef<{ id: string | null; at: number }>({ id: null, at: 0 });
  useEffect(() => {
    const newestAt = newest?.at ?? 0;
    if (seenAt.current.id !== compositionId) {
      seenAt.current = { id: compositionId, at: Date.now() };
      return;
    }
    if (!newest || newestAt <= seenAt.current.at) return;
    seenAt.current = { id: compositionId, at: newestAt };
    if (!holder || sourceMode || newest.operation !== "write_file") return;
    if (newestAt < since - minLeaseMs) return;
    setShown(newest);
  }, [compositionId, holder, newest, since, sourceMode]);
  useEffect(() => {
    if (!shown || pinned) return;
    const timer = window.setTimeout(() => setShown(null), chipHoldMs);
    return () => window.clearTimeout(timer);
  }, [pinned, shown]);
  useEffect(() => setShown(null), [compositionId]);

  if (!shown || !holder) return null;
  const jump = shown.jump;
  return (
    <button
      type="button"
      className="agent-change-chip absolute top-[62px] left-1/2 z-30 flex h-8 max-w-[calc(100%-32px)] -translate-x-1/2 items-center gap-2 rounded-[9px] pr-3 pl-1.5 text-[13px] whitespace-nowrap shadow-float outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onMouseEnter={() => setPinned(true)}
      onMouseLeave={() => setPinned(false)}
      onClick={() => {
        setShown(null);
        if (jump) onJump?.(jump);
      }}
    >
      <AgentAvatar name={holder} size={18} className="bg-[#303030] text-[#f5f5f5]" />
      <span>{holder} wrote</span>
      {shown.file && <span className="font-mono text-[12.5px] tracking-normal">{shown.file}</span>}
      {shown.where && <span className="min-w-0 truncate text-[#8a8a8a]">· {shown.where}</span>}
    </button>
  );
}
