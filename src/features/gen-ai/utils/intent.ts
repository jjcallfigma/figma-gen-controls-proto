/**
 * Shared intent detection for gen-ai routing.
 *
 * Used by all prompt entry points (on-canvas prompt, sidebar design chat,
 * Make chat views) to decide whether a user message should be routed through
 * the gen-ai pipeline instead of the design-chat or Make pipeline.
 */

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
