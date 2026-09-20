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
  canvas-preview: "#111111"
  canvas-code: "#0E0E0E"
  canvas-inspector: "#161616"
  canvas-rail: "#0A0A0A"
  canvas-timeline: "#0C0C0C"
  border: "#2E2E2E"
  ring: "#F5F5F5"
  playhead: "#EF4444"
  destructive: "#F87171"
  on-destructive: "#0A0A0A"
  warning: "#FACC15"
  on-warning: "#0A0A0A"
  chequer-a: "#171717"
  chequer-b: "#0A0A0A"
  inspector-head-composition: "#2C2C2C"
  inspector-head-clip: "#424242"
  inspector-head-marker: "#363636"
  inspector-head-controls: "#222222"
  inspector-head-library: "#505050"
  light-primary: "#171717"
  light-on-primary: "#FAFAFA"
  light-background: "#FFFFFF"
  light-foreground: "#171717"
  light-surface: "#D0D0D0"
  light-on-surface: "#171717"
  light-muted: "#D0D0D0"
  light-on-muted: "#525252"
  light-canvas-preview: "#F0F0F0"
  light-canvas-code: "#F4F4F4"
  light-canvas-inspector: "#E8E8E8"
  light-canvas-rail: "#F6F6F6"
  light-canvas-timeline: "#E0E0E0"
  light-border: "#E5E5E5"
  light-ring: "#171717"
  light-playhead: "#DC2626"
  light-destructive: "#DC2626"
  light-on-destructive: "#FFFFFF"
  light-warning: "#CA8A04"
  light-on-warning: "#FFFFFF"
  light-chequer-a: "#E5E5E5"
  light-chequer-b: "#FAFAFA"
  light-inspector-head-composition: "#D0D0D0"
  light-inspector-head-clip: "#B4B4B4"
  light-inspector-head-marker: "#C2C2C2"
  light-inspector-head-controls: "#DEDEDE"
  light-inspector-head-library: "#A6A6A6"
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
  sm: 8px
  md: 12px
  lg: 16px
  shell: 24px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  base: 8px
  shell: 8px
  shell-wide: 12px
  titlebar: 44px
  control: 36px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.control}"
    rounded: "{rounded.md}"
    height: 36px
    padding: 8px
  button-primary-hover:
    backgroundColor: "{colors.foreground}"
    textColor: "{colors.on-primary}"
  button-ghost:
    backgroundColor: transparent
    textColor: "{colors.foreground}"
    typography: "{typography.control}"
    rounded: "{rounded.md}"
    height: 36px
    padding: 8px
  button-ghost-hover:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
  button-destructive:
    backgroundColor: transparent
    textColor: "{colors.destructive}"
    typography: "{typography.control}"
    rounded: "{rounded.md}"
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
    height: 32px
  track-lane-video:
    backgroundColor: "{colors.canvas-timeline}"
    textColor: "{colors.on-muted}"
    height: 32px
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

Workspace: full-height project sidebar, unified toolbar, letterboxed preview, transport plus timeline, contextual inspector. shadcn/ui, Heroicons outline, and Motion. Map tokens onto the existing CSS variables. Do not invent a parallel component kit.

Appearance is Dark, Light, or System. Default System. System follows the OS and picks one of the two palettes. It is not a third look. Dark is the intended look. Light is the same gray, inverted, not a cream sheet.

## Colors

Unprefixed tokens are Dark. `light-*` tokens are Light. Bind both to the same CSS variables (`--background`, `--primary`, `--playhead`, …) and swap the binding with appearance. Do not sprinkle `light-*` names through components.

Neutrals are chroma-zero gray. Hue is irrelevant because chroma is 0. This is graphite and paper-white on purpose. No navy. No slate-blue. No cream. No paper warmth.

- **Primary (#F5F5F5 / #171717):** Near-white on dark, near-black on light. Primary actions and the default filled button. Never destructive red.
- **Background (#000000 / #FFFFFF):** The window shell. Caption overlay, outer padding, and the gutter between nested regions. Darker than every canvas so the rail and workspace read as inset, not as abutting slabs.
- **Canvas tones:** Nested regions earn distinct chroma-zero fills. Dark, darkest to lightest: rail `#0A0A0A`, timeline `#0C0C0C`, code `#0E0E0E`, preview `#111111`, inspector `#161616`. Light, lightest to darkest: rail `#F6F6F6`, code `#F4F4F4`, preview `#F0F0F0`, inspector `#E8E8E8`, timeline `#E0E0E0`. The rail sits on the shell. Preview, inspector, and timeline meet inside one rounded workspace. Adjacent panes inside that workspace are continuous graphite, not boxed cards. The timeline sits a step darker than the preview and inspector so clips and transport stay distinct from the picture. It is not a dark pit. Muted lane text must keep WCAG AA on that fill.
- **Foreground (#F5F5F5 / #171717):** Body text, icons, the focus ring.
- **Surface (#262626 / #D0D0D0):** Selection, ghost hover, a lifted lane or clip. Sits above the lightest dark canvas so hover still reads on every pane. Not a card.
- **Muted (#A3A3A3 / #525252):** Secondary labels, idle lane text, helper copy. Token `on-muted`.
- **Border (#2E2E2E / #E5E5E5):** Hairlines that have a job: a resize handle tick, the frame around the composition, the timeline ruler and label split, and one edge on a floating overlay. Not a box around every control. Not a rule between major regions.
- **Playhead (#EF4444 / #DC2626):** The needle. Red so it reads on gray lanes and colored clips. A 2px line and a small ruler cap. Not a button, not a row fill, not a focus ring. Not the destructive token.
- **Destructive (#F87171 / #DC2626):** Errors, invalid validate results, delete. Text, icon, or border. Not a red banner and not a timeline color.
- **Warning (#FACC15 / #CA8A04):** Validate warnings only. Yellow stays because it means warning, not because the palette is warm.
- **Chequer (#171717 + #0A0A0A / #E5E5E5 + #FAFAFA):** 8px squares behind the composition iframe when the manifest background is transparent. Two near-neutrals from this palette. No hue.
- **Inspector section heads:** Chroma-zero bars at different values so groups do not blend. Dark, darkest to lightest: controls `#222222`, composition `#2C2C2C`, marker `#363636`, clip `#424242`, library `#505050`. Light, lightest to darkest: controls `#DEDEDE`, composition `#D0D0D0`, marker `#C2C2C2`, clip `#B4B4B4`, library `#A6A6A6`. Headers only. No hue.

Playing is the needle moving, not a colored play button. Export progress is a determinate bar in background/surface/foreground. Mute is opacity plus the icon.

Focus ring is `ring`, which matches foreground. High contrast, 2px, no offset glow.

## Typography

Ship the faces. This app has to work offline. `font-src` is `'self'`. Bundle woff2. Do not load Google Fonts at runtime.

Poppins is the UI. 400 and 500 only. Pull tracking in (`-0.01em`) so the geometric width does not blow the inspector.

Rounded Nunito is the greeting. Wordmark in the titlebar. Empty-state title. Nowhere else. Inspector group names are Poppins at inspector size, distinguished by weight and space.

DM Mono owns anything that must not jitter: timecode, fps, duration, frame index, and code mode. Poppins has no tabular figures. Do not put clocks in Poppins.

Readable type. Body 14px. Labels 13px. Empty-state title 20px Nunito is the ceiling. Do not go back to 11-12px chrome.

Heroicons outline. 16px in inspector and timeline. 20px in the titlebar, sidebar, and empty state. Do not mix icon sets.

## Layout

8px scale. Control height 36px. Window chrome 44px. Inspector type 13px. Video and audio lanes 32px. Ruler 28px. Transport 56px.

The window is a deep-black shell. The project list, workspace, and inspector are three rounded nests on that shell. Preview and timeline share the middle nest. An 8px gutter (12px from 1100px wide) of shell color insets every nest and splits them from each other. Broad 20px corners on those nests, 24px from 1100px. Native caption buttons live in the unified 44px titlebar. Do not stroke the nests. The gap and the rounding are the split.

Inside the stage, preview and timeline are told apart by canvas tone. The inspector is a separate rail. Earn a hairline or a hover/selection fill only when it communicates selection, interaction, warning, or a split that spacing cannot express. Prefer spacing, alignment, typography, canvas tone, and a change in density before borders or boxes.

Idle controls do not wear a hairline. Inputs, selects, ghost actions, and inspector values sit on the canvas. Hover may lift a `surface` fill. Focus is the 2px `ring`. Selection is a fill, never a stroke around the object.

Do not wrap every section, metric, or comparison in a card. Avoid nested panels of panels. The two shells are application geometry, not dashboard tiles. Sidebar, toolbar, preview, timeline, and inspector stay layout regions. Do not add a second parallel line on an adjacent pane.

Hairlines that still have a job: a resize handle tick, the 1px frame around the composition, the timeline ruler and label split, and one edge on a floating overlay (dialog, menu, select popup). Nothing else. No titlebar rule. No box around the rail or the workspace.

**Project sidebar.** A rounded nest on the shell, `canvas-rail`, same `rounded.shell` as the workspace. Chat-list rhythm: thumbnail, name, quiet meta. Selected row is `surface` with a soft corner. New and Import project live here. A chevron retracts the rail to thumbnails; the resize handle still collapses it too. Drag a project row to reorder the list; that order is persisted. Multiple projects stay loaded; switching restores playhead, selection, and code dirty state. Padding inside the rail is 12px. Rows need air. The library sits in the leftover space under the project list: a thumbnail grid of imported assets, not a text list in the inspector. Video, audio, and still images (png, jpg, gif, webp, svg) belong here. Image tiles show the picture. Click selects. Drag a library tile onto the timeline to add it at that time and lane. Add remains as an explicit action. A new clip scrolls into view on the timeline. The project row menu is Export, Export PNG, Duplicate, Save project, and Move to trash. Import project lives in the New menu. Not Open. Not Close. Save project writes a `.automedia` snapshot. Import always creates a new library item.

**Titlebar.** One 44px row on the shell. Mark, Automedia, Export. No overflow menu. Composition settings live on the timeline. Trash lives on the project row menu. While a block is in code mode, the titlebar shows `Editing {name}` and a filled **Done** next to Export; Export drops to ghost so Done is the only primary. While an export is running, the same Export control reads Exporting and reopens the dialog. It does not grow a progress bar, a popover, or a second action. Caption inset is the left padding of this bar. No second toolbar. No Validate or Activity. No Preview / Code segmented control.

**Preview and timeline.** Stable spatial anchors inside the workspace. Preview letterbox sits on `canvas-preview`. Timeline and transport sit on `canvas-timeline`. The letterboxed composition is exact pixel size, scaled to fit, empty gutter around it. Do not pad the frame like a card. Transport is a complete set sitting on the timeline, not a single play button under the picture.

**Inspector.** `canvas-inspector`, still inside the workspace nest. Contextual to the current selection. Composition settings open a focused dialog for name, size, fps, and background. Duration is not a setting. Do not park a schema form in the inspector permanently. Do not stack accordion sections for composition, tracks, markers, runtime, and assets. Each section heading is a 36px rounded bar with its own gray fill so groups do not blend. Values are stepped, chroma zero. No hue on headers. Field labels carry a 16px Heroicon. Space between groups is 32px. Advanced stays one disclosure.

**Export.** One trigger. A focused dialog. That dialog is the whole workflow: format, quality when it applies, progress, cancel, reveal, save copy. It stays open after start. Closing it does not cancel the job. The titlebar button is how you come back. Progress is a determinate `surface`/`foreground` bar in the dialog, and again in the inspector while that composition is exporting. Finished files list only in the inspector under Exports, with the format as quiet type. If ffmpeg or ffprobe is missing, say so in quiet destructive type next to Export. Do not throw a raw `spawn ffmpeg ENOENT`. PNG stills still work. Video, still animation, and audio formats stay disabled until ffmpeg is healthy. Jobs queue; one runs at a time. The dialog names the wait.

**Resize.** Every major pane has a visible handle, min/max sizes, collapse, and persistence. The sidebar handle sits in the shell gutter. Inspector and timeline handles stay on the continuous canvas. At 800×600 keep preview, transport, and timeline; collapse sidebar to a thumbnail rail and inspector to a strip. The sidebar nest keeps its rounded corners when retracted.

Diagnose quantity separately from intensity. If the studio feels busy, remove, combine, or reorder chrome. If it feels loud, you added a surface, a color, or a motion the picture did not need.

8px chequer only behind the iframe, and only to read alpha. Letterbox gutter stays flat. No chequer on the timeline, inspector, sidebar, or titlebar.

## Elevation & Depth

None. No shadows, glass, blur, glow, frost, or fake depth. Hierarchy is solid color, type, space, nested geometry, and motion.

The shell is the darkest fill. Nested regions lift by value and by rounding. A hairline or a surface lift. Not both stacked into a floating panel.

Modal overlay is a flat `foreground/40` dim. No backdrop blur.

## Shapes

12px default (`rounded.md`). 8px on dense controls (`rounded.sm`). 16px on dialogs and posters (`rounded.lg`). Nested rail and workspace use `rounded.shell`, 20px below 1100px and 24px from there. Checkboxes are a 16px box with a 4px corner so they stay square. Radios are actually round. No `rounded-full` on buttons, badges, inputs, or chips.

Soft corners on sidebar rows, timeline clips, dialogs, and inputs. The mark is chamfered. No pills.

## Components

Use shadcn. Restyle it to these tokens. Do not fork a second button.

**Buttons.** Primary is inverted neutrals: near-white on dark, near-black on light. Ghost for everything else in the header. Destructive is ghost with destructive text. Height 36px. Hover fill snaps in, eases out. See motion below. No colored primary. No sky CTA. No outline variant in the studio. A ghost action is type, then a surface on hover.

**Inputs and selects.** Flush. No idle stroke. Inspector values sit on `surface` so the field is the object, not the label. Dialog fields may sit on `background` so they read on `popover`. Focus is `ring`, 2px, no glow. Checkboxes keep a quiet edge because an empty box has to exist. Slider thumbs are a filled `foreground` dot, not a ringed knob.

**Export.** One button. The workflow is a dialog on `popover` with a hairline `border`. Formats sit in three quiet rows: Video (MP4, WebM), Still (PNG, GIF, WebP), Audio (MP3, WAV, OGG). Row names are Poppins 14/500 muted. Format names in Poppins. Selected format is an inverted fill, not a segmented tray of boxes. Do not badge formats as pills. Do not put all eight names on one wrapping row. Do not split the button into Export plus a chevron. Do not move progress into a titlebar meter or a second popover. Missing ffmpeg is an alert in that dialog, not a crash. Quality applies to MP4, WebM, WebP, MP3, and OGG. WAV is lossless. PNG stills take the playhead. Audio export needs an unmuted audio, video, or music track and does not care about odd frame size. Odd MP4/WebM still need even width and height.

**Titlebar.** 44px window chrome on the shell. Same fill as `background`. Window drag region as already implemented. Native caption buttons sit here. The workspace toolbar is a second 44px row inside the nest, with the same control language and no bottom hairline.

**Letterbox.** Preview canvas in the gutter. Chequer only under the iframe when background is transparent. A 1px `border` around the frame so you can see its true size. Use the `border` token, never `foreground`. The frame is a size cue, not a spotlight.

**Playhead.** 2px `playhead` line through the lanes, small cap in the ruler. No easing while it tracks time. The cap and the ruler are easy to hit.

**Transport clock.** Playhead timecode and frame index sit after the transport buttons. Do not park composition length there; the transport is already full at 1280. Add music sits next to add block. It is another icon action, not a second primary. The transport stays one 56px row. Playback and the clock never shrink. When the nest cannot hold the full 36px tool cluster, fold the lowest-priority tools into one ghost More menu. Do not wrap the row. Do not shrink icons below 36px. Zoom out, zoom in, and Fit do not live on the transport. The More menu is overflow for secondary tools, not a home for zoom.

**Composition length.** The unused cell above the lane names, left of the time ruler, shows length in seconds and a Loop or Open seam readout. It stays visible when a clip is selected. Loop means the first displayed frame equals the last displayed frame. That is a seam check, not the playback loop button. No hue. Loop is foreground. Open is muted. The word is the indicator; do not add a second loop icon.

**Ruler zoom.** Zoom out, zoom in, and Fit sit on the right of the time ruler, not on the transport. The cluster is pinned (`z-30`, `h-7`, `bg-canvas-timeline`, 1px `border` on the left, `6px`/`4px` padding, `2px` gap). It does not scroll with ticks and stays visible whenever the timeline is expanded. Buttons use `icon-xs` (28px) and the same ghost treatment as transport tools. Fit is the compact `Fit` label (`xs`), not an icon. Pointer events on the cluster do not seek. The playhead can pass under the cluster; zoom stays hit-able. Mouse-wheel zoom (`ctrl` / `meta` / `alt` + wheel on the timeline surface) remains available.

**Snap guide.** When a clip edge, clip move, or marker locks to a snap target, a 1px `foreground` line appears through the ruler and lanes at that time. It is not the playhead. It is not eased. It vanishes when the drag ends.

**Timeline lanes.** Same neutrals. Video, audio, image, block, and music share one lane height. Heroicon at the lane head: speaker for audio, note for music, photo for image, play for video and visual blocks. Selected lane is `surface`, not a fill color. Mute lowers opacity. Uncolored clips are filled rounded rects: `surface` at rest, inverted `primary` when selected. A block or music clip may carry a user-assigned swatch; that color is a clip label, not chrome. Do not invent default kind colors (no audio-green, no video-blue, no music-purple). No stroke around a clip. The time ruler is pinned. It scrolls horizontally with the clips and never vertically. Clicking a lane selects or moves a clip; it does not seek. Only the ruler and the playhead cap seek. Lanes have a hairline and a 4px trough between them, plus a quiet alternate fill, so rows read as tracks. Drag a lane head to reorder tracks. Clip drag is time only. Composition length is the last clip out point. An empty timeline is 3 seconds. A new block, music, or image clip is 3 seconds, not a fill of the composition. Image stills stay muted and can be stretched past any source length. Music is unmuted so the Strudel pattern can be heard; visual blocks stay muted. Pulling or deleting the last clip shrinks the length. The field keeps empty time after the last clip so you can drop past the end. Transport includes add marker, add block, add music, and composition settings. Zoom out, zoom in, and Fit live on the ruler. Icon actions carry a tooltip. A new block or music clip starts at the playhead, or at the click when added from the timeline menu. Delete removes the selected clip. Right-clicking a clip selects it and offers edit code on a visual block or edit pattern on music, plus split and delete. Right-clicking empty lane space offers add block, add music, and add marker. Hover and selection fills on lanes snap in; they do not fade in. One hairline under the ruler, and one between the lane labels and the clip field.

**Scrollbars.** Quiet chrome. Thin pill thumbs from `foreground` at ~26% on a transparent track. Native overflow (timeline, menus) uses WebKit thumbs that stay invisible until hover. `ScrollArea` thumbs fade in on hover or while scrolling. Never leave the platform default bar in the studio.

**Inspector.** Rows, not cards. Selected row is `surface`. Labels 13px Poppins 500. Values 13px 400. Icons sit with the label, not as decoration. No divider under the inspector title. Section headings are gray bars at different values (see tokens below). Activity log is the same type, instant or a 100ms fade-out. No incoming stagger. Advanced properties sit behind one disclosure, not a stack of accordions. Range values show a tabular readout so a slider move is obvious.

**Code mode.** A focused dialog over the studio. Preview stays. Three panes, DM Mono 13px, on `canvas-code`. A column hairline if the split needs it. No boxed editors. Typing does not animate. Visual blocks only. Music never opens this dialog.

**Music mode.** A focused dialog over the studio. Preview stays. One pane for the authored Strudel pattern, DM Mono 13px, on `canvas-code`. No HTML or CSS panes. The transport, mute, volume, and meter stay managed. The inspector action is Edit pattern. Right-click offers Edit pattern on a music clip. Typing does not animate.

**Empty state.** Heroicon or the app mark. One Nunito title. One Poppins line of muted instruction. No mascot.

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
- Do not wrap the studio in cards. Do not nest panels of panels. Do not stroke idle inputs, selects, clips, sidebar rows, or toolbar actions. Do not use one background token for every region.
- Do not replace a removed border with a shadow, glow, or extra rounded tray.
- Do not use decorative grids, gradients, gradient text, glows, blobs, stripes, textures, paper, glass, colored side rails, ornamental shadows, or fake depth. A gradient is allowed only as a labelled continuous data scale. v1 chrome has none.
- Do not put a chequer anywhere except behind the composition iframe.
- Do not paint audio green and video blue. Lanes share neutrals.
- Do not restyle authored compositions from this file.
- Do not add a mascot, a grid background, or a hero wash to the empty state.
- Do maintain WCAG AA (4.5:1) for text on surfaces. The playhead is a line, not text.
- Do not use more than two Poppins weights. Nunito is wordmark and empty-state only. Do not add another sans.
- Do keep ordinary motion off the picture. Delight lives in chrome arrivals. The composition moves however its author wrote it.
- Do put composition setup in a temporary workflow. Do not leave it expanded in the inspector.
- Do show resize handles on sidebar, inspector, and timeline.
- Do give Export one coherent control, then a focused dialog.
- Do keep major regions apart with shell gutter, rounding, and canvas tone. Never with a 1px box around the pane.
