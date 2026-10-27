---
version: alpha
name: Automedia
description: Electron studio chrome. Not composition HTML.
colors:
  primary: "#F5F5F5"
  on-primary: "#0A0A0A"
  background: "#000000"
  foreground: "#F5F5F5"
  surface: "#262626"
  on-surface: "#F5F5F5"
  muted: "#262626"
  on-muted: "#A3A3A3"
  canvas-preview: "#101010"
  canvas-code: "#0E0E0E"
  canvas-inspector: "#141414"
  canvas-rail: "#0A0A0A"
  canvas-timeline: "#0B0B0B"
  raised: "#1C1C1C"
  dim: "#8A8A8A"
  faint: "#707070"
  border: "#2E2E2E"
  ring: "#F5F5F5"
  playhead: "#EF4444"
  destructive: "#F87171"
  on-destructive: "#0A0A0A"
  warning: "#FACC15"
  on-warning: "#0A0A0A"
  chequer-a: "#171717"
  chequer-b: "#0A0A0A"
  scrim: "#000000A3"
  light-primary: "#171717"
  light-on-primary: "#FAFAFA"
  light-background: "#FFFFFF"
  light-foreground: "#171717"
  light-surface: "#D0D0D0"
  light-on-surface: "#171717"
  light-muted: "#D0D0D0"
  light-on-muted: "#525252"
  light-canvas-preview: "#F2F2F2"
  light-canvas-code: "#F4F4F4"
  light-canvas-inspector: "#F7F7F7"
  light-canvas-rail: "#F6F6F6"
  light-canvas-timeline: "#EBEBEB"
  light-raised: "#ECECEC"
  light-dim: "#636363"
  light-faint: "#808080"
  light-border: "#E5E5E5"
  light-ring: "#171717"
  light-playhead: "#DC2626"
  light-destructive: "#DC2626"
  light-on-destructive: "#FFFFFF"
  light-warning: "#CA8A04"
  light-on-warning: "#FFFFFF"
  light-chequer-a: "#E5E5E5"
  light-chequer-b: "#FAFAFA"
  light-scrim: "#00000052"
typography:
  wordmark:
    fontFamily: Nunito
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1
  empty-title:
    fontFamily: Nunito
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.2
  titlebar:
    fontFamily: Poppins
    fontSize: 15px
    fontWeight: 500
    lineHeight: 1
  body:
    fontFamily: Poppins
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: -0.01em
  label:
    fontFamily: Poppins
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: -0.01em
  inspector:
    fontFamily: Poppins
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: -0.01em
  control:
    fontFamily: Poppins
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1
    letterSpacing: -0.01em
  timecode:
    fontFamily: DM Mono
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1
    fontFeature: "tnum"
  code:
    fontFamily: DM Mono
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.45
rounded:
  none: 0px
  xs: 4px
  sm: 6px
  md: 8px
  lg: 10px
  xl: 14px
  dialog: 16px
  shell: 24px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  base: 8px
  shell: 12px
  titlebar: 44px
  control: 36px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.control}"
    rounded: "{rounded.lg}"
    height: 36px
    padding: 8px
  button-primary-hover:
    backgroundColor: "{colors.foreground}"
    textColor: "{colors.on-primary}"
  button-ghost:
    backgroundColor: transparent
    textColor: "{colors.foreground}"
    typography: "{typography.control}"
    rounded: "{rounded.lg}"
    height: 36px
    padding: 8px
  button-ghost-hover:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
  button-destructive:
    backgroundColor: transparent
    textColor: "{colors.destructive}"
    typography: "{typography.control}"
    rounded: "{rounded.lg}"
    height: 36px
    padding: 8px
  button-destructive-hover:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.destructive}"
  titlebar:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.wordmark}"
    height: 44px
  letterbox:
    backgroundColor: "{colors.canvas-preview}"
    textColor: "{colors.foreground}"
  playhead:
    backgroundColor: "{colors.playhead}"
    textColor: "{colors.playhead}"
    width: 2px
  inspector-row:
    backgroundColor: "{colors.canvas-inspector}"
    textColor: "{colors.foreground}"
    typography: "{typography.inspector}"
    padding: 8px
  inspector-row-selected:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
  track-lane:
    backgroundColor: "{colors.canvas-timeline}"
    textColor: "{colors.on-muted}"
    typography: "{typography.label}"
    height: 44px
  clip:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    height: 36px
  home-card:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.dialog}"
  play-button:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    size: 40px
  track-lane-selected:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
  code-pane:
    backgroundColor: "{colors.canvas-code}"
    textColor: "{colors.foreground}"
    typography: "{typography.code}"
    padding: 8px
---

# Automedia

This file is the studio chrome. It is not a look for `index.html` inside a composition. Agents writing pictures ignore these tokens. Agents writing the Electron UI do not.

shadcn dark, true gray. If it looks like navy, slate-blue, warm paper, cream, or Premiere orange, the tokens are wrong.

## Overview

Automedia is a local desktop studio for stills, animations, and video. People open it to pick a project, scrub, tweak a control, and export. Agents do most of the authoring through MCP.

The chrome is a shadcn app. Deep-black window shell, quietly nested graphite regions, inverted primary, no decorative chroma. The letterboxed frame is still the picture. Everything around it stays out of the way.

The mark is cool white on gray, chamfered, a viewfinder.

Workspace (Stage): titlebar tabs for open projects and a Home gallery for all of them, then one stage nest (stage head, letterboxed picture, player, timeline) beside one panel nest that is the project's dashboard until a clip is selected. The picture is the largest thing on screen. The agent is a visible presence: its name in the titlebar, its work in the panel. shadcn/ui, Heroicons outline, and Motion. Map tokens onto the existing CSS variables. Do not invent a parallel component kit.

Appearance is Dark, Light, or System. Default System. System follows the OS and picks one of the two palettes. It is not a third look. Dark is the intended look. Light is the same gray, inverted, not a cream sheet.

## Colors

Unprefixed tokens are Dark. `light-*` tokens are Light. Bind both to the same CSS variables (`--background`, `--primary`, `--playhead`, …) and swap the binding with appearance. Do not sprinkle `light-*` names through components.

Neutrals are chroma-zero gray. Hue is irrelevant because chroma is 0. This is graphite and paper-white on purpose. No navy. No slate-blue. No cream. No paper warmth.

- **Primary (#F5F5F5 / #171717):** Near-white on dark, near-black on light. Primary actions and the default filled button. Never destructive red.
- **Background (#000000 / #FFFFFF):** The window shell. Caption overlay, outer padding, and the gutter between nested regions. Darker than every canvas so the rail and workspace read as inset, not as abutting slabs.
- **Canvas tones:** Nested regions earn distinct chroma-zero fills. Dark: shell `#000000`, timeline `#0B0B0B`, code `#0E0E0E`, stage `#101010` (`canvas-preview`), panel `#141414` (`canvas-inspector`), raised `#1C1C1C`, surface `#262626`. Light: shell `#FFFFFF`, panel `#F7F7F7`, code `#F4F4F4`, stage `#F2F2F2`, raised `#ECECEC`, timeline `#EBEBEB`, surface `#D0D0D0`. `raised` is a card-weight fill inside a nest: Home cards, an export option, the claim note. The timeline sits a step darker than the stage so clips stay distinct from the picture. It is not a dark pit. Muted and dim text keep WCAG AA on every canvas (the theme test checks this).
- **Foreground (#F5F5F5 / #171717):** Body text, icons, the focus ring.
- **Surface (#262626 / #D0D0D0):** Selection, ghost hover, a lifted lane or clip. Sits above the lightest dark canvas so hover still reads on every pane. Not a card.
- **Muted (#A3A3A3 / #525252):** Secondary labels, idle lane text, helper copy. Token `on-muted`.
- **Dim (#8A8A8A / #636363):** Meta that sits beside a value: counts, ages, DM Mono facts, ruler labels, the frame number. AA on every canvas.
- **Faint (#707070 / #808080):** Ticks, separators, and icons that only hint. Never body text.
- **Border (#2E2E2E / #E5E5E5):** Hairlines that have a job: a resize handle tick, the frame around the composition, the timeline ruler and label split, and one edge on a floating overlay. Not a box around every control. Not a rule between major regions.
- **Playhead (#EF4444 / #DC2626):** The needle. Red so it reads on gray lanes and colored clips. A 2px line and a small ruler cap. Not a button, not a row fill, not a focus ring. Not the destructive token.
- **Destructive (#F87171 / #DC2626):** Errors, invalid validate results, delete. Text, icon, or border. Not a red banner and not a timeline color.
- **Warning (#FACC15 / #CA8A04):** Validate warnings only. Yellow stays because it means warning, not because the palette is warm.
- **Chequer (#171717 + #0A0A0A / #E5E5E5 + #FAFAFA):** 8px squares behind the composition iframe when the manifest background is transparent. Two near-neutrals from this palette. No hue.
- **Scrim (black 64% / black 32%):** The modal dim. Always black, in both appearances, so a dialog darkens the studio instead of washing it gray.

Playing is the needle moving, not a colored play button. Export progress is the job's real frame count in DM Mono plus a determinate bar in background/surface/foreground. Mute is opacity plus the icon.

Focus ring is `ring`, which matches foreground. High contrast, 2px, no offset glow.

## Typography

Ship the faces. This app has to work offline. `font-src` is `'self'`. Bundle woff2. Do not load Google Fonts at runtime.

Poppins is the UI. 400 and 500 only. Pull tracking in (`-0.01em`) so the geometric width does not blow the inspector.

Rounded Nunito is the greeting. Empty-state and first-run titles. Nowhere else. Panel group names are Poppins, distinguished by weight and space.

DM Mono owns anything that must not jitter or that is a fact: timecode, fps, duration, frame index, sizes (`1280×720 · 8.0 s`), file meta (`MP4 · 3.7 MB · 6m ago`), file names inside prose (`Wrote pattern.js in Chords`), and code mode. Poppins has no tabular figures. Do not put clocks in Poppins.

Readable type. Body 14px. Labels 13px. Empty-state title 20px Nunito is the ceiling. Do not go back to 11-12px chrome.

Heroicons outline, solid only for an active state (the Home tab). 16px in the panel and timeline. 20px in the titlebar and empty states. Do not mix icon sets.

## Layout

8px scale. Control height 36px. Window chrome 44px. Panel type 13px. Lanes 44px with 36px clips. Ruler 26px. Player row 56px.

The window is a deep-black shell. Two rounded nests sit on it: the stage (picture, player, timeline) and the panel. Home replaces both with one nest. A 12px gutter of shell color insets every nest and splits them from each other. 24px corners on the nests. Native caption buttons live in the unified 44px titlebar. Do not stroke the nests. The gap and the rounding are the split.

Inside the stage, picture and timeline are told apart by canvas tone. The panel is a separate nest. Earn a hairline or a hover/selection fill only when it communicates selection, interaction, warning, or a split that spacing cannot express. Prefer spacing, alignment, typography, canvas tone, and a change in density before borders or boxes.

Idle controls do not wear a hairline. Inputs, selects, ghost actions, and inspector values sit on the canvas. Hover may lift a `surface` fill. Focus is the 2px `ring`. Selection is a fill, never a stroke around the object.

Do not wrap every section, metric, or comparison in a card. Avoid nested panels of panels. The nests are application geometry, not dashboard tiles. `raised` cards exist only where the thing is an object you act on (a project, an export option, a claim).

Hairlines that still have a job: a resize handle tick, the 1px frame around the composition, the timeline ruler and label split, and one edge on a floating overlay (dialog, menu, select popup). Nothing else. No titlebar rule. No box around the rail or the workspace.

**Home and tabs.** There is no project sidebar. The titlebar's grid button opens Home (solid icon while it is open), and every open project is a tab beside it: live poster, name, close X on hover and on the active tab, middle-click closes, Ctrl+Tab cycles. A project an agent holds shows the holder's initial with a live dot on its tab. Tabs shrink to a floor, then fold into a `+N` menu that ends in Close other tabs; the active tab always stays visible. `+` opens the New sheet. Closing the last tab, or trashing the active project, returns to Home. Home is a gallery of every project: the poster at its true aspect inside a same-size `raised` box, the name, size and length in DM Mono, and who last touched it (the lease holder, otherwise You) with a short age. A held project says so on its poster. Search (`/` focuses it), sort (Custom order, Last edited, Name), Import, and New sit in one header row; New is the only primary. Drag a card to reorder; that order is the one agents see. Each card's ⋯ menu is Export, Export PNG, Duplicate, Save project, and Move to trash. Save project writes a `.automedia` snapshot. Import always creates a new library item. Multiple projects stay loaded; switching restores playhead, selection, and code dirty state. The media library lives in the panel's Media section.

**Titlebar.** One 44px row on the shell: mark, Home, project tabs, `+`, then on the right the agent presence chip, the update button, and Export. The mark is the inline viewfinder SVG in `currentColor`, 18px, so it follows appearance; never the app-icon PNG. Export is the one primary and is hidden on Home and first run. When an update is found, one 32px ghost icon button sits left of Export: download arrow, then its own outline fills as a progress ring, then a restart arrow. Hover shows the version and change list. While an export runs, Export reads Exporting and reopens the sheet. Code mode has its own Done inside its dialog; the titlebar does not repeat it. No second toolbar.

**Stage.** The stage nest stacks four things. The stage head: name, then facts in DM Mono (size, fps, length), with Fit/zoom, composition settings and, below 1000px, the panel toggle on the right. The picture: letterboxed on `canvas-preview`, exact pixel size scaled to fit with a gutter on every side, a hairline at its true edge and one soft drop (the only shadow outside overlays). The player row: clock on the left (timecode in DM Mono 14, frame number `f79` on `dim`), transport centred with one inverted round play button, loop and mute on the right. Then the timeline. Editing tools are not on the player.

**Panel.** `canvas-inspector`, its own nest. With nothing selected the panel is the project's dashboard: Controls first when the project has any, then Activity, Media, and Exports. Activity shows the newest three rows (operation icon, plain-English text with file names in DM Mono, DM Mono age) under the agent's avatar and "working now" while a claim is live, then All activity. Rows say only what the log records (`put_track` logs an id, so the row is "Changed the Chords clip"), and rows outside a live claim name nobody. While an agent holds the project, a `raised` note names it with time left; clicking it explains what a claim does and does not stop. Media is the library as draggable tiles plus Import; empty, it is one quiet line. Exports are receipts: name, then format · size · age in DM Mono; hover shows the folder. Select a clip and the same panel becomes the clip. Composition settings open a focused dialog. Duration is not a setting. Section headings are type, not bars. Space between groups (32px) separates them.

**Export.** One trigger, one focused sheet: setup, running, done or failed. It stays open after start; closing it does not cancel the job, and the titlebar button brings it back. Finished files also list in the panel under Exports. Jobs queue across projects; the sheet names the wait. Files are named after the project (`four-chords.mp4`, `four-chords-f79.png`, `four-chords-2.mp4`).

**Resize.** The panel (280–440px) and the timeline have handles that show on hover, min/max sizes, and persistence. The timeline is as tall as its lanes, up to the layout height. Below 1000px wide the panel leaves the layout and comes back as a floating sheet from the stage-head toggle; it stops above the player so scrubbing still works, the picture refits beside it, and Esc closes it. At 800×600 the picture, player, and timeline always stay.

Diagnose quantity separately from intensity. If the studio feels busy, remove, combine, or reorder chrome. If it feels loud, you added a surface, a color, or a motion the picture did not need.

8px chequer only behind the iframe and transparent posters, and only to read alpha. The one other chequer is the tiny background swatch that means transparent. Letterbox gutter stays flat. No chequer on the timeline, panel, or titlebar.

## Elevation & Depth

Regions have none. No shadows, glass, blur, glow, frost, or fake depth on the shell, the nests, rows, clips, or controls. Hierarchy there is solid color, type, space, nested geometry, and motion. The picture is the one exception inside a nest: a hairline at its true edge and one soft drop, so its edge reads on any background.

Floating layers are the one exception. Menus, selects, popovers, and dialogs lift off the studio with a hairline `border` and one soft shadow (`--float-shadow`: a 1px contact shadow plus a 40px drop at 72% black in dark, 20% in light). It says "this is on top" without a glow.

The shell is the darkest fill. Nested regions lift by value and by rounding. A hairline or a surface lift. Not both stacked into a floating panel.

Modal overlay is a flat `scrim`: black at 64% in dark, 32% in light. No backdrop blur.

## Shapes

Corners follow control height so nothing reads as a pill: 10px on 36px buttons, inputs, and selects (`rounded.lg`), 8px on 32px controls, clips, and menu items (`rounded.md`), 6px on 28px controls and thumbnails' inner art (`rounded.sm`). Menus and popovers are 14px (`rounded.xl`) so a 4px-padded 8px item sits concentric inside. Dialogs and Home cards are 16px. Nests are 24px. Nest something inside a padded container and the outer radius is the inner radius plus the padding. Checkboxes are a 16px box with a 4px corner. No `rounded-full` on buttons, badges, inputs, or chips. The only round shapes are the play button, agent avatars and their live dots, switches, slider thumbs, swatch dots on clip labels, and radios.

Soft corners on Home cards, timeline clips, dialogs, and inputs. The mark is chamfered. No pills.

## Components

Use shadcn. Restyle it to these tokens. Do not fork a second button.

**Buttons.** Primary is inverted neutrals: near-white on dark, near-black on light. Ghost for everything else in the header. Destructive is ghost with destructive text. Height 36px; the titlebar uses the 32px size. Hover fill snaps in, eases out. Press scales to 0.96 so a click is felt (never below 0.95; menu triggers skip it). See motion below. No colored primary. No sky CTA. No outline variant in the studio. A ghost action is type, then a surface on hover.

**Inputs and selects.** Flush. No idle stroke. Inspector values sit on `surface` so the field is the object, not the label. Dialog fields may sit on `background` so they read on `popover`. Focus is `ring`, 2px, no glow. Checkboxes keep a quiet edge because an empty box has to exist. Slider thumbs are a filled `foreground` dot, not a ringed knob.

**Export sheet.** Wide: the real frame at the playhead as the hero, the file you will get (its real next name, then the spec line in DM Mono), and the formats as rich options grouped Video, Still, Audio, each with its codec line and a note on what the group carries (picture and sound, no sound, the Chords track). The selected option fills `raised`, its icon inverts, and quality appears inside it only where it applies; WebP is lossless, so its slider is Effort. Blocked formats stay visible with the reason and a fix button where one exists (Set a background, Make it 1280 × 720). With no sound to export the Audio group is one line. Sizes show only where they are exact (WAV); never a guess. The button names the format (Export MP4). Running shows the job's real frames in DM Mono, the phase steps with timings, speed and time left, the queue, and Cancel. Done is a receipt: the file plays in the hero, its facts and checks are listed, the full path has a copy button, then Reveal, Save copy, Export again. Failure is one plain sentence plus the engine's code and message in DM Mono, with Copy details and Try again.

**Agent presence.** Only while a claim is live: a chip in the titlebar with the holder's avatar initial and live dot, its name, and the verb of its newest operation ("wrote script.js"). Clicking opens the feed: who holds the project and the time left, then activity grouped into bursts (entries less than 90 s apart), each row with its time, icon, and plain-English text; file rows jump to code, clip rows select the clip, export rows show the file. When the holder writes a file, a quiet chip rises over the top edge of the picture for 2.4 s naming what changed; your own edits never raise it. No lease, no chip. Never invent an actor the log does not record.

**Letterbox.** The picture in the stage gutter. Chequer only under the iframe when background is transparent. A hairline at its true edge and one soft drop. The frame is a size cue, not a spotlight. When the composition's script throws, the stage dims the last frame and shows one floating card with the error in DM Mono, Open script.js, and Reload.

**Playhead.** 2px `playhead` line through the lanes, small cap in the ruler. No easing while it tracks time. The cap and the ruler are easy to hit.

**Player.** One 56px row under the picture. Clock on the left: timecode in DM Mono 14, then `/ length`, then the frame number `f79` on `dim`, because it is the frame a PNG export takes. Rewind, step back, play, step forward, end in the middle; play is a 40px inverted round button. Loop and mute on the right. The clock never shrinks.

**Composition length.** The unused cell above the lane names, left of the time ruler, shows length in seconds and a Loop or Open seam readout. It stays visible when a clip is selected. Loop means the first displayed frame equals the last displayed frame. That is a seam check, not the playback loop button. No hue. Loop is foreground. Open is muted. The word is the indicator; do not add a second loop icon.

**Timeline bar.** One row above the ruler: Add (Block, Music, Marker, Media) as a ghost menu, then split and delete (disabled until a clip is selected), and on the right a zoom slider between zoom out and zoom in, plus Fit. Mouse-wheel zoom (`ctrl` / `meta` / `alt` + wheel) remains. New blocks and music start at the playhead, or at the click from a lane's context menu.

**Ruler.** Labels are DM Mono, muted, with only the precision the tick step needs (`0s 1s 2s`, `0.5s`, `0.04s`, `1:15` past a minute). Each labelled tick has a 8px mark and four 4px minor marks between, in `muted-foreground` at 50% and 25%. Past the composition's out point, ruler and lanes are dimmed with `background/20` so the end is visible without a line.

**Snap guide.** When a clip edge, clip move, or marker locks to a snap target, a 1px `foreground` line appears through the ruler and lanes at that time. It is not the playhead. It is not eased. It vanishes when the drag ends.

**Timeline lanes.** Same neutrals. Every kind shares one 44px lane with a 36px clip. Track heads carry the kind icon and name. Clips show what is in them: a visual block is a filmstrip of the composition's own frames over its span (from `thumbnail.png?t=&h=`, only the tiles in view, cached per revision), video shows its frames, audio its real decoded waveform, music its pattern name. The clip's colour is a swatch dot on a dark label chip at its left, and the strip darkens behind the label; the colour names the clip without painting the timeline. Selected is a 2px inset `foreground` ring. Trim grips are 3px bars inside each end on hover and while selected; the cut part stays as a faint ghost. Do not invent default kind colors. No stroke around a clip at rest. The ruler is pinned and scrolls horizontally with the clips. Clicking a lane selects or moves a clip; only the ruler and the playhead cap seek. Drag a lane head to reorder tracks. Dropping media between lanes opens a temporary New lane row. Right-clicking a clip offers edit code or edit pattern, split, duplicate, show in Media, colour, and delete; empty lane space offers add block, add music, and add marker. Composition length is the last clip out point. An empty timeline is 3 seconds. A new clip is 3 seconds. Hover and selection fills snap in.

**Scrollbars.** Quiet chrome. Thin pill thumbs from `foreground` at ~26% on a transparent track. Native overflow (timeline, menus) uses WebKit thumbs that stay invisible until hover. `ScrollArea` thumbs fade in on hover or while scrolling. Never leave the platform default bar in the studio.

**Panel rows.** Rows, not cards. Labels 13px Poppins 500. Values 13px 400. Controls: colour wells with the hex in DM Mono (neighbouring colours share a row), selects with four or fewer options as segmented controls, full-width sliders with ticks and a tabular readout. A selected clip: header with swatch dot, name, kind, and close; name and swatch palette; Timing as DM Mono `m:ss.hh` fields; Sound only where there is sound; Source; a block's Edit code with its files and line counts; Delete clip last, as red text with its key. Activity rows arrive instantly.

**Code mode.** A focused, full-height dialog over the studio. Header: clip swatch, name, kind and file count, then the save status ("Saved · preview updated"), and Done as the one primary. Panes for index.html, style.css, and script.js (the tall column), DM Mono 13 with line numbers, a caret-line highlight, and Ln/Col. Saving is automatic. No boxed editors and no focus ring around an editor. When an agent's write lands first, an inline banner says so in words (no red), autosave pauses, and Compare / Take theirs / Keep mine resolve it with a grey line diff; Take theirs copies your text to the clipboard first. Typing does not animate. Visual blocks only.

**Music mode.** The same dialog with one pane for the authored Strudel `pattern.js`. The panel action is Edit pattern.

**First run.** An empty library opens on Home with no tabs. The app mark on a 56px `surface` tile, one title, one line naming both ways in, then two equal columns: Start from a template (Blank plus engine examples as tiles, All templates, Import project) and Connect an agent (the README's MCP JSON and the one-line `claude mcp add` form, with Copy, two steps, and a hollow-dot line until an agent makes a project). No mascot, no hero wash.

**New sheet.** `+` and New open one sheet: Start (Blank, Import) and the engine examples in groups, with search and a footer showing the selection's facts and description. Tiles are the frame's real shape and background with a kind icon; never a fake preview.

**Trash.** A confirm dialog that says what really happens: the whole project folder moves into the library's `compositions/.trash/`, with its exports listed, and a warning when an agent holds the project.

**Command palette.** Ctrl K / ⌘K. One field, then projects as posters (open tabs first) and the commands that exist, each row showing its shortcut in DM Mono keycaps. Esc returns focus.

**Composition settings.** A focused dialog. Name on its own row; width, height, and frame rate share one row; background is a DM Mono field with a live swatch at its left (chequer for transparent). Labels are muted. Runtime details is one chevron disclosure.

**Overlay controls.** Range, color, toggle, select. 36px. They write CSS variables into the composition. They are chrome, not part of the picture.

Hover, focus-within, and other pointer-driven highlights use the agent-xiv thread-list pattern: transition on the property at rest, `hover:transition-none` (and the matching group-hover) so the entered state is on the same frame as the cursor. Unhover eases out. A hover that fades in makes the app feel late.

```txt
transition-colors hover:bg-surface hover:transition-none
```

## Do's and Don'ts

- Do keep Dark, Light, and System. Default System. Two palettes, one component tree.
- Do map tokens onto shadcn CSS variables. Change `index.css`. Bind the gray values in this file. Do not leave navy, slate-blue, cream, paper, or orange in the chrome.
- Do ship Poppins, Nunito, and DM Mono as local woff2.
- Do keep the playhead red (`playhead` token). No sky accent.
- Do snap hover in and ease it out. Never ease hover-in, especially color.
- Do use springs on arrivals and shared layout: empty state, first composition, preview/code, insert/remove of tracks/markers/controls, export phase changes, panel open/close. Short spring, almost no overshoot. Other fades 200-280ms ease-out.
- Do honor `prefers-reduced-motion`: snap, no animation.
- Do not ease the playhead, seek, or the letterboxed frame. Those are the clock.
- Do not animate scrubbing, hover, typing in code mode, or activity log lines arriving.
- Do not put Nunito on inspector headings, buttons, or the timeline.
- Do not put clocks in Poppins.
- Do not use brand accents, Spectrum blue selection, green play states, or success pills.
- Do not use cream, paper, tan, warm gray, navy, slate-blue, or Premiere orange anywhere in the chrome.
- Do not use eyebrow labels, pill badges, pill CTAs, or `rounded-full` on actions.
- Do not wrap the studio in cards. Do not nest panels of panels. Do not stroke idle inputs, selects, clips, cards, or toolbar actions. Do not use one background token for every region.
- Do not replace a removed border with a shadow, glow, or extra rounded tray. The float shadow belongs to menus, popovers, sheets, and dialogs; the picture's soft drop is the only other shadow.
- Do not use decorative grids, gradients, gradient text, glows, blobs, stripes, textures, paper, glass, colored side rails, ornamental shadows, or fake depth. A gradient is allowed only as a labelled continuous data scale. v1 chrome has none.
- Do not put a chequer anywhere except behind the composition iframe and inside a background swatch that means transparent.
- Do not paint audio green and video blue. Lanes share neutrals; a clip's colour is the dot on its label.
- Do show what an agent is doing only from what the engine records: the claim and the activity log. Never invent an actor, a verb, or a number.
- Do not restyle authored compositions from this file.
- Do not add a mascot, a grid background, or a hero wash to the empty state.
- Do maintain WCAG AA (4.5:1) for text on surfaces. The playhead is a line, not text.
- Do not use more than two Poppins weights. Nunito is wordmark and empty-state only. Do not add another sans.
- Do keep ordinary motion off the picture. Delight lives in chrome arrivals. The composition moves however its author wrote it.
- Do put composition setup in a temporary workflow. Do not leave it expanded in the inspector.
- Do show resize handles on the panel and timeline on hover.
- Do give Export one coherent control, then a focused sheet.
- Do keep major regions apart with shell gutter, rounding, and canvas tone. Never with a 1px box around the pane.
