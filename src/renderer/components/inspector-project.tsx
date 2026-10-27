import {
  AdjustmentsHorizontalIcon,
  ChevronRightIcon,
  FilmIcon,
  FolderOpenIcon,
  MusicalNoteIcon,
  PhotoIcon,
  PlayCircleIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import type { ExportJob } from "../../engine/export.ts";
import type { ExportFile } from "@shared/ipc.ts";
import { isAudioExportFormat, isVideoExportFormat } from "@shared/media.ts";
import {
  FeedGlyph,
  FeedTextView,
  LeasePie,
  type FeedJumpHandler,
  type LiveLease,
} from "@/components/agent-presence.tsx";
import { AgentAvatar } from "@/components/agent-avatar.tsx";
import { PanelSection } from "@/components/inspector-parts.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.tsx";
import { Progress } from "@/components/ui/progress.tsx";
import {
  feedPlainText,
  formatAge,
  formatAgo,
  formatLeft,
  formatShortClock,
  type FeedBurst,
  type FeedItem,
} from "@/lib/activity-feed.ts";
import { exportFormatLabel } from "@/lib/export-format.ts";
import { exportPhaseLabel, exportProgressPercent } from "@/lib/export-progress.ts";
import { formatBytes } from "@/lib/library.ts";
import { cn } from "@/lib/utils.ts";

const summaryRows = 3;

function ActivityRow({
  item,
  now,
  onJump,
}: {
  item: FeedItem;
  now: number;
  onJump?: FeedJumpHandler | undefined;
}) {
  const jump = item.jump;
  const content = (
    <>
      <span className="grid w-[22px] shrink-0 place-items-center text-dim">
        <FeedGlyph icon={item.icon} />
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px]">
        <FeedTextView text={item.text} />
      </span>
      <span className="shrink-0 font-mono text-[12px] tracking-normal text-dim">
        {formatAge(now - item.at)}
      </span>
    </>
  );
  const className = "-mx-2 flex h-9 items-center gap-3 rounded-lg px-2 text-left";
  if (jump && onJump) {
    return (
      <button
        type="button"
        title={feedPlainText(item.text)}
        className={cn(
          className,
          "w-[calc(100%+16px)] outline-none hover:bg-raised focus-visible:ring-2 focus-visible:ring-ring",
        )}
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

/** What just happened to the project, three rows deep, and the way into the full log. */
export function ActivitySection({
  items,
  bursts,
  lease,
  now,
  onOpenLog,
  onJump,
}: {
  items: FeedItem[];
  bursts: FeedBurst[];
  lease: LiveLease | null;
  now: number;
  onOpenLog: () => void;
  onJump?: FeedJumpHandler | undefined;
}) {
  const current = bursts[0];
  const working = lease !== null && current?.holder === lease.holder;
  const title = working ? (
    <>
      <AgentAvatar name={lease.holder} live ring="var(--avatar-ring)" />
      {lease.holder}
      <span className="font-normal text-dim">· working now</span>
    </>
  ) : (
    "Activity"
  );
  return (
    <PanelSection
      title={title}
      count={items.length > 0 ? (working ? current.items.length : items.length) : undefined}
    >
      {items.length === 0 ? (
        <p className="text-[13px] leading-[1.45] text-dim">
          Nothing yet. Edits, checks and exports land here as they happen.
        </p>
      ) : (
        <>
          <div className="grid">
            {items.slice(0, summaryRows).map((item, index) => (
              <ActivityRow key={`${item.at}-${index}`} item={item} now={now} onJump={onJump} />
            ))}
          </div>
          <Button
            variant="ghost"
            size="xs"
            className="mt-1 -ml-2 text-[13px] font-normal text-muted-foreground"
            onClick={onOpenLog}
          >
            All activity
            <ChevronRightIcon />
          </Button>
        </>
      )}
    </PanelSection>
  );
}

function ClaimRule({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof PlayCircleIcon;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[28px_1fr] gap-3 py-2 text-[13px] leading-[1.45]">
      <span className="grid size-7 place-items-center rounded-[7px] bg-raised text-muted-foreground">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <div className="font-medium">{title}</div>
        <div className="text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

/**
 * Who holds the project and what that does and does not stop. The engine never checks a
 * lease on a write, so the note says so instead of pretending the project is locked.
 */
export function ClaimNote({ lease }: { lease: LiveLease }) {
  return (
    <Collapsible className="min-w-0">
      <CollapsibleTrigger
        aria-label={`Held by ${lease.holder}. What a claim does and does not stop`}
        className="group/claim flex h-[52px] w-full items-center gap-2.5 rounded-xl bg-raised pr-3 pl-2.5 text-left outline-none [--avatar-ring:var(--raised)] hover:bg-secondary hover:[--avatar-ring:var(--secondary)] focus-visible:ring-2 focus-visible:ring-ring"
      >
        <AgentAvatar name={lease.holder} live ring="var(--avatar-ring)" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium">Held by {lease.holder}</div>
          <div className="flex items-center gap-1.5 font-mono text-[12px] tracking-normal text-dim">
            <LeasePie share={lease.share} />
            <span>
              <span className="text-foreground">{formatLeft(lease.left)}</span> left · until{" "}
              {formatShortClock(lease.until)}
            </span>
          </div>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">
        <ClaimRule icon={PlayCircleIcon} title="Play, scrub, export">
          Always yours. Nothing waits for the agent.
        </ClaimRule>
        <ClaimRule icon={AdjustmentsHorizontalIcon} title="Clips, controls, settings">
          You can change them too. The last change wins.
        </ClaimRule>
        <ClaimRule icon={ShieldCheckIcon} title="Code">
          Saves are checked against the file on disk, so neither of you overwrites the other.
        </ClaimRule>
      </CollapsibleContent>
    </Collapsible>
  );
}

function exportIcon(format: ExportFile["format"]) {
  if (isVideoExportFormat(format)) return FilmIcon;
  if (isAudioExportFormat(format)) return MusicalNoteIcon;
  return PhotoIcon;
}

function ReceiptIcon({ format }: { format: ExportFile["format"] }) {
  const Icon = exportIcon(format);
  return (
    <span className="grid size-7 shrink-0 place-items-center rounded-[7px] bg-raised text-muted-foreground">
      <Icon className="size-4" />
    </span>
  );
}

/** Finished exports as receipts, and the running job while there is one. */
export function ExportsSection({
  exports,
  activeExport,
  now,
  onReveal,
}: {
  exports: ExportFile[];
  activeExport: ExportJob | null;
  now: number;
  onReveal: () => void;
}) {
  const count = exports.length + (activeExport ? 1 : 0);
  return (
    <PanelSection title="Exports" count={count}>
      {count === 0 && (
        <p className="text-[13px] leading-[1.45] text-dim">
          Nothing exported yet. Finished files are kept here.
        </p>
      )}
      {activeExport && (
        <div className="-mx-2 flex h-11 items-center gap-2.5 px-2">
          <ReceiptIcon format={activeExport.format} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[13px] font-medium">
                {exportPhaseLabel(activeExport.phase)}
              </span>
              <span className="shrink-0 font-mono text-[12px] tracking-normal text-dim">
                {exportFormatLabel(activeExport.format)} · {exportProgressPercent(activeExport)}%
              </span>
            </div>
            <Progress
              value={exportProgressPercent(activeExport)}
              className="mt-1.5 gap-0"
              aria-label="Export progress"
            />
          </div>
        </div>
      )}
      {exports.map((file) => (
        <button
          type="button"
          key={file.fileName}
          className="group/receipt -mx-2 flex h-11 w-[calc(100%+16px)] items-center gap-2.5 rounded-[10px] px-2 text-left outline-none hover:bg-raised focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`${file.fileName}. Show in folder`}
          onClick={onReveal}
        >
          <ReceiptIcon format={file.format} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium">{file.fileName}</div>
            <div className="font-mono text-[12px] leading-[1.3] tracking-normal text-dim">
              {exportFormatLabel(file.format)} · {formatBytes(file.bytes)} ·{" "}
              {formatAgo(now - file.mtimeMs)}
            </div>
          </div>
          <span className="grid size-7 shrink-0 place-items-center rounded-[7px] text-muted-foreground opacity-0 group-hover/receipt:opacity-100 group-focus-visible/receipt:opacity-100">
            <FolderOpenIcon className="size-4" />
          </span>
        </button>
      ))}
    </PanelSection>
  );
}
