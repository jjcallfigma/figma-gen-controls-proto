/**
 * Shared intent detection for gen-ai routing.
 *
 * Used by all prompt entry points (on-canvas prompt, sidebar design chat,
 * Make chat views) to decide whether a user message should be routed through
 * the gen-ai pipeline instead of the design-chat or Make pipeline.
 */

import type { CanvasObject, ImageFill } from "@/types/canvas";

/**
 * Returns true if the message looks like a request to arrange selected images
 * into a grid layout.
 */
export function isImageGridIntent(text: string): boolean {
  const lower = text.toLowerCase();
  return /\b(image|photo|picture)\s*(grid|collage|layout|mosaic|montage)\b/i.test(lower) ||
    /\bgrid\b.*\b(image|photo|picture|these)s?\b/i.test(lower) ||
    /\b(image|photo|picture)s?\b.*\b(grid|in\s+a\s+grid)\b/i.test(lower) ||
    /\b(create|make|build|arrange|lay\s*out)\b.*\b(grid|collage|mosaic)\b/i.test(lower);
}

export interface ImageGridImageData {
  id: string;
  url: string;
  width: number;
  height: number;
}

/**
 * Extracts image data from selected objects (checks direct fills and one level
 * of children). Returns an array of image data objects for prompt enrichment.
 */
export function extractImageDataForGrid(
  selectedIds: string[],
  objects: Record<string, CanvasObject>,
): ImageGridImageData[] {
  const images: ImageGridImageData[] = [];
  for (const id of selectedIds) {
    const obj = objects[id];
    if (!obj) continue;
    const imgFill = obj.fills?.find(
      (f): f is ImageFill => f.type === "image" && f.visible !== false,
    );
    if (imgFill) {
      images.push({
        id: obj.id,
        url: imgFill.imageUrl,
        width: imgFill.imageWidth ?? Math.round(obj.width),
        height: imgFill.imageHeight ?? Math.round(obj.height),
      });
      continue;
    }
    for (const cid of obj.childIds ?? []) {
      const child = objects[cid];
      if (!child) continue;
      const childImgFill = child.fills?.find(
        (f): f is ImageFill => f.type === "image" && f.visible !== false,
      );
      if (childImgFill) {
        images.push({
          id: child.id,
          url: childImgFill.imageUrl,
          width: childImgFill.imageWidth ?? Math.round(child.width),
          height: childImgFill.imageHeight ?? Math.round(child.height),
        });
        break;
      }
    }
  }
  return images;
}

/**
 * Stores the URL mapping from the most recent image grid enrichment,
 * keyed by image ID. Used to substitute placeholders in the LLM's
 * generated code before compilation.
 */
let _pendingImageUrls: Record<string, string> = {};

export function getPendingImageUrls(): Record<string, string> {
  return _pendingImageUrls;
}

export function clearPendingImageUrls(): void {
  _pendingImageUrls = {};
}

/**
 * Enriches a user prompt with image grid context so the LLM can generate
 * the correct genAiSpec with controls and a generator. URLs are stored
 * separately (not in the prompt) to avoid bloating the token count.
 * The LLM uses placeholder URLs like "__IMG_<id>__" which are substituted
 * with real URLs before the generator compiles.
 */
export function enrichImageGridPrompt(
  userMessage: string,
  images: ImageGridImageData[],
): string {
  _pendingImageUrls = {};
  const imageDescriptions: string[] = [];
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const placeholderUrl = `__IMG_${i}__`;
    _pendingImageUrls[placeholderUrl] = img.url;
    imageDescriptions.push(`{id:"img${i}",url:"${placeholderUrl}",w:${img.width},h:${img.height}}`);
  }
  return (
    `[IMAGE_GRID_CONTEXT: images=[${imageDescriptions.join(",")}]. ` +
    `Use the image grid generator pattern from the system prompt. ` +
    `Choose a layout that fits ${images.length} images. ` +
    `The url values are placeholders — they will be resolved at runtime.]\n\n` +
    userMessage
  );
}

/**
 * Returns true if the message text looks like a request to generate or modify
 * parametric/generative content — i.e. something the gen-ai pipeline handles.
 *
 * The check is intentionally broad: when a gen-ai object is already selected
 * (`selectedHasGenAi`), callers should skip this check and always route to
 * gen-ai regardless.
 */
export function isGenAiIntent(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    // "create/generate/make/build/draw <generative shape or pattern>"
    /\b(create|generate|make|build|draw)\b.*\b(grid|pattern|dots|circle|rectangle|square|ellipse|shape|line|triangle|polygon|sphere|cube|fractal|tree|voronoi|halftone|palette|swatches|gradient|spiral|scatter|wavy|noise|organic|mosaic|blob|attractor|metaball|turing|reaction.?diffusion|circle.?pack|dla|cellular.?automata|wave.?function|qr|chart|bar.?chart|pie|dither|posterize|flow.?field|wireframe|3d|superformula|rough|sketch|lsystem|l-system)\b/i.test(
      lower,
    ) ||
    // "generate/create/make/build … with controls/sliders/parameters"
    /\b(generate|create|make|build)\b.*\bwith\b.*\b(controls?|sliders?|parameters?)\b/i.test(
      lower,
    ) ||
    // Modify-control phrases: "add/remove/change/update … control/slider/parameter"
    /\b(add|remove|delete|change|update|modify)\b.*\b(controls?|sliders?|parameters?|inputs?|handles?)\b/i.test(
      lower,
    ) ||
    // Explicit generative adjectives
    /\b(generative|procedural|parametric|computational)\b/i.test(lower)
  );
}
