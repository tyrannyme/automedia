import { useEffect, useMemo, useRef, useState } from "react";
import type { Control } from "@shared/schemas.ts";
import { Input } from "@/components/ui/input.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { Slider } from "@/components/ui/slider.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import { formatInspectorNumber } from "@/lib/inspector-values.ts";
import { cn } from "@/lib/utils.ts";

/** Selects with this many options or fewer are one-click segmented controls. */
const maxSegments = 4;
/** Sliders show a tick per step when there are this many steps or fewer. */
const maxTicks = 16;

type ControlHandlers = {
  onPreview: (control: Control) => void;
  onCommit: (control: Control) => void;
};

function sliderNumber(value: number | readonly number[], fallback: number): number {
  if (Array.isArray(value)) return Number(value[0] ?? fallback);
  return Number(value);
}

/** Holds a control's local value so drags stay smooth while the store catches up. */
function useLocalControl<T extends Control>(control: T) {
  const [local, setLocal] = useState(control);
  const holding = useRef(false);
  useEffect(() => {
    if (holding.current) return;
    setLocal((current) =>
      current.id === control.id && current.value === control.value ? current : control,
    );
  }, [control]);
  return { local, setLocal, holding };
}

function ControlLabel({ label, value }: { label: string; value?: string }) {
  return (
    <div className="mb-2 flex h-5 items-center justify-between gap-3 text-[13px]">
      <span className="min-w-0 truncate text-muted-foreground">{label}</span>
      {value !== undefined && (
        <span className="font-mono text-[13px] tracking-normal text-foreground tabular-nums">
          {value}
        </span>
      )}
    </div>
  );
}

function RangeControl({
  control,
  onPreview,
  onCommit,
}: ControlHandlers & { control: Extract<Control, { type: "range" }> }) {
  const { local, setLocal, holding } = useLocalControl(control);
  const localRef = useRef(local);
  localRef.current = local;
  const values = useMemo(() => [local.value], [local.value]);
  const steps = local.step > 0 ? Math.round((local.max - local.min) / local.step) : 0;
  const update = (value: number | readonly number[], commit: boolean) => {
    const next = { ...localRef.current, value: sliderNumber(value, localRef.current.value) };
    holding.current = !commit;
    setLocal(next);
    if (commit) onCommit(next);
    else onPreview(next);
  };
  return (
    <div className="py-2">
      <ControlLabel label={local.label} value={formatInspectorNumber(local.value)} />
      <div className="relative">
        <Slider
          aria-label={local.label}
          value={values}
          min={local.min}
          max={local.max}
          step={local.step}
          onValueChange={(value) => update(value, false)}
          onValueCommitted={(value) => update(value, true)}
          className="panel-slider"
        />
        {steps > 0 && steps <= maxTicks && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-2 top-[calc(50%+8px)] flex justify-between"
          >
            {Array.from({ length: steps + 1 }, (_, index) => (
              <i key={index} className="h-1 w-px bg-faint" />
            ))}
          </span>
        )}
      </div>
    </div>
  );
}

const hexPattern = /^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/;

function ColorControl({
  control,
  onCommit,
}: ControlHandlers & { control: Extract<Control, { type: "color" }> }) {
  const { local, setLocal } = useLocalControl(control);
  const [hex, setHex] = useState(local.value);
  useEffect(() => setHex(local.value), [local.value]);
  const commit = (value: string) => {
    const next = { ...local, value };
    setLocal(next);
    onCommit(next);
  };
  return (
    <div className="min-w-0 py-2">
      <ControlLabel label={local.label} />
      <Popover>
        <PopoverTrigger
          render={
            <button
              type="button"
              aria-label={`${local.label}, ${local.value}`}
              className="flex h-9 w-full min-w-0 items-center gap-2.5 rounded-[10px] bg-raised pr-2.5 pl-1 text-left outline-none hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring aria-expanded:bg-secondary"
            />
          }
        >
          <span
            className="panel-well size-7 shrink-0 rounded-[7px]"
            style={{ background: local.value }}
          />
          <span className="min-w-0 truncate font-mono text-[13px] tracking-normal uppercase">
            {local.value}
          </span>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56">
          <input
            aria-label={`${local.label} picker`}
            type="color"
            value={local.value.slice(0, 7)}
            onChange={(event) => commit(event.currentTarget.value.toUpperCase())}
            className="h-9 w-full cursor-pointer rounded-md bg-transparent"
          />
          <Input
            aria-label={`${local.label} hex`}
            className="bg-raised font-mono text-[13px] tracking-normal focus-visible:bg-raised"
            value={hex}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setHex(value);
              if (hexPattern.test(value)) commit(value);
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function ToggleControl({
  control,
  onCommit,
}: ControlHandlers & { control: Extract<Control, { type: "toggle" }> }) {
  const { local, setLocal } = useLocalControl(control);
  return (
    <label className="flex h-11 items-center justify-between gap-3 text-[13px] text-muted-foreground">
      <span className="min-w-0 truncate">{local.label}</span>
      <Switch
        checked={local.value}
        onCheckedChange={(value) => {
          const next = { ...local, value };
          setLocal(next);
          onCommit(next);
        }}
      />
    </label>
  );
}

function SelectControl({
  control,
  onCommit,
}: ControlHandlers & { control: Extract<Control, { type: "select" }> }) {
  const { local, setLocal } = useLocalControl(control);
  const commit = (value: string) => {
    const next = { ...local, value };
    setLocal(next);
    onCommit(next);
  };
  if (local.options.length <= maxSegments) {
    return (
      <div className="py-2">
        <ControlLabel label={local.label} />
        <ToggleGroup
          aria-label={local.label}
          value={[local.value]}
          onValueChange={(value) => {
            const next = local.options.find(
              (option) => option.value !== local.value && value.includes(option.value),
            );
            if (next) commit(next.value);
          }}
          spacing={0}
          className="panel-segments grid w-full auto-cols-fr grid-flow-col gap-0.5 rounded-[10px] bg-raised p-[3px]"
        >
          {local.options.map((option) => (
            <ToggleGroupItem
              key={option.value}
              value={option.value}
              className="h-7 min-w-0 rounded-[7px] px-2 text-[13px] font-medium text-muted-foreground hover:bg-transparent hover:text-foreground aria-pressed:bg-[var(--segment-on)] aria-pressed:text-foreground aria-pressed:shadow-[0_1px_2px_rgb(0_0_0/0.35)] data-[state=on]:bg-[var(--segment-on)] data-[state=on]:text-foreground"
            >
              <span className="truncate">{option.label}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
    );
  }
  return (
    <div className="py-2">
      <ControlLabel label={local.label} />
      <Select value={local.value} onValueChange={(value) => value !== null && commit(value)}>
        <SelectTrigger
          aria-label={local.label}
          className="h-9 w-full rounded-[10px] bg-raised hover:bg-secondary"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {local.options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Groups neighbouring colour controls in pairs, so wells share a row. */
function controlRows(controls: readonly Control[]): Control[][] {
  const rows: Control[][] = [];
  for (const control of controls) {
    const last = rows.at(-1);
    if (control.type === "color" && last?.length === 1 && last[0]?.type === "color") {
      last.push(control);
    } else {
      rows.push([control]);
    }
  }
  return rows;
}

function ControlView({ control, ...handlers }: ControlHandlers & { control: Control }) {
  if (control.type === "range") return <RangeControl control={control} {...handlers} />;
  if (control.type === "color") return <ColorControl control={control} {...handlers} />;
  if (control.type === "toggle") return <ToggleControl control={control} {...handlers} />;
  return <SelectControl control={control} {...handlers} />;
}

/** The project's controls as direct instruments: wells, segments, sliders and switches. */
export function ControlsList({
  controls,
  onPreview,
  onCommit,
}: ControlHandlers & { controls: readonly Control[] }) {
  return (
    <div className="flex flex-col gap-1">
      {controlRows(controls).map((row) => (
        <div
          key={row.map((control) => control.id).join(" ")}
          className={cn(row.length > 1 && "grid grid-cols-2 gap-2.5")}
        >
          {row.map((control) => (
            <ControlView
              key={control.id}
              control={control}
              onPreview={onPreview}
              onCommit={onCommit}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
