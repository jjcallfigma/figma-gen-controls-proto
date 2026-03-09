/**
 * Canvas-based image processing fallback for browsers without WebGL
 * Handles highlights, shadows, and better temperature/tint controls using pixel manipulation
 */

export interface CanvasImageAdjustments {
  exposure: number; // -1 to 1
  contrast: number; // -1 to 1
  saturation: number; // -1 to 1
  temperature: number; // -1 to 1
  tint: number; // -1 to 1
  highlights: number; // -1 to 1
  shadows: number; // -1 to 1
  rotation90Count?: number; // Number of 90° rotations (0, 1, 2, 3)
}

class CanvasImageProcessor {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;

  public async processImage(
    imageUrl: string,
    adjustments: CanvasImageAdjustments
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = "anonymous";

      image.onload = () => {
        try {
          // Create canvas if needed
          if (!this.canvas) {
            this.canvas = document.createElement("canvas");
            this.ctx = this.canvas.getContext("2d");
          }

          if (!this.ctx || !this.canvas) {
            reject(new Error("Failed to create canvas context"));
            return;
          }

          // Handle rotation
          const rotCount = (adjustments.rotation90Count || 0) % 4;
          let finalWidth = image.width;
          let finalHeight = image.height;

          // For 90° and 270° rotations, swap width and height
          if (rotCount === 1 || rotCount === 3) {
            finalWidth = image.height;
            finalHeight = image.width;
          }

          // Set canvas size
          this.canvas.width = finalWidth;
          this.canvas.height = finalHeight;

          // Apply rotation transformation and draw image
          this.ctx.save();
          this.ctx.translate(finalWidth / 2, finalHeight / 2);
          this.ctx.rotate((-rotCount * 90 * Math.PI) / 180); // Negative for clockwise
          this.ctx.drawImage(image, -image.width / 2, -image.height / 2);
          this.ctx.restore();

          // Get image data
          const imageData = this.ctx.getImageData(
            0,
            0,
            image.width,
            image.height
          );
          const data = imageData.data;

          // Process pixels
          this.processPixels(data, adjustments);

          // Put processed data back
          this.ctx.putImageData(imageData, 0, 0);

          // Convert to data URL
          const dataUrl = this.canvas.toDataURL("image/jpeg", 0.95);
          resolve(dataUrl);
        } catch (error) {
          reject(error);
        }
      };

      image.onerror = () => reject(new Error("Failed to load image"));
      image.src = imageUrl;
    });
  }

  private processPixels(
    data: Uint8ClampedArray,
    adjustments: CanvasImageAdjustments
  ): void {
    for (let i = 0; i < data.length; i += 4) {
      // Get RGB values (0-255)
      let r = data[i] / 255;
      let g = data[i + 1] / 255;
      let b = data[i + 2] / 255;

      // 1. Apply exposure
      if (Math.abs(adjustments.exposure) > 0.01) {
        const exposureFactor = Math.pow(2.0, adjustments.exposure * 3.0);
        r *= exposureFactor;
        g *= exposureFactor;
        b *= exposureFactor;
      }

      // 2. Apply highlights and shadows
      if (
        Math.abs(adjustments.highlights) > 0.01 ||
        Math.abs(adjustments.shadows) > 0.01
      ) {
        const luminance = this.getLuminance(r, g, b);
        const adjustedLuminance = this.adjustTones(
          luminance,
          adjustments.shadows,
          adjustments.highlights
        );

        // Preserve color ratios while adjusting luminance
        if (luminance > 0) {
          const ratio = adjustedLuminance / luminance;
          r *= ratio;
          g *= ratio;
          b *= ratio;
        }
      }

      // 3. Apply contrast
      if (Math.abs(adjustments.contrast) > 0.01) {
        const contrastFactor = 1.0 + adjustments.contrast;
        // Prevent complete flattening by using a minimum contrast factor
        // This ensures we don't get completely gray/black images at extreme negative values
        const clampedFactor = Math.max(contrastFactor, 0.1);
        r = (r - 0.5) * clampedFactor + 0.5;
        g = (g - 0.5) * clampedFactor + 0.5;
        b = (b - 0.5) * clampedFactor + 0.5;
      }

      // 4. Apply saturation
      if (Math.abs(adjustments.saturation) > 0.01) {
        const luminance = this.getLuminance(r, g, b);
        const saturationFactor = 1.0 + adjustments.saturation;
        const factor = Math.max(saturationFactor, 0.0);
        r = this.lerp(luminance, r, factor);
        g = this.lerp(luminance, g, factor);
        b = this.lerp(luminance, b, factor);
      }

      // 5. Apply temperature adjustment
      if (Math.abs(adjustments.temperature) > 0.01) {
        [r, g, b] = this.adjustTemperature(r, g, b, adjustments.temperature);
      }

      // 6. Apply tint adjustment
      if (Math.abs(adjustments.tint) > 0.01) {
        [r, g, b] = this.adjustTint(r, g, b, adjustments.tint);
      }

      // Clamp and convert back to 0-255
      data[i] = Math.max(0, Math.min(255, r * 255));
      data[i + 1] = Math.max(0, Math.min(255, g * 255));
      data[i + 2] = Math.max(0, Math.min(255, b * 255));
      // Alpha channel (data[i + 3]) remains unchanged
    }
  }

  private getLuminance(r: number, g: number, b: number): number {
    return 0.299 * r + 0.587 * g + 0.114 * b;
  }

  private adjustTones(
    luminance: number,
    shadows: number,
    highlights: number
  ): number {
    // Convert shadows/highlights from -1,1 to adjustment factors
    const shadowAdjust = 1 + shadows * 0.5;
    const highlightAdjust = 1 - highlights * 0.5;

    // Apply shadow adjustment to dark areas
    if (luminance < 0.5) {
      const factor = luminance * 2; // 0-1 range for shadows
      return this.lerp(luminance * shadowAdjust, luminance, factor);
    }
    // Apply highlight adjustment to bright areas
    else {
      const factor = (luminance - 0.5) * 2; // 0-1 range for highlights
      return this.lerp(luminance, luminance * highlightAdjust, factor);
    }
  }

  private adjustTemperature(
    r: number,
    g: number,
    b: number,
    temperature: number
  ): [number, number, number] {
    const warmth = temperature * 0.3;

    if (temperature > 0) {
      // Warmer: increase red/yellow, decrease blue
      r += warmth;
      g += warmth * 0.5;
      b -= warmth * 0.5;
    } else {
      // Cooler: decrease red/yellow, increase blue
      r += warmth; // warmth is negative
      g += warmth * 0.3;
      b -= warmth;
    }

    return [
      Math.max(0, Math.min(1, r)),
      Math.max(0, Math.min(1, g)),
      Math.max(0, Math.min(1, b)),
    ];
  }

  private adjustTint(
    r: number,
    g: number,
    b: number,
    tint: number
  ): [number, number, number] {
    const tintAmount = tint * 0.2;

    if (tint > 0) {
      // More magenta: increase red/blue, decrease green
      r += tintAmount;
      g -= tintAmount * 0.5;
      b += tintAmount;
    } else {
      // More green: increase green, decrease red/blue
      r += tintAmount * 0.5; // tintAmount is negative
      g -= tintAmount;
      b += tintAmount * 0.5;
    }

    return [
      Math.max(0, Math.min(1, r)),
      Math.max(0, Math.min(1, g)),
      Math.max(0, Math.min(1, b)),
    ];
  }

  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }
}

// Singleton instance
let canvasProcessorInstance: CanvasImageProcessor | null = null;

export function getCanvasProcessor(): CanvasImageProcessor {
  if (!canvasProcessorInstance) {
    canvasProcessorInstance = new CanvasImageProcessor();
  }
  return canvasProcessorInstance;
}
