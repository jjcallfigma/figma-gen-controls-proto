/**
 * WebGL-based image processing for advanced adjustments
 * Handles highlights, shadows, and better temperature/tint controls
 */

export interface WebGLImageAdjustments {
  exposure: number; // -1 to 1
  contrast: number; // -1 to 1
  saturation: number; // -1 to 1
  temperature: number; // -1 to 1
  tint: number; // -1 to 1
  highlights: number; // -1 to 1
  shadows: number; // -1 to 1
  rotation90Count?: number; // Number of 90° rotations (0, 1, 2, 3)
}

class WebGLImageProcessor {
  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private initialized = false;

  // Vertex shader with rotation support
  private vertexShaderSource = `
    attribute vec2 a_position;
    attribute vec2 a_texCoord;
    uniform float u_rotation90Count;
    varying vec2 v_texCoord;
    
    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
      
      // Apply rotation to texture coordinates
      vec2 texCoord = a_texCoord;
      float rotCount = mod(u_rotation90Count, 4.0);
      
      if (rotCount < 0.5) {
        // 0° rotation - normal
        v_texCoord = texCoord;
      } else if (rotCount < 1.5) {
        // 90° clockwise rotation - swap x,y and flip y
        v_texCoord = vec2(texCoord.y, 1.0 - texCoord.x);
      } else if (rotCount < 2.5) {
        // 180° rotation - flip both x and y
        v_texCoord = vec2(1.0 - texCoord.x, 1.0 - texCoord.y);
      } else {
        // 270° clockwise rotation - swap x,y and flip x
        v_texCoord = vec2(1.0 - texCoord.y, texCoord.x);
      }
    }
  `;

  // Fragment shader for tone mapping and color adjustments
  // Version 1.1 - Fixed contrast formula to prevent black images
  private fragmentShaderSource = `
    precision mediump float;
    
    uniform sampler2D u_image;
    uniform float u_exposure;
    uniform float u_contrast;
    uniform float u_saturation;
    uniform float u_temperature;
    uniform float u_tint;
    uniform float u_highlights;
    uniform float u_shadows;
    
    varying vec2 v_texCoord;
    
    // Color temperature conversion matrices
    const mat3 temperatureMatrix = mat3(
      1.0, 0.0, 0.0,
      0.0, 1.0, 0.0,
      0.0, 0.0, 1.0
    );
    
    // Luminance calculation
    float getLuminance(vec3 color) {
      return dot(color, vec3(0.299, 0.587, 0.114));
    }
    
    // Smooth tone mapping function
    float tonemap(float value, float shadows, float highlights) {
      // Convert shadows/highlights from -1,1 to adjustment factors
      float shadowAdjust = 1.0 + shadows * 0.5;
      float highlightAdjust = 1.0 - highlights * 0.5;
      
      // Apply shadow adjustment to dark areas
      if (value < 0.5) {
        float factor = value * 2.0; // 0-1 range for shadows
        return mix(value * shadowAdjust, value, factor);
      }
      // Apply highlight adjustment to bright areas  
      else {
        float factor = (value - 0.5) * 2.0; // 0-1 range for highlights
        return mix(value, value * highlightAdjust, factor);
      }
    }
    
    // Color temperature adjustment
    vec3 adjustTemperature(vec3 color, float temp) {
      // Simple temperature adjustment using color mixing
      // Positive temp = warmer (more red/yellow)
      // Negative temp = cooler (more blue)
      
      float warmth = temp * 0.3;
      
      if (temp > 0.0) {
        // Warmer: increase red/yellow, decrease blue
        color.r += warmth;
        color.g += warmth * 0.5;
        color.b -= warmth * 0.5;
      } else {
        // Cooler: decrease red/yellow, increase blue
        color.r += warmth; // warmth is negative
        color.g += warmth * 0.3;
        color.b -= warmth;
      }
      
      return clamp(color, 0.0, 1.0);
    }
    
    // Tint adjustment (green-magenta)
    vec3 adjustTint(vec3 color, float tint) {
      float tintAmount = tint * 0.2;
      
      if (tint > 0.0) {
        // More magenta: increase red/blue, decrease green
        color.r += tintAmount;
        color.g -= tintAmount * 0.5;
        color.b += tintAmount;
      } else {
        // More green: increase green, decrease red/blue
        color.r += tintAmount * 0.5; // tintAmount is negative
        color.g -= tintAmount;
        color.b += tintAmount * 0.5;
      }
      
      return clamp(color, 0.0, 1.0);
    }
    
    void main() {
      vec4 texColor = texture2D(u_image, v_texCoord);
      vec3 color = texColor.rgb;
      
      // 1. Apply exposure (brightness adjustment)
      if (abs(u_exposure) > 0.01) {
        float exposureFactor = pow(2.0, u_exposure * 3.0); // More realistic exposure curve
        color = color * exposureFactor;
      }
      
      // 2. Apply highlights and shadows using tone mapping
      if (abs(u_highlights) > 0.01 || abs(u_shadows) > 0.01) {
        float luminance = getLuminance(color);
        float adjustedLuminance = tonemap(luminance, u_shadows, u_highlights);
        
        // Preserve color ratios while adjusting luminance
        if (luminance > 0.0) {
          color = color * (adjustedLuminance / luminance);
        }
      }
      
      // 3. Apply contrast
      if (abs(u_contrast) > 0.01) {
        float contrastFactor = 1.0 + u_contrast;
        // Prevent complete flattening by using a minimum contrast factor
        // This ensures we don't get completely gray/black images at extreme negative values
        contrastFactor = max(contrastFactor, 0.1);
        color = ((color - 0.5) * contrastFactor) + 0.5;
      }
      
      // 4. Apply saturation
      if (abs(u_saturation) > 0.01) {
        float luminance = getLuminance(color);
        float saturationFactor = 1.0 + u_saturation;
        color = mix(vec3(luminance), color, max(saturationFactor, 0.0));
      }
      
      // 5. Apply temperature adjustment
      if (abs(u_temperature) > 0.01) {
        color = adjustTemperature(color, u_temperature);
      }
      
      // 6. Apply tint adjustment  
      if (abs(u_tint) > 0.01) {
        color = adjustTint(color, u_tint);
      }
      
      // Clamp final color to valid range
      color = clamp(color, 0.0, 1.0);
      
      gl_FragColor = vec4(color, texColor.a);
    }
  `;

  private createShader(type: number, source: string): WebGLShader | null {
    if (!this.gl) return null;

    const shader = this.gl.createShader(type);
    if (!shader) return null;

    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);

    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      console.error("Shader compile error:", this.gl.getShaderInfoLog(shader));
      this.gl.deleteShader(shader);
      return null;
    }

    return shader;
  }

  private createProgram(): WebGLProgram | null {
    if (!this.gl) return null;

    const vertexShader = this.createShader(
      this.gl.VERTEX_SHADER,
      this.vertexShaderSource
    );
    const fragmentShader = this.createShader(
      this.gl.FRAGMENT_SHADER,
      this.fragmentShaderSource
    );

    if (!vertexShader || !fragmentShader) return null;

    const program = this.gl.createProgram();
    if (!program) return null;

    this.gl.attachShader(program, vertexShader);
    this.gl.attachShader(program, fragmentShader);
    this.gl.linkProgram(program);

    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      console.error("Program link error:", this.gl.getProgramInfoLog(program));
      this.gl.deleteProgram(program);
      return null;
    }

    return program;
  }

  private setupGeometry(): void {
    if (!this.gl || !this.program) return;

    // Create quad vertices with flipped Y texture coordinates
    const positions = new Float32Array([
      // x,  y,  u,  v
      -1,
      -1,
      0,
      1, // bottom-left
      1,
      -1,
      1,
      1, // bottom-right
      -1,
      1,
      0,
      0, // top-left
      -1,
      1,
      0,
      0, // top-left
      1,
      -1,
      1,
      1, // bottom-right
      1,
      1,
      1,
      0, // top-right
    ]);

    const buffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, positions, this.gl.STATIC_DRAW);

    const positionLocation = this.gl.getAttribLocation(
      this.program,
      "a_position"
    );
    const texCoordLocation = this.gl.getAttribLocation(
      this.program,
      "a_texCoord"
    );

    this.gl.enableVertexAttribArray(positionLocation);
    this.gl.vertexAttribPointer(
      positionLocation,
      2,
      this.gl.FLOAT,
      false,
      16,
      0
    );

    this.gl.enableVertexAttribArray(texCoordLocation);
    this.gl.vertexAttribPointer(
      texCoordLocation,
      2,
      this.gl.FLOAT,
      false,
      16,
      8
    );
  }

  public async initialize(): Promise<boolean> {
    if (this.initialized) return true;

    try {
      // Create canvas
      this.canvas = document.createElement("canvas");
      this.gl = (this.canvas.getContext("webgl") ||
        this.canvas.getContext("experimental-webgl")) as WebGLRenderingContext;

      if (!this.gl) {
        console.warn("WebGL not supported, falling back to Canvas processing");
        return false;
      }

      // Create shader program
      this.program = this.createProgram();
      if (!this.program) {
        console.error("Failed to create WebGL program");
        return false;
      }

      this.setupGeometry();
      this.initialized = true;

      console.log("WebGL image processor initialized successfully");
      return true;
    } catch (error) {
      console.error("Failed to initialize WebGL processor:", error);
      return false;
    }
  }

  public async processImage(
    imageUrl: string,
    adjustments: WebGLImageAdjustments
  ): Promise<string> {
    if (!this.initialized || !this.gl || !this.program || !this.canvas) {
      throw new Error("WebGL processor not initialized");
    }

    return new Promise((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = "anonymous";

      image.onload = () => {
        try {
          // Set canvas size to match image
          this.canvas!.width = image.width;
          this.canvas!.height = image.height;
          this.gl!.viewport(0, 0, image.width, image.height);

          // Create texture from image
          const texture = this.gl!.createTexture();
          this.gl!.bindTexture(this.gl!.TEXTURE_2D, texture);
          this.gl!.texImage2D(
            this.gl!.TEXTURE_2D,
            0,
            this.gl!.RGBA,
            this.gl!.RGBA,
            this.gl!.UNSIGNED_BYTE,
            image
          );
          this.gl!.texParameteri(
            this.gl!.TEXTURE_2D,
            this.gl!.TEXTURE_WRAP_S,
            this.gl!.CLAMP_TO_EDGE
          );
          this.gl!.texParameteri(
            this.gl!.TEXTURE_2D,
            this.gl!.TEXTURE_WRAP_T,
            this.gl!.CLAMP_TO_EDGE
          );
          this.gl!.texParameteri(
            this.gl!.TEXTURE_2D,
            this.gl!.TEXTURE_MIN_FILTER,
            this.gl!.LINEAR
          );
          this.gl!.texParameteri(
            this.gl!.TEXTURE_2D,
            this.gl!.TEXTURE_MAG_FILTER,
            this.gl!.LINEAR
          );

          // Use shader program
          this.gl!.useProgram(this.program!);

          // Set uniforms for all adjustments
          const exposureLocation = this.gl!.getUniformLocation(
            this.program!,
            "u_exposure"
          );
          const contrastLocation = this.gl!.getUniformLocation(
            this.program!,
            "u_contrast"
          );
          const saturationLocation = this.gl!.getUniformLocation(
            this.program!,
            "u_saturation"
          );
          const temperatureLocation = this.gl!.getUniformLocation(
            this.program!,
            "u_temperature"
          );
          const tintLocation = this.gl!.getUniformLocation(
            this.program!,
            "u_tint"
          );
          const highlightsLocation = this.gl!.getUniformLocation(
            this.program!,
            "u_highlights"
          );
          const shadowsLocation = this.gl!.getUniformLocation(
            this.program!,
            "u_shadows"
          );
          const rotationLocation = this.gl!.getUniformLocation(
            this.program!,
            "u_rotation90Count"
          );

          this.gl!.uniform1f(exposureLocation, adjustments.exposure);
          this.gl!.uniform1f(contrastLocation, adjustments.contrast);
          this.gl!.uniform1f(saturationLocation, adjustments.saturation);
          this.gl!.uniform1f(temperatureLocation, adjustments.temperature);
          this.gl!.uniform1f(tintLocation, adjustments.tint);
          this.gl!.uniform1f(highlightsLocation, adjustments.highlights);
          this.gl!.uniform1f(shadowsLocation, adjustments.shadows);
          this.gl!.uniform1f(
            rotationLocation,
            adjustments.rotation90Count || 0
          );

          // Draw
          this.gl!.drawArrays(this.gl!.TRIANGLES, 0, 6);

          // Convert to data URL
          const dataUrl = this.canvas!.toDataURL("image/jpeg", 0.95);
          resolve(dataUrl);
        } catch (error) {
          reject(error);
        }
      };

      image.onerror = () => reject(new Error("Failed to load image"));
      image.src = imageUrl;
    });
  }

  public isSupported(): boolean {
    try {
      const canvas = document.createElement("canvas");
      const gl =
        canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
      return !!gl;
    } catch (e) {
      return false;
    }
  }

  public reset(): void {
    if (this.gl && this.program) {
      this.gl.deleteProgram(this.program);
    }
    if (this.canvas) {
      this.canvas = null;
    }
    this.gl = null;
    this.program = null;
    this.initialized = false;
  }
}

// Singleton instance
let processorInstance: WebGLImageProcessor | null = null;

export function getWebGLProcessor(): WebGLImageProcessor {
  if (!processorInstance) {
    processorInstance = new WebGLImageProcessor();
  }
  return processorInstance;
}

export function isWebGLSupported(): boolean {
  return getWebGLProcessor().isSupported();
}

export function resetWebGLProcessor(): void {
  if (processorInstance) {
    processorInstance.reset();
    processorInstance = null;
  }
}
