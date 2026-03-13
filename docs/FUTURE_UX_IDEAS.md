# Switches — Future UX Ideas

Raw ideas for where the experience could go. Some are near-term, some are moonshots. All should feel like magic.

---

## 1 · The AI Cursor

While the LLM is thinking, an AI cursor appears on the canvas — a distinct pointer with a subtle glow. It moves to where the frame will be created and draws the bounding box live, as if a ghost collaborator just sat down next to you. Objects start appearing inside the frame as the response streams: rectangles fade in, circles scatter into position, vectors trace themselves.

The generation isn't instant — but it doesn't feel like waiting. It feels like watching someone build.

**Why it's magic:** The loading state becomes the show. The user sees *where* the AI is working, *what* it's building, and *how* it thinks. No spinner. No progress bar. A collaborator.

**Variant — the drawing hand:** For generative/artistic prompts (fractal tree, scatter pattern), the AI cursor could animate the drawing process — trunk first, then branches, then leaves. Each vector path traces in sequence. The final result is the same, but the reveal is choreographed.

---

## 2 · Controls in the Chat

When the AI generates a plugin, the controls don't only appear in the properties panel — a compact version appears inline in the chat thread, right below the AI's response message. You can drag a slider in the conversation and the canvas updates live.

The chat becomes a living document. Scroll up to a previous generation, and its controls are still there, still wired. You're not just reading history — you're interacting with it.

**Why it's magic:** The chat stops being a log and becomes a workbench. The conversation *is* the tool.

**Extension — shareable chat:** Export the chat as a link. The recipient sees the conversation with working controls, no canvas needed. A PM adjusts a slider and sees the design change in a preview. Design review becomes a conversation you can touch.

---

## 3 · Ghost Preview (Type-Ahead on Canvas)

As you type a prompt — before you hit enter — a ghosted, semi-transparent preview appears on canvas showing a rough approximation of what will be generated. The preview updates as you type, getting more specific as your prompt clarifies.

Type "scatter" → ghost dots appear. Add "circles" → dots become circles. Add "in a 500×500 frame" → a ghost frame bounds them. Hit enter and the ghost solidifies into the real thing.

**Why it's magic:** The prompt feels responsive, not fire-and-forget. You're shaping the result before the LLM even runs. The moment between typing and generating disappears.

**Technical angle:** This doesn't need the LLM. A local heuristic parser reads keywords (shape types, sizes, counts, colors) and renders placeholder geometry. The LLM replaces it with the real result. If the heuristic was close, the transition is seamless. If it was wrong, the real result snaps in — still feels responsive.

---

## 4 · Teach by Example

Make the same manual adjustment three times — corner radius on three different cards, shadow depth on three layers, padding on three frames — and a subtle prompt appears:

> "You've adjusted corner radius 3 times. Want a control for it?"

Click yes. The AI observes the range of values you used (8px, 12px, 16px), creates a slider with that range, and wires it to all three objects.

No prompt. No description. The AI learned from your behavior.

**Why it's magic:** The tool watches how you work and offers to automate the pattern it sees. You never asked for help. It noticed.

**Extension — gesture recording:** Start a recording mode. Make a sequence of edits — resize, recolor, reposition. Stop recording. The AI turns the sequence into a generator with controls for the parameters you varied. A macro system that writes itself.

---

## 5 · Control Breeding

Two generated objects on canvas. Each has its own controls. Drag one control panel onto the other (or select both and hit a "merge" command).

The AI combines the two generators. A fractal tree's branching parameters + a scatter pattern's color ramp = a fractal tree with gradient-colored branches. The controls from both appear in a unified panel, and the generator handles the intersection.

**Why it's magic:** Generative design becomes compositional. You're not just building tools — you're combining them. The whole is more than the sum.

**Variant — style transfer between generators:** Select a generated object you like. Select a different generated object. "Apply the color logic from this one to that one." The AI reads the first object's color-related controls and rewrites the second object's generator to use the same approach.

---

## 6 · The Design DJ (Cross-Fader)

Generate two variations of the same concept — say, a pattern with warm colors and one with cool colors, or a layout with tight spacing and one with loose spacing.

A cross-fader control appears. Drag it left → warm/tight. Drag it right → cool/loose. The middle positions interpolate between the two states. All control values blend smoothly.

**Why it's magic:** You're not choosing A or B. You're exploring the space between them. Design becomes continuous, not discrete.

**Extension — the mood wheel:** Instead of two endpoints, map four generated variations to the corners of an xy-pad. Drag the crosshair to blend between all four. Top-left is "minimal and dark." Bottom-right is "playful and bright." Every position is a unique interpolation.

---

## 7 · Canvas-Aware Ambient Suggestions

The AI quietly observes your canvas. When it notices patterns — four cards with different shadows, a row of icons with inconsistent sizing, text blocks with varying line heights — a subtle indicator appears in the properties panel:

> "4 cards selected. Unify shadow depth?"

Click it. One slider. All four shadows now move together.

Not a chatbot. Not a prompt. The AI is a design assistant that notices what you haven't noticed yet.

**Why it's magic:** The AI isn't waiting for instructions. It's paying attention. The suggestions are specific to *your* canvas, *your* design, right now.

**Guard rails:** Suggestions appear only on explicit selection (not constantly). Dismissing a suggestion teaches the system. Never more than one suggestion at a time. Quiet, not noisy.

---

## 8 · Prompt-from-Reference

Drop a screenshot — from Dribbble, a competitor's app, a photo of a whiteboard sketch. The AI reverse-engineers it into a parametric frame with controls.

Not a pixel-perfect copy. A *controllable* version. The screenshot becomes a starting point. Adjust the controls to make it yours.

**Why it's magic:** The gap between "I want something like this" and "I have something I can shape" collapses to a drag-and-drop.

**Variant — prompt-from-selection:** Select three objects you've already designed. "Make more like these." The AI infers the pattern (spacing rhythm, color palette, sizing logic) and generates a parametric system that can produce more of the same — plus controls to vary it.

---

## 9 · Spatial / Physical Controls

Tilt your laptop. The xy-pad responds. Accelerometer data maps to the crosshair position. The scatter pattern shifts with gravity.

On mobile/tablet: pinch to control the range slider. Two-finger rotate for the angle dial. The controls map to gestures that feel physical.

**Why it's magic:** The boundary between the control and the body dissolves. You're not dragging a virtual crosshair — you're tilting the canvas.

**Simpler first step:** Arrow keys control the focused xy-pad. Hold shift for fine adjustment. Scroll wheel on a slider for precision. Keyboard-first power-user flow before going full spatial.

---

## 10 · The Replay Button

After generating something complex — the 3D torus, a fractal tree, a 200-cell Voronoi — a small "replay" button appears on the frame.

Click it. The frame clears and the creation process replays as an animation: the frame draws itself, objects appear in sequence, colors fill in, the final result assembles like a time-lapse of someone building it.

**Why it's magic:** The creation process becomes shareable content. Record the replay as a video. Post it. The tool generates its own making-of.

**Extension — step-through mode:** Instead of a continuous replay, step through the generator's actions one by one. See each `createRectangle`, each `setFill`, each position change. The generator becomes a teaching tool — you see how the AI thought about construction order.

---

## 11 · Multi-User Control Handoff

Share a link to just the controls panel — no canvas, no design tool. A standalone page with sliders, pickers, and a live preview of the affected frame.

A PM opens the link on their phone during a review. They drag a slider. On your screen, the canvas updates in real-time. They're adjusting the design without opening a design tool.

**Why it's magic:** The audience for a design control expands beyond designers. Anyone with a link can shape the output. Design review becomes a remote control.

**Guard rails:** The sharer sets which controls are exposed. Some controls are locked (structural), some are open (cosmetic). The canvas owner sees an indicator when someone is remotely adjusting.

---

## 12 · Bidirectional Attention

Hover over a control in the panel. The canvas elements it affects highlight — a gentle pulse or outline.

Hover over an element on canvas. The control(s) that affect it highlight in the panel.

Click a canvas element. The relevant control scrolls into view and briefly glows.

**Why it's magic:** You always know the relationship between the control and the canvas. The two sides of the interface are linked, not adjacent. Understanding is spatial, not verbal.

**Extension — drag from canvas to panel:** Grab a property directly on canvas (a shadow, a fill, a corner radius) and drag it into the controls panel. A new slider appears, pre-wired to that property. The panel becomes a drop target for anything you want to control.

---

## 13 · The "What If" Fork

Select a generated frame. Hit a "fork" command. The frame duplicates into 2–4 side-by-side variations, each with its own control panel.

Adjust one variation's color. Adjust another's spacing. Compare them live, side by side. Pick the one you like — or merge properties from multiple forks back into one.

**Why it's magic:** Exploration becomes parallel, not sequential. You're not undoing and retrying — you're seeing all the options at once.

**Extension — auto-vary:** Fork into 4 variations and tell the AI "vary the color palette." It generates four distinct palettes across the forks. You compare. Pick one. Or say "vary the spacing" and it fans out four spacing options. Rapid design exploration without writing a single prompt.

---

## Priority gut-check

| Idea | Wow factor | Build complexity | Near-term? |
|---|---|---|---|
| AI Cursor | Very high | Medium | Yes |
| Controls in Chat | High | Medium | Yes |
| Ghost Preview | Very high | Medium-High | Maybe |
| Teach by Example | High | High | No |
| Control Breeding | Very high | Very high | No |
| Design DJ | High | High | No |
| Ambient Suggestions | Medium-High | Medium | Maybe |
| Prompt-from-Reference | Very high | High | No |
| Spatial Controls | Medium | Medium | Maybe |
| Replay Button | High | Low-Medium | Yes |
| Multi-User Handoff | Very high | High | No |
| Bidirectional Attention | Medium-High | Medium | Yes |
| "What If" Fork | High | High | No |
