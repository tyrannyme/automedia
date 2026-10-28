import { useEffect, useMemo } from "react";
import {
  BurstHeader,
  FeedRow,
  useFeed,
  useLiveLease,
  useNow,
  type FeedJumpHandler,
} from "@/components/agent-presence.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { dayLabel, type FeedBurst } from "@/lib/activity-feed.ts";
import { useStudioStore } from "@/stores/studio.ts";

type ActivityDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onJump?: FeedJumpHandler | undefined;
};

/** Shift+Cmd+A (Shift+Ctrl+A elsewhere) opens the full log from anywhere in the studio. */
function useActivityShortcut(onOpen: () => void) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!event.shiftKey || !(event.metaKey || event.ctrlKey) || event.altKey) return;
      if (event.key.toLowerCase() !== "a") return;
      event.preventDefault();
      onOpen();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onOpen]);
}

/** The project's whole feed: every burst, under its day. */
export function ActivityDialog({ open, onOpenChange, onJump }: ActivityDialogProps) {
  const compositionId = useStudioStore((state) => state.compositionId);
  const name = useStudioStore((state) => state.composition?.name ?? "this project");
  const lease = useLiveLease(compositionId);
  const { bursts } = useFeed(lease);
  const now = useNow(open, 10_000);
  useActivityShortcut(() => {
    if (compositionId) onOpenChange(true);
  });
  useEffect(() => {
    if (open) void useStudioStore.getState().refreshActivity();
  }, [open]);

  const days = useMemo(() => {
    const groups: { label: string; bursts: FeedBurst[] }[] = [];
    for (const burst of bursts) {
      const label = dayLabel(burst.end, now);
      const last = groups.at(-1);
      if (last?.label === label) last.bursts.push(burst);
      else groups.push({ label, bursts: [burst] });
    }
    return groups;
  }, [bursts, now]);
  const jump: FeedJumpHandler | undefined = onJump
    ? (target) => {
        onOpenChange(false);
        onJump(target);
      }
    : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[min(640px,calc(100vh-4rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-[520px]"
        data-activity-dialog=""
      >
        <DialogHeader className="shrink-0 px-6 pt-6 pb-4">
          <DialogTitle>Activity</DialogTitle>
          <DialogDescription>
            Everything written to {name}, newest first. Changes close together are one burst.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="min-h-0 flex-1">
          <div className="pb-3">
            {days.length === 0 && (
              <p className="border-t border-border px-6 py-4 text-[13px] text-muted-foreground">
                Nothing yet. Edits, checks and exports land here as they happen.
              </p>
            )}
            {days.map((day) => (
              <div key={day.label}>
                <div className="sticky top-0 z-10 border-t border-border bg-popover px-4 pt-3 pb-1 text-[12px] font-medium text-dim">
                  {day.label}
                </div>
                {day.bursts.map((burst, index) => (
                  <div
                    key={burst.end}
                    className={index > 0 ? "border-t border-border pt-1.5 pb-1" : "pb-1"}
                  >
                    <BurstHeader
                      burst={burst}
                      live={burst === bursts[0] && burst.holder !== null}
                      now={now}
                    />
                    {burst.items.map((item, row) => (
                      <FeedRow key={`${item.at}-${row}`} item={item} onJump={jump} />
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
