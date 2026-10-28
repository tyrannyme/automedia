import { useEffect, useState } from "react";
import {
  ArrowUpTrayIcon,
  CheckIcon,
  ChevronRightIcon,
  ClipboardDocumentIcon,
  CommandLineIcon,
  Squares2X2Icon,
} from "@heroicons/react/24/outline";
import type { ExampleId } from "../../engine/examples/index.ts";
import { AppMark } from "@/components/app-mark.tsx";
import {
  templateFacts,
  TemplateArt,
  type TemplateChoice,
} from "@/components/new-project-sheet.tsx";
import { Button } from "@/components/ui/button.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { cn } from "@/lib/utils.ts";

/** The README's own MCP config, and the same command as Claude Code takes it. */
export const MCP_SNIPPETS = {
  json: `{
  "mcpServers": {
    "automedia": {
      "command": "pnpx",
      "args": ["github:tyrannyme/automedia#cli", "mcp"]
    }
  }
}`,
  claude: "claude mcp add automedia -- pnpx github:tyrannyme/automedia#cli mcp",
} as const;

const starters: ExampleId[] = [
  "css-clock",
  "three-clock",
  "vgpu-shader",
  "tailwind-page",
  "strudel-music",
];

/** Keys bright, the rest muted, as the board draws the snippet. */
function Snippet({ text }: { text: string }) {
  return text.split(/("[^"]*"(?=:))/).map((part, index) =>
    index % 2 === 1 ? (
      <span key={index} className="text-foreground">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);
  return (
    <Button
      variant="secondary"
      size="xs"
      className="absolute top-2 right-2 w-[76px] gap-1.5 text-[13px]"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => setCopied(true));
      }}
    >
      {copied ? <CheckIcon className="size-3.5" /> : <ClipboardDocumentIcon className="size-3.5" />}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

/** First run: Home with no projects yet. Two ways in, side by side. */
export function FirstRun({
  onCreate,
  onImport,
  onAllTemplates,
}: {
  onCreate: (example?: ExampleId) => void;
  onImport: () => void;
  onAllTemplates: () => void;
}) {
  const [tab, setTab] = useState<"json" | "claude">("json");
  return (
    <section
      className="studio-nest flex min-h-0 min-w-0 flex-1 flex-col bg-canvas-preview"
      aria-label="First run"
      data-canvas="home"
    >
      <ScrollArea className="min-h-0 flex-1 basis-0">
        <div className="flex min-h-full items-center justify-center px-8 py-10">
          <div className="w-full max-w-[1040px] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300">
            <span className="mb-5 grid size-14 place-items-center rounded-[14px] bg-surface">
              <AppMark className="size-6" />
            </span>
            <h1 className="font-wordmark text-xl leading-[1.2] font-semibold tracking-normal">
              Make your first project
            </h1>
            <p className="mt-2 max-w-[620px] text-sm text-pretty text-muted-foreground">
              Start from a template and change it, or connect an agent and ask it for something.
              Either way, the project shows up here.
            </p>
            <div className="mt-10 grid items-start gap-x-12 gap-y-10 min-[1100px]:grid-cols-[520px_1fr]">
              <div>
                <h2 className="mb-1 flex h-6 items-center gap-2 text-sm font-medium">
                  <Squares2X2Icon className="size-4 text-muted-foreground" />
                  Start from a template
                </h2>
                <p className="mb-4 text-[13px] text-muted-foreground">
                  Examples that ship with the engine, with their code. Open one and change it.
                </p>
                <div className="grid grid-cols-3 gap-x-[18px] gap-y-4">
                  {(["blank", ...starters] satisfies TemplateChoice[]).map((choice) => {
                    const facts = templateFacts(choice);
                    return (
                      <button
                        key={choice}
                        type="button"
                        className="group/tpl min-w-0 rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => (choice === "blank" ? onCreate() : onCreate(choice))}
                      >
                        <TemplateArt
                          choice={choice}
                          className="h-[106px] w-full rounded-xl bg-raised p-3 transition-colors duration-150 group-hover/tpl:bg-surface group-hover/tpl:transition-none"
                        />
                        <span className="mt-2 block truncate text-[13px] font-medium">
                          {facts.name}
                        </span>
                        <span className="block font-mono text-xs leading-[1.4] text-dim">
                          {facts.meta}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-4 -ml-2 flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="xs"
                    className="gap-1 text-[13px] text-muted-foreground"
                    onClick={onAllTemplates}
                  >
                    All templates
                    <ChevronRightIcon className="size-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    className="gap-1.5 text-[13px] text-muted-foreground"
                    onClick={onImport}
                  >
                    <ArrowUpTrayIcon className="size-3.5" />
                    Import project
                  </Button>
                </div>
              </div>
              <div className="min-w-0">
                <h2 className="mb-1 flex h-6 items-center gap-2 text-sm font-medium">
                  <CommandLineIcon className="size-4 text-muted-foreground" />
                  Connect an agent
                </h2>
                <p className="mb-4 text-[13px] text-muted-foreground">
                  Add Automedia to your agent's MCP servers.
                </p>
                <Tabs
                  value={tab}
                  onValueChange={(value) => setTab(value === "claude" ? "claude" : "json")}
                  className="gap-2.5"
                >
                  <TabsList className="h-auto w-[220px] gap-0.5 rounded-[10px] bg-raised p-[3px]">
                    {(["json", "claude"] as const).map((value) => (
                      <TabsTrigger
                        key={value}
                        value={value}
                        className="h-7 rounded-[7px] border-0 text-[13px] text-muted-foreground data-active:bg-surface data-active:text-foreground data-active:shadow-[0_1px_2px_rgb(0_0_0/0.35)] dark:data-active:bg-surface"
                      >
                        {value === "json" ? "JSON" : "Claude Code"}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  {(["json", "claude"] as const).map((value) => (
                    <TabsContent key={value} value={value} className="relative">
                      <pre
                        className={cn(
                          "overflow-x-auto rounded-xl bg-canvas-timeline py-3.5 pl-4 font-mono text-[12.5px] leading-5 text-muted-foreground",
                          // The JSON's first line is a lone brace, so Copy can sit beside it.
                          value === "json"
                            ? "pr-4 whitespace-pre"
                            : "pr-24 break-words whitespace-pre-wrap",
                        )}
                      >
                        <Snippet text={MCP_SNIPPETS[value]} />
                      </pre>
                      <CopyButton text={MCP_SNIPPETS[value]} />
                    </TabsContent>
                  ))}
                </Tabs>
                <ol className="mt-4 grid gap-2 text-[13px] text-muted-foreground">
                  <li className="grid grid-cols-[20px_1fr] gap-2">
                    <span className="font-mono text-xs leading-5 text-dim">1</span>
                    Needs Node.js 22.18 or newer. The first run takes a minute.
                  </li>
                  <li className="grid grid-cols-[20px_1fr] gap-2">
                    <span className="font-mono text-xs leading-5 text-dim">2</span>
                    Ask for something: “a 6 second title card for Liteminer”.
                  </li>
                </ol>
                <p className="mt-4 flex items-center gap-2.5 text-[13px] text-muted-foreground">
                  <span className="size-2.5 shrink-0 rounded-full border-[1.5px] border-dim" />
                  No agent has made a project yet. Its first one opens here as a card.
                </p>
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>
    </section>
  );
}
