import { useEffect, useState } from "react";
import { ChevronRightIcon } from "@heroicons/react/24/outline";
import type { Composition } from "@shared/schemas.ts";
import type { RuntimeCatalog } from "../../engine/runtime.ts";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
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
      <DialogContent className="sm:max-w-md" data-settings-dialog="">
        <DialogHeader>
          <DialogTitle>Composition</DialogTitle>
          <DialogDescription>Size, frame rate, and background for this project.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-x-3 gap-y-4">
          <div className="col-span-3 space-y-1.5">
            <Label htmlFor="comp-name" className="text-muted-foreground">
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
              className="bg-background hover:bg-background focus-visible:bg-background"
            />
            {errors.name && (
              <p id="comp-name-error" className="text-xs text-destructive">
                {errors.name}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="comp-width" className="text-muted-foreground">
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
              className="bg-background hover:bg-background focus-visible:bg-background"
            />
            {errors.width && (
              <p id="comp-width-error" className="text-xs text-destructive">
                {errors.width}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="comp-height" className="text-muted-foreground">
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
              className="bg-background hover:bg-background focus-visible:bg-background"
            />
            {errors.height && (
              <p id="comp-height-error" className="text-xs text-destructive">
                {errors.height}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="comp-fps" className="text-muted-foreground">
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
              className="bg-background hover:bg-background focus-visible:bg-background"
            />
            {errors.fps && (
              <p id="comp-fps-error" className="text-xs text-destructive">
                {errors.fps}
              </p>
            )}
          </div>
          <div className="col-span-3 space-y-1.5">
            <Label htmlFor="comp-bg" className="text-muted-foreground">
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
                className="bg-background pl-9 font-mono hover:bg-background focus-visible:bg-background"
              />
            </div>
            <p id="comp-bg-help" className="text-xs text-muted-foreground">
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
          <div>
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
          <p role="alert" className="text-sm text-destructive">
            {saveError}
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" disabled={saving} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={saving} onClick={() => void commit()}>
            {saving ? "Saving" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
