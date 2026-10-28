import { useEffect, useState } from "react";
import { ChevronRightIcon, XMarkIcon } from "@heroicons/react/24/outline";
import type { Composition } from "@shared/schemas.ts";
import type { RuntimeCatalog } from "../../engine/runtime.ts";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import {
  type CompositionSettingsErrors,
  type CompositionSettingsField,
  validateCompositionSettings,
} from "@/lib/composition-settings.ts";
import { limits } from "@shared/limits.ts";
import { cn } from "@/lib/utils.ts";

/** Fields sit in raised wells inside the sheet, like every other dialog field. */
const fieldClass = "bg-raised hover:bg-raised focus-visible:bg-raised";
const labelClass = "text-[13px] font-normal text-muted-foreground";

type CompositionSettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  composition: Composition | null;
  runtime: RuntimeCatalog | null;
  onSave: (
    input: Partial<Pick<Composition, "name" | "width" | "height" | "fps" | "background">>,
  ) => Promise<void>;
};

export function CompositionSettingsDialog({
  open,
  onOpenChange,
  composition,
  runtime,
  onSave,
}: CompositionSettingsDialogProps) {
  const [name, setName] = useState("");
  const [width, setWidth] = useState("640");
  const [height, setHeight] = useState("360");
  const [fps, setFps] = useState("30");
  const [background, setBackground] = useState("#101010");
  const [advanced, setAdvanced] = useState(false);
  const [errors, setErrors] = useState<CompositionSettingsErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!composition || !open) return;
    setName(composition.name);
    setWidth(String(composition.width));
    setHeight(String(composition.height));
    setFps(String(composition.fps));
    setBackground(composition.background);
    setErrors({});
    setSaveError(null);
  }, [composition, open]);

  const commit = async () => {
    const result = validateCompositionSettings({ name, width, height, fps, background });
    if (!result.ok) {
      setErrors(result.errors);
      setSaveError(null);
      return;
    }
    setErrors({});
    setSaveError(null);
    setSaving(true);
    try {
      await onSave(result.input);
      onOpenChange(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save composition settings.");
    } finally {
      setSaving(false);
    }
  };

  const typed = background.trim();
  const backgroundSwatch =
    typed.toLowerCase() === "transparent"
      ? "transparent"
      : /^#(?:[\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i.test(typed)
        ? typed
        : null;

  const clearError = (field: CompositionSettingsField) => {
    if (!errors[field]) return;
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="gap-0 p-0 sm:max-w-[440px]"
        data-settings-dialog=""
        showCloseButton={false}
      >
        <header className="flex h-16 items-center gap-3 pr-3 pl-6">
          <DialogTitle className="text-[17px] tracking-[-0.02em]">Composition</DialogTitle>
          {composition && (
            <span className="min-w-0 truncate text-sm text-muted-foreground">
              {composition.name}
            </span>
          )}
          <span className="min-w-0 flex-1" />
          <DialogClose
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-foreground"
                aria-label="Close"
              />
            }
          >
            <XMarkIcon />
          </DialogClose>
        </header>
        <DialogDescription className="sr-only">
          Size, frame rate, and background for this project.
        </DialogDescription>
        <div className="grid grid-cols-3 gap-x-3 gap-y-4 px-6">
          <div className="col-span-3 space-y-1.5">
            <Label className={labelClass} htmlFor="comp-name">
              Name
            </Label>
            <Input
              id="comp-name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                clearError("name");
              }}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? "comp-name-error" : undefined}
              className={fieldClass}
            />
            {errors.name && (
              <p id="comp-name-error" className="text-xs text-destructive">
                {errors.name}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className={labelClass} htmlFor="comp-width">
              Width
            </Label>
            <Input
              id="comp-width"
              type="number"
              value={width}
              min={limits.minSize}
              max={limits.maxSize}
              step={1}
              onChange={(event) => {
                setWidth(event.target.value);
                clearError("width");
              }}
              aria-invalid={Boolean(errors.width)}
              aria-describedby={errors.width ? "comp-width-error" : undefined}
              className={fieldClass}
            />
            {errors.width && (
              <p id="comp-width-error" className="text-xs text-destructive">
                {errors.width}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className={labelClass} htmlFor="comp-height">
              Height
            </Label>
            <Input
              id="comp-height"
              type="number"
              value={height}
              min={limits.minSize}
              max={limits.maxSize}
              step={1}
              onChange={(event) => {
                setHeight(event.target.value);
                clearError("height");
              }}
              aria-invalid={Boolean(errors.height)}
              aria-describedby={errors.height ? "comp-height-error" : undefined}
              className={fieldClass}
            />
            {errors.height && (
              <p id="comp-height-error" className="text-xs text-destructive">
                {errors.height}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className={labelClass} htmlFor="comp-fps">
              Frame rate
            </Label>
            <Input
              id="comp-fps"
              type="number"
              value={fps}
              min={limits.minFps}
              max={limits.maxFps}
              step={1}
              onChange={(event) => {
                setFps(event.target.value);
                clearError("fps");
              }}
              aria-invalid={Boolean(errors.fps)}
              aria-describedby={errors.fps ? "comp-fps-error" : undefined}
              className={fieldClass}
            />
            {errors.fps && (
              <p id="comp-fps-error" className="text-xs text-destructive">
                {errors.fps}
              </p>
            )}
          </div>
          <div className="col-span-3 space-y-1.5">
            <Label className={labelClass} htmlFor="comp-bg">
              Background
            </Label>
            <div className="relative">
              <span
                aria-hidden="true"
                className={cn(
                  "pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 rounded-[4px] outline -outline-offset-1 outline-foreground/15",
                  backgroundSwatch === "transparent" && "chequer",
                )}
                style={
                  backgroundSwatch === "transparent"
                    ? { backgroundSize: "8px 8px" }
                    : { background: backgroundSwatch ?? "transparent" }
                }
              />
              <Input
                id="comp-bg"
                value={background}
                onChange={(event) => {
                  setBackground(event.target.value);
                  clearError("background");
                }}
                aria-invalid={Boolean(errors.background)}
                aria-describedby={errors.background ? "comp-bg-help comp-bg-error" : "comp-bg-help"}
                className={cn(fieldClass, "pl-9 font-mono")}
              />
            </div>
            <p id="comp-bg-help" className="text-[12px] text-dim">
              Hex color, or transparent.
            </p>
            {errors.background && (
              <p id="comp-bg-error" className="text-xs text-destructive">
                {errors.background}
              </p>
            )}
          </div>
        </div>
        {runtime && (
          <div className="mt-4 px-6">
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2.5 text-muted-foreground hover:text-foreground aria-expanded:bg-transparent aria-expanded:hover:bg-surface"
              aria-expanded={advanced}
              onClick={() => setAdvanced((value) => !value)}
            >
              <ChevronRightIcon
                className={cn("transition-transform duration-200", advanced && "rotate-90")}
              />
              Runtime details
            </Button>
            {advanced && (
              <dl className="mt-1 space-y-1 font-mono text-xs text-muted-foreground">
                {Object.entries(runtime).map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-2">
                    <dt>{key}</dt>
                    <dd className="truncate">{value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        )}
        {saveError && (
          <p role="alert" className="mt-3 px-6 text-sm text-destructive">
            {saveError}
          </p>
        )}
        <DialogFooter className="mt-2 h-[72px] items-center pr-5 pl-6">
          <Button variant="ghost" size="sm" disabled={saving} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" disabled={saving} onClick={() => void commit()}>
            {saving ? "Saving" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
