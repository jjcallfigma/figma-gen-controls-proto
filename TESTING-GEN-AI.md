# Gen-AI Integration Testing Script

Walk through each test top to bottom. Delete generated frames between tests
so each starts clean. The app runs at `http://localhost:3000`.

Status codes:
- **PASS** -- works as expected
- **DEGRADED** -- works but with issues (describe)
- **BROKEN** -- doesn't work (describe what happened)

---

## Prerequisites

1. Dev server running: `npm run dev` in the figma-clone directory
2. `.env` file has `ANTHROPIC_API_KEY=sk-ant-...`
3. Open `http://localhost:3000` in Chrome

---

## Phase 0: Verify infrastructure

### 0.1 App loads
- Open `http://localhost:3000`
- **Expect:** Figma clone loads with canvas, left nav, right properties panel
- **Status: Pass**

### 0.2 AI sidebar opens
- Click the sparkle/stars icon in the left nav bar
- **Expect:** AI assistant sidebar opens with "Good morning! What do you want to do today?"
- **Status: Pass**

### 0.3 Chat input is unified
- Look at the bottom of the AI sidebar, in the chat input area
- **Expect:** Model selector buttons (GPT-5.2, Claude) and a text input. No separate "Gen-AI" toggle -- generative prompts are automatically detected.
- **Status: Pass**

---

## Phase 1: Automatic intent routing

### 1.1 Simple circle grid (gen-ai route)
- **Setup:** Nothing selected on canvas
- **Prompt:** `Create a 5x5 grid of colorful circles`
- **Expect:** The prompt is automatically detected as generative. Loading state, then a frame with a 5x5 grid of circles appears on the canvas.
- **Verify:** Frame is selected after creation
- **Status: Pass**

### 1.2 Rectangle with controls (gen-ai route)
- **Setup:** Nothing selected
- **Prompt:** `Create a blue rectangle with controls for width, height, corner radius, and fill color`
- **Expect:** Rectangle appears on canvas with a blue fill. Detected as gen-ai due to "Create ... with controls".
- **Status: Passed**

### 1.3 Design-chat prompt (design-chat route)
- **Setup:** Select an existing element on the canvas
- **Prompt:** `Make this text bigger and bold`
- **Expect:** Routes through the normal design-chat pipeline (not gen-ai). The selected element is modified.
- **Status: skipped (not worried about this for showcase)**

### 1.4 Error handling -- empty prompt
- **Action:** Click send with empty input
- **Expect:** Nothing happens (button should be disabled)
- **Status: Passed**

---

## Phase 2: Custom Controls in Properties Panel

### 2.1 Controls section appears
- **Setup:** From test 1.1 or 1.2, the generated frame should still be on canvas
- **Action:** Select the generated frame
- **Expect:** In the right properties panel, a "Custom Controls" section appears at the bottom, showing the number of controls
- **Status: Passed**

### 2.2 Popover opens
- **Action:** Click the "Custom Controls" button
- **Expect:** A floating popover appears with FigUI3-styled control components (sliders, color pickers, etc.)
- **Verify:** The popover has a header with "Controls", a close (X) button, and a "Modify controls" link at the bottom
- **Verify:** Controls should use native Figma UI3 styling (not the old dialkit look)
- **Status: Passed**

### 2.3 Controls are interactive
- **Action:** Drag a slider or change a value in the popover
- **Expect:** The generated frame on canvas updates in response (generator re-runs)
- **Status: Passed**

### 2.4 Popover closes
- **Action:** Click the X button on the popover
- **Expect:** Popover closes, "Custom Controls" button returns to default state
- **Status: Passed**

### 2.5 Detach button
- **Action:** Click the small detach button (broken-link icon) next to "Custom Controls"
- **Expect:** The "Custom Controls" section disappears. The frame's visual output remains, but it's now a static frame with no generator attached.
- **Verify:** Deselect and reselect the frame -- "Custom Controls" should NOT reappear
- **Status: Passed** 

---

## Phase 3: Generator types

### 3.1 3D wireframe sphere
- **Setup:** Nothing selected
- **Prompt:** `Create a 3D wireframe sphere with controls for segments, stroke color, and stroke width`
- **Expect:** A wireframe sphere made of vector paths appears on canvas
- **Verify:** Controls appear in properties panel when frame is selected
- **Status: Passed**

### 3.2 Color palette
- **Setup:** Nothing selected
- **Prompt:** `Generate a color palette with 6 harmonious swatches and a control for hue rotation`
- **Expect:** Row of colored rectangles
- **Verify:** Hue rotation control changes the colors
- **Status: Degraded** Created a autolayout object which is fine.. but the gap control doesnt affect it. While i love the auto layout feature, i felt like recalulating the position allowed for more flexiblity. ie. If i create a chaos control, that wouldnt do anything here because they are pegged to the auto layout object.

### 3.3 Voronoi pattern
- **Setup:** Nothing selected
- **Prompt:** `Create a Voronoi pattern in a 400x400 frame with controls for cell count, stroke width, and background color`
- **Expect:** Voronoi cells rendered as vectors
- **Status:** the output worked and had controls, but it didnt work well. we had something similar happen with the 3d sphere that we modified the prompt and controls. i think it was due to rendering on the dom vs original figma. there was spacing between the strokes.

### 3.4 Fractal tree
- **Setup:** Nothing selected
- **Prompt:** `Create a fractal tree with controls for depth (3-8), branch angle, and trunk color`
- **Expect:** Tree shape built from vector paths
- **Status:** 

---

## Phase 4: Modify controls flow

### 4.1 Modify controls link
- **Setup:** Have a generated frame with controls from any previous test
- **Action:** Open the popover, click "Modify controls" at the bottom
- **Expect:** The message gets forwarded to the AI sidebar on the left
- **Status: Passed**

### 4.2 Add a control via AI sidebar
- **Setup:** Have a sphere or grid on canvas with controls
- **Prompt (in AI sidebar):** `Add an opacity control`
- **Expect:** The popover updates to include a new opacity slider (FigUI3-styled)
- **Status: Passed**

---

## Phase 5: Persistence

### 5.1 Reselect restores controls
- **Setup:** Create a generated frame, then click away to deselect
- **Action:** Click the generated frame again to reselect
- **Expect:** "Custom Controls" section reappears in properties panel with the same controls
- **Status: Passed**

### 5.2 Controls survive page reload
- **Setup:** Have a generated frame on canvas
- **Action:** Refresh the browser page (Cmd+R)
- **Expect:** The frame is still on the canvas. Selecting it shows "Custom Controls" section.
- **Note:** This depends on the clone's persistence model -- if the clone doesn't persist objects across reloads, mark as N/A
- **Status: Passed**

---

## Phase 6: Computational design generators

### 6.1 Strange attractor
- **Setup:** Nothing selected
- **Prompt:** `Create a Clifford strange attractor in a 400x400 frame with controls for parameters a, b, c, d (range -3 to 3), iterations (5000-50000 default 20000), and stroke color`
- **Expect:** Wispy orbital vector paths
- **Verify:** Changing parameter sliders produces different attractor shapes
- **Status: Passed**

### 6.2 Circle packing
- **Setup:** Nothing selected
- **Prompt:** `Create a circle packing pattern in a 400x400 frame with controls for circle count (10-200), min radius, max radius, and fill color`
- **Expect:** Tightly packed non-overlapping circles
- **Status: Passed**

### 6.3 Metaballs
- **Setup:** Nothing selected
- **Prompt:** `Create metaballs (5 blobs) in a 400x400 frame with controls for blob count, threshold, smoothing, and gradient color`
- **Expect:** Organic blob shapes that merge when close together
- **Status:**

---

## Phase 7: Image Grid (local hybrid)

Image grids are created locally (no LLM call) for instant results.
Follow-up control additions route through the LLM with a lean prompt.

### 7.1 Local grid creation via context menu
- **Setup:** Place 3+ images on the canvas. Select all of them.
- **Action:** Right-click → "Create Image Grid"
- **Expect:** A frame appears immediately with images arranged in a grid layout. No loading spinner, no LLM call. The Custom controls popover shows Layout (dropdown), Gap, Corner Radius, and Background controls.
- **Status:**

### 7.2 Local grid creation via AI sidebar
- **Setup:** Place 2+ images on the canvas. Select them.
- **Prompt (in AI sidebar):** `create image grid`
- **Expect:** Same instant result as 7.1. The chat shows the user message as typed (not an enriched prompt with `[IMAGE_GRID_CONTEXT...]`).
- **Status:**

### 7.3 Local grid creation via on-canvas prompt
- **Setup:** Place 2+ images on the canvas. Select them.
- **Action:** Type `create image grid` in the on-canvas AI prompt
- **Expect:** Grid appears instantly without an LLM call.
- **Status:**

### 7.4 Grid controls work
- **Setup:** From 7.1/7.2/7.3, select the created grid frame.
- **Action:** Open the Custom controls popover. Change Layout dropdown, drag Gap slider, adjust Corner Radius.
- **Expect:** The grid re-renders with the new settings. Images remain correct in each cell.
- **Status:**

### 7.5 Follow-up LLM modification
- **Setup:** Select the grid frame from a previous test.
- **Prompt (in AI sidebar):** `add a saturation control for all images`
- **Expect:** The prompt routes through the LLM (loading state visible). No "signal aborted" or 429 rate-limit errors. The controls popover gains a new saturation slider.
- **Verify:** The browser console should NOT show base64 data URLs in the request payload.
- **Status:**

### 7.6 Chat shows clean user message
- **Setup:** Select 2+ images, then type an image grid prompt in the AI sidebar.
- **Expect:** The chat bubble shows only what you typed (e.g., "create image grid"), NOT a long `[IMAGE_GRID_CONTEXT: images=[...]]` block.
- **Status:**

---

## Phase 8: Edge cases

### 8.1 Multiple frames on canvas
- **Setup:** Create two different gen-ai frames (e.g., a grid and a sphere)
- **Action:** Select the first frame, then the second
- **Expect:** "Custom Controls" section updates to show the correct controls for whichever frame is selected
- **Status:**

### 8.2 Non-gen-ai frame selected
- **Setup:** Have a gen-ai frame and a regular frame on canvas
- **Action:** Select the regular frame
- **Expect:** No "Custom Controls" section appears
- **Status:**

### 8.3 Automatic routing between design-chat and gen-ai
- **Action:** Type a design prompt like `Change the background color to blue`, then type a generative prompt like `Create a Voronoi pattern with 50 cells`
- **Expect:** The design prompt routes through design-chat. The generative prompt routes through the gen-ai pipeline. No manual mode switching needed.
- **Status:**

---

## Troubleshooting

If LLM calls fail:
1. Check browser console for errors
2. Check terminal running `npm run dev` for server-side errors
3. Verify `.env` has the correct `ANTHROPIC_API_KEY`
4. Try `curl -X POST http://localhost:3000/api/gen-ai-chat -H "Content-Type: application/json" -d '{"systemPrompt":"You are a test.","messages":[{"role":"user","content":"Say hello"}]}'` to verify the API route works

If controls don't re-run the generator:
1. Open browser console, look for `[gen-ai]` prefixed log messages
2. Check if the `genAiSpec` field is set on the frame (inspect the object in React DevTools or console)

If objects don't appear on canvas:
1. Check browser console for `[action-adapter]` errors
2. Verify the frame was created by checking the store: in console, `window.__ZUSTAND_STORE__.getState().objects`
