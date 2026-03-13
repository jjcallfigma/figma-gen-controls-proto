# Switches Native — Demo Script

**Audience:** Design/engineering team (some saw the plugin demo, some didn't)
**Duration:** ~5 minutes
**Setup:** App open in browser. Three photos dropped on canvas for the image grid moment. One designed card/component for auto-generate. Canvas otherwise clean — you build the hero live.
**Link the plugin demo** at the top of the deck/post so newcomers can watch it first if they want. Don't re-explain the plugin version in this video.

---

## The premise (for newcomers)

One line in your opening covers it. Anyone who hasn't seen the first demo gets enough context to follow. Anyone who has gets a reason to keep watching.

---

## Prep

| Item | What to prepare | Why |
|---|---|---|
| **Three photos** | Drop 3 high-quality images on the canvas (different subjects, good color). Don't group them. | Image grid moment — the local generator needs 2+ images as input |
| **Designed card** | A card with fills, corner radius, shadow, text — something with 4-5 tweakable properties | Auto-generate target |
| **Premade: layered shadow** | "Create a card with a layered drop shadow system — four stacked shadows with incrementing offset, blur, and spread. One slider controls the overall depth and scales all four layers together" | Sweep moment — practical, one-knob orchestration |
| **Premade: scattered circles** | "Scatter 60 circles in a 400×400 frame. Add an xy-pad for drift, a range slider for size variation, and a gradient bar for color ramp" | Sweep moment — shows exotic control types (xy-pad, gradient bar, range) |

---

## 1 · Opening — the 3D moment (75 seconds)

> "Last time I showed Switches as a Figma plugin — AI that writes design tools on the fly. Today: what happens when that's not bolted on. When it's native."

Empty canvas. Nothing on it. Open the AI sidebar. Type:

**"Create a blue 3D torus wireframe with 3D rotation controls"**

The AI shimmer pulses on-canvas as the response streams. A wireframe torus materializes — dozens of vector paths forming a full 3D shape.

Controls appear in the properties panel: a **3D rotation cube**, segment sliders, a color picker.

Grab the 3D cube preview. Rotate. The torus re-renders live — every wireframe line recalculates, every face redraws.

**Hold here. Rotate slowly. Say nothing. Let the room absorb that a design tool just rendered 3D geometry from a sentence.**

Bump the segments slider up. The wireframe gets denser, more refined. Pull it down — coarser, more angular.

Change the color. The entire torus recolors.

> "One sentence. A full 3D projection. Every line is a native vector — select one, edit the points, export it. And the 3D cube you're dragging? That's a control that was written thirty seconds ago."

**Pause. Two beats of silence.**

---

## 2 · The persistence reveal (20 seconds)

Click away. Deselect. The canvas is quiet — just the torus sitting there.

Click the torus frame again.

Controls come back. Exactly as you left them. Grab the 3D cube — still works.

> "The controls live on the object. Close the file, reopen it, share it with someone — the tool comes with the layer."

---

## 3 · Iterate — the tool grows (30 seconds)

Stay on the torus. Type into the sidebar:

**"Add a slider for tube thickness"**

New control appears below the others. Drag it — the torus fattens, thins.

> "Each prompt refines the tool. The AI rewrites the generator while preserving everything you already built."

---

## 4 · Image grid — the local generator (60 seconds)

This is the moment that shows the hybrid model. AI writes the program; the program runs locally.

Select the three photos on the canvas.

Click the star on the selection. Type: **"Image grid"**

No loading spinner. No API call. The grid appears instantly — three images snapped into a layout with rounded corners and a gap.

Controls appear in the properties panel: a **grid selector** (six thumbnail layout options in a 2×3 grid), a **gap slider**, a **corner radius slider**, and a **background color picker**.

Click a different layout thumbnail. The images rearrange instantly.

Drag the gap slider. Spacing adjusts in real time.

> "This ran locally. No LLM call. The generator for image grids was written once — and now it just runs. Different layout, different gap, different radius — all instant."

Click another layout. Then another. The speed is the point — no spinners, no waiting.

> "Some tools need the AI to write them. Others are built in. The experience is the same — controls in the panel, generators on the layer."

---

## 5 · Quick sweep (40 seconds)

> "Let me show you a couple more."

Click the premade scattered circles. Drag the **xy-pad** — all 60 circles shift as if blown by wind. Widen the **range slider** — size variation stretches. Drag a stop on the **gradient bar** — circle colors shift along the ramp.

> "An xy-pad, a range slider, a gradient bar. Controls that have never existed in a design tool — because they didn't need to until someone asked."

Click the layered shadow card. Drag the depth slider. Four shadows scale together — offset, blur, spread all move in concert.

> "Four shadows. One slider. A control no design tool will ever ship — because it's specific to this card."

**Pause. Two beats of silence.**

---

## 6 · Auto-generate (40 seconds)

Select the designed card already on the canvas. No prompt.

In the properties panel, the "Custom" section header has a small **+** button. Click it.

The AI shimmer activates. A few seconds later, controls appear — fill color, corner radius, shadow blur, maybe padding — all wired to the actual properties of the card.

Drag a slider. The card updates live.

> "You didn't describe anything. You selected something you already designed, hit plus, and the AI reverse-engineered the controls. No prompt needed."

---

## 7 · Close (15 seconds)

> "A plugin explores the idea. Native makes it real. The prompt is on the canvas. The controls are in the panel. The generators run locally. This is what design tools look like when AI isn't a sidebar — it's the surface."

---

## Presenter notes

- **Section 1 is the keynote moment.** A 3D wireframe torus from one sentence. The silence after the first rotation is where the audience processes what they saw. Don't rush. Jobs held these beats — you should too. If the LLM call takes a few seconds, fill with: "The AI is writing the generator — after this, every interaction is instant."
- **Section 2 (persistence) reframes everything.** The audience shifts from "cool demo" to "this lives on the object." Land it clean, then move on.
- **Section 3 proves the tool is real.** You iterated on the torus live — adding thickness control — so the audience knows it wasn't canned before you show premades.
- **Section 4 (image grid) is the speed moment.** The instant response — no loading, no API call — is visually obvious. Click layouts rapidly. The speed contrast with the LLM-generated torus sells the hybrid model without you explaining the architecture.
- **Section 5 sweep is fast.** Two premades, 20 seconds each. You earned the right to go fast — they already believe. The xy-pad and gradient bar on the circles are visually novel controls that land quickly.
- **Section 6 flips the model.** Prompt → tool for 4 minutes. Then: no prompt. "One more thing" energy.
- **If something breaks**, the sidebar has `/clear` to reset. Have backup premades ready.
- **Keep the properties panel visible** throughout. The controls appearing there — not in a plugin popover — is the visual proof of "native."

---

## Timing budget

| Section | Target | Cumulative |
|---|---|---|
| Opening + 3D torus creation | 1:15 | 1:15 |
| Persistence reveal | 0:20 | 1:35 |
| Iterate (tube thickness) | 0:30 | 2:05 |
| Image grid (local generator) | 1:00 | 3:05 |
| Sweep (2 premades) | 0:40 | 3:45 |
| Auto-generate | 0:40 | 4:25 |
| Close | 0:15 | 4:40 |
| **Buffer** | 0:20 | **5:00** |

---

## The arc

```
"What if it's native?" (premise)
  → 3D wireframe from a sentence — the wow (creation)
    → click away, click back — it's still there (persistence)
      → "add tube thickness" — the tool grows (iterate)
        → image grid — instant, no LLM needed (local generator)
          → xy-pad, gradient bar, layered shadows (sweep)
            → no prompt needed (auto-generate)
              → "this is the surface, not the sidebar"
```

---

## How this differs from the plugin demo

| Plugin demo | This demo |
|---|---|
| Opens with scattered circles (2D) | Opens with 3D torus wireframe — bigger wow |
| Plugin window floats over Figma | Controls live in the properties panel |
| Plugin marketplace framing ("discovery is broken") | Native framing ("what if it's built in?") |
| 6 premade sweep | 2 premade sweep (earned faster) |
| No local generators shown | Image grid: instant, no LLM call |
| Prompt typed into plugin input | Prompt in the sidebar chat or on-canvas star |
| Persistence = "it's the layer's plugin" | Persistence = implicit (it's just properties) |
| Auto-generate at the end | Auto-generate at the end (same beat) |
