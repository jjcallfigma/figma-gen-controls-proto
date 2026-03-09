import { isEmptyImageUrl } from "@/core/utils/fills";
import {
  applyAdvancedAdjustments,
  shouldUseAdvancedProcessing,
} from "@/core/utils/imageProcessing";
import { ImageFill } from "@/types/canvas";
import { useEffect, useMemo, useState } from "react";

/**
 * Hook that manages processed image URLs for advanced adjustments
 * Returns the processed image URL when available, original URL as fallback
 */
export function useProcessedImageFill(fill: ImageFill): string {
  const [processedUrl, setProcessedUrl] = useState<string>(fill.imageUrl);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const { imageUrl, adjustments } = fill;

    // Skip processing for placeholder URLs
    if (isEmptyImageUrl(imageUrl)) {
      setProcessedUrl(imageUrl);
      return;
    }

    // Reset to original URL when adjustments change
    setProcessedUrl(imageUrl);

    // Check if we need advanced processing
    if (!adjustments || !shouldUseAdvancedProcessing(adjustments)) {
      return;
    }

    // Start processing
    setIsProcessing(true);

    applyAdvancedAdjustments(imageUrl, adjustments)
      .then((processedImageUrl) => {
        if (processedImageUrl !== imageUrl) {
          console.log("Advanced processing completed, updating image URL");
          setProcessedUrl(processedImageUrl);
        }
      })
      .catch((error) => {
        console.warn("Advanced processing failed:", error);
        setProcessedUrl(imageUrl); // Fallback to original
      })
      .finally(() => {
        setIsProcessing(false);
      });
  }, [
    fill.imageUrl,
    fill.adjustments?.highlights,
    fill.adjustments?.shadows,
    fill.adjustments?.temperature,
    fill.adjustments?.tint,
  ]);

  return processedUrl;
}

/**
 * Hook that manages processed image URLs for multiple fills
 */
export function useProcessedImageFills(
  fills: ImageFill[]
): Record<string, string> {
  const [processedUrls, setProcessedUrls] = useState<Record<string, string>>(
    {}
  );

  // Create a stable key for the fills to avoid infinite re-renders
  const fillsKey = useMemo(() => {
    const key = fills
      .map(
        (fill) =>
          `${fill.id}-${fill.imageUrl}-${JSON.stringify(
            fill.adjustments || {}
          )}`
      )
      .join("|");
    return key;
  }, [fills]);

  useEffect(() => {
    // Skip processing if no fills
    if (fills.length === 0) {
      setProcessedUrls({});
      return;
    }

    // Check if any fills need advanced processing
    const needsProcessing = fills.some(
      (fill) =>
        fill.adjustments && shouldUseAdvancedProcessing(fill.adjustments)
    );

    if (!needsProcessing) {
      // Create a simple mapping of fill ID to image URL (skip placeholders)
      const simpleUrls: Record<string, string> = {};
      fills.forEach((fill) => {
        // Only include non-placeholder URLs in the processed mapping
        if (!isEmptyImageUrl(fill.imageUrl)) {
          simpleUrls[fill.id] = fill.imageUrl;
        }
      });
      setProcessedUrls(simpleUrls);
      return;
    }

    console.log(
      "🎨 Advanced processing needed for fills:",
      fills
        .filter(
          (f) => f.adjustments && shouldUseAdvancedProcessing(f.adjustments)
        )
        .map((f) => ({ id: f.id, adjustments: f.adjustments }))
    );

    const updatePromises = fills.map(
      async (fill): Promise<{ id: string; url: string } | null> => {
        const { imageUrl, adjustments, id } = fill;

        // Skip placeholder URLs - return null to exclude from processed mapping
        if (isEmptyImageUrl(imageUrl)) {
          return null;
        }

        // Check if we need advanced processing
        if (!adjustments || !shouldUseAdvancedProcessing(adjustments)) {
          return { id, url: imageUrl };
        }

        try {
          const processedUrl = await applyAdvancedAdjustments(
            imageUrl,
            adjustments
          );
          return { id, url: processedUrl };
        } catch (error) {
          console.warn("Advanced processing failed for fill:", id, error);
          return { id, url: imageUrl };
        }
      }
    );

    Promise.all(updatePromises).then((results) => {
      const newProcessedUrls: Record<string, string> = {};
      results.forEach((result) => {
        // Skip null results (placeholder URLs)
        if (result) {
          const { id, url } = result;
          newProcessedUrls[id] = url;
        }
      });
      setProcessedUrls(newProcessedUrls);
    });
  }, [fillsKey]); // Use the stable key instead of the fills array

  return processedUrls;
}
