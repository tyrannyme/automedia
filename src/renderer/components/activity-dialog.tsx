import { useEffect, useRef } from "react";
import type { ActivityEntry } from "../../main/activity.ts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";

type ActivityDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activity: ActivityEntry[];
  onRefresh: () => Promise<void>;
};

export function ActivityDialog({ open, onOpenChange, activity, onRefresh }: ActivityDialogProps) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    void onRefresh();
  }, [onRefresh, open]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [activity, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-activity-dialog="">
        <DialogHeader>
          <DialogTitle>Activity</DialogTitle>
          <DialogDescription>
            Recent authoring and export events for this project.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-72">
          <div className="space-y-3 pr-2">
            {activity.length === 0 && (
              <p className="text-sm text-muted-foreground">No activity yet.</p>
            )}
            {activity.map((entry, index) => (
              <div key={`${entry.at}-${index}`} className="font-mono text-xs">
                <div>
                  {entry.at} · {entry.operation}
                </div>
                <pre className="mt-1 whitespace-pre-wrap text-muted-foreground">
                  {JSON.stringify(entry.detail ?? {}, null, 2)}
                </pre>
              </div>
            ))}
            <div ref={end} />
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
