import { useEffect, useId, useState } from "react";
import { Input } from "@/components/ui/input.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { cn } from "@/lib/utils.ts";

/** A panel section: a 13px title with an optional count or action on the right. */
export function PanelSection({
  title,
  count,
  action,
  children,
  className,
}: {
  title: React.ReactNode;
  count?: number | string | undefined;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("min-w-0", className)}>
      <h3 className="mb-2 flex h-6 items-center justify-between gap-2 text-[13px] font-medium text-foreground">
        <span className="flex min-w-0 items-center gap-2">{title}</span>
        {action ??
          (count !== undefined && (
            <span className="font-mono text-[12px] font-normal tracking-normal text-dim">
              {count}
            </span>
          ))}
      </h3>
      {children}
    </section>
  );
}

/** The panel's head: 56px, a 15px title, and its tools on the right. */
export function PanelHead({
  children,
  tools,
}: {
  children: React.ReactNode;
  tools?: React.ReactNode;
}) {
  return (
    <div className="flex h-14 shrink-0 items-center gap-2.5 pr-3 pl-5">
      {children}
      <div className="min-w-0 flex-1" />
      {tools}
    </div>
  );
}

/** The scrolling body under the head, at least as tall as the panel so a foot can sit low. */
export function PanelBody({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className={cn("flex min-h-full flex-col gap-7 px-5 pb-5", className)}>{children}</div>
    </ScrollArea>
  );
}

export function PanelTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="min-w-0 truncate text-[15px] font-medium tracking-[-0.015em]">{children}</h2>
  );
}

/**
 * A labelled field that commits on blur or Enter. `commit` returns the value to show
 * afterwards, or undefined to put the old value back.
 */
export function PanelField({
  label,
  value,
  mono = false,
  suffix,
  live = false,
  commit,
  className,
}: {
  label: string;
  value: string;
  mono?: boolean;
  suffix?: string;
  live?: boolean;
  commit: (draft: string) => string | undefined;
  className?: string;
}) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <div className={cn("min-w-0", className)}>
      <label htmlFor={id} className="mb-1.5 flex justify-between text-[12px] text-muted-foreground">
        {label}
        {live && <span className="font-mono text-[11px] text-foreground">live</span>}
      </label>
      <div className="relative">
        <Input
          id={id}
          value={draft}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onBlur={() => setDraft(commit(draft) ?? value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              setDraft(value);
              event.currentTarget.blur();
            }
          }}
          className={cn(
            "h-[34px] rounded-[10px] border-0 bg-raised px-3 hover:bg-raised focus-visible:ring-2",
            mono ? "font-mono text-[13px] tracking-normal" : "text-sm",
            suffix && "pr-7",
          )}
        />
        {suffix && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[12px] text-dim"
          >
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}
