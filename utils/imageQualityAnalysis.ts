// utils/imageQualityAnalysis.ts

export interface ImageQualityReport {
  overallQualityScore: number; // The final weighted score, 0-100

  // Component Scores (0-100)
  sharpnessScore: number;
  lightingScore: number;
  resolutionScore: number;
  colorScore: number;

  // Raw metrics and boolean flags
  isBlurry: boolean;
  blurValue: number; // Raw Laplacian variance
  isOutOfFocus: boolean;
  focusValue: number; // Raw Gradient magnitude
  isTooDark: boolean;
  isTooBright: boolean;
  brightnessValue: number; // Raw mean luminance
  isLowContrast: boolean;
  contrastValue: number; // Raw std dev
  isLowResolution: boolean;
  resolutionWidth: number;
  resolutionHeight: number;
  isOverSaturated: boolean;
  saturationValue: number; // Raw average saturation
  isColorDistorted: boolean;
  colorDistortionValue: number; // Raw color distortion metric

  // Actionable feedback
  tips: string[];
}


// Configuration thresholds (can be adjusted empirically)
const MIN_RESOLUTION_WIDTH = 600; // Increased for better quality
const MIN_RESOLUTION_HEIGHT = 400; // Increased for better quality
const BLUR_THRESHOLD = 100; // Lower Laplacian variance means blurrier
const BLUR_OPTIMAL = 300; // A value around which we consider the image sharp
const BRIGHTNESS_LOW_THRESHOLD = 50; // Mean luminance below this is too dark
const BRIGHTNESS_HIGH_THRESHOLD = 205; // Mean luminance above this is too bright
const BRIGHTNESS_OPTIMAL = 128;
const CONTRAST_LOW_THRESHOLD = 25; // Standard deviation of luminance below this is low contrast
const CONTRAST_OPTIMAL = 60; // A good target for standard deviation
const SATURATION_HIGH_THRESHOLD = 85; // Average saturation above this might be over-saturated (0-100)
const COLOR_BALANCE_DEVIATION_THRESHOLD = 30; // Max allowed difference between avg R, G, B (0-255)
const COLOR_CLIPPING_PIXEL_PERCENT_THRESHOLD = 5; // Percentage of pixels where R, G, or B is 0 or 255
const FOCUS_GRADIENT_MAGNITUDE_THRESHOLD = 8; // Lower average gradient magnitude means out of focus. Higher is sharper.
const FOCUS_OPTIMAL = 25; // A good target for gradient magnitude


/**
 * Converts an RGB color value to HSL. Conversion formula
 * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
 * Assumes r, g, and b are contained in the set [0, 255] and
 * returns h, s, and l in the set [0, 1].
 */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s;
  const l = (max + min) / 2;

  if (max === min) {
    h = s = 0; // achromatic
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return [h, s, l];
}


/**
 * Converts ImageData to grayscale luminance values and calculates mean and standard deviation.
 * @param imageData The ImageData object.
 * @returns An object containing mean luminance, standard deviation, and the grayscale data.
 */
export function calculateLuminanceAndStdDev(imageData: ImageData): { mean: number; stdDev: number; grayscale: Uint8ClampedArray } {
  const data = imageData.data;
  const grayscale = new Uint8ClampedArray(imageData.width * imageData.height);
  let sum = 0;

  for (let i = 0; i < data.length; i += 4) {
    // Luminance formula (ITU-R BT.601)
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    grayscale[i / 4] = luminance;
    sum += luminance;
  }

  const mean = sum / grayscale.length;

  let varianceSum = 0;
  for (let i = 0; i < grayscale.length; i++) {
    varianceSum += Math.pow(grayscale[i] - mean, 2);
  }
  const stdDev = Math.sqrt(varianceSum / grayscale.length);

  return { mean, stdDev, grayscale };
}

/**
 * Estimates blurriness using the variance of the Laplacian.
 * Higher variance indicates sharper images, lower indicates blurrier.
 * @param grayscale The grayscale pixel data (Uint8ClampedArray).
 * @param width The width of the image.
 * @param height The height of the image.
 * @returns The variance of the Laplacian.
 */
export function calculateLaplacianVariance(grayscale: Uint8ClampedArray, width: number, height: number): number {
  if (width < 3 || height < 3) return 0; // Cannot apply 3x3 kernel

  // Laplacian kernel
  const kernel = [
    [0, 1, 0],
    [1, -4, 1],
    [0, 1, 0],
  ];

  const laplacianValues: number[] = [];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let sum = 0;
      for (let ky = 0; ky < 3; ky++) {
        for (let kx = 0; kx < 3; kx++) {
          const pixelIndex = (y + ky - 1) * width + (x + kx - 1);
          sum += grayscale[pixelIndex] * kernel[ky][kx];
        }
      }
      laplacianValues.push(sum);
    }
  }

  if (laplacianValues.length === 0) return 0;

  const meanLaplacian = laplacianValues.reduce((a, b) => a + b, 0) / laplacianValues.length;
  const varianceLaplacian = laplacianValues.reduce((a, b) => a + Math.pow(b - meanLaplacian, 2), 0) / laplacianValues.length;

  return varianceLaplacian;
}

/**
 * Calculates the average gradient magnitude of a grayscale image using Sobel operators.
 * Higher values indicate sharper focus.
 * @param grayscale The grayscale pixel data (Uint8ClampedArray).
 * @param width The width of the image.
 * @param height The height of the image.
 * @returns The average gradient magnitude.
 */
export function calculateGradientMagnitude(grayscale: Uint8ClampedArray, width: number, height: number): number {
  if (width < 3 || height < 3) return 0;

  let sumMagnitude = 0;
  let count = 0;

  // Sobel X kernel
  const sobelX = [
    [-1, 0, 1],
    [-2, 0, 2],
    [-1, 0, 1],
  ];

  // Sobel Y kernel
  const sobelY = [
    [-1, -2, -1],
    [0, 0, 0],
    [1, 2, 1],
  ];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let Gx = 0;
      let Gy = 0;

      for (let ky = 0; ky < 3; ky++) {
        for (let kx = 0; kx < 3; kx++) {
          const pixelIndex = (y + ky - 1) * width + (x + kx - 1);
          const pixelValue = grayscale[pixelIndex];

          Gx += pixelValue * sobelX[ky][kx];
          Gy += pixelValue * sobelY[ky][kx];
        }
      }

      const magnitude = Math.sqrt(Gx * Gx + Gy * Gy);
      sumMagnitude += magnitude;
      count++;
    }
  }

  return count > 0 ? sumMagnitude / count : 0;
}


/**
 * Analyzes the quality of an image for data extraction purposes.
 * @param imageData The ImageData object of the image to analyze.
 * @param options An object to override default analysis thresholds.
 * @returns An ImageQualityReport detailing various quality metrics and tips.
 */
export function analyzeImageQuality(
  imageData: ImageData,
  options: { blurThreshold?: number; focusThreshold?: number } = {}
): ImageQualityReport {
  const { width, height, data } = imageData;
  
  // --- RAW METRIC CALCULATIONS ---
  const { mean: brightnessValue, stdDev: contrastValue, grayscale } = calculateLuminanceAndStdDev(imageData);
  const blurValue = calculateLaplacianVariance(grayscale, width, height);
  const focusValue = calculateGradientMagnitude(grayscale, width, height);

  let sumSaturation = 0;
  let rSum = 0, gSum = 0, bSum = 0;
  let clippedPixels = 0;
  const totalPixels = width * height;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const [, s] = rgbToHsl(r, g, b);
    sumSaturation += s;
    rSum += r; gSum += g; bSum += b;
    if (r === 0 || r === 255 || g === 0 || g === 255 || b === 0 || b === 255) clippedPixels++;
  }
  const saturationValue = (sumSaturation / totalPixels) * 100;
  const avgR = rSum / totalPixels, avgG = gSum / totalPixels, avgB = bSum / totalPixels;
  const colorBalanceDeviation = Math.max(avgR, avgG, avgB) - Math.min(avgR, avgG, avgB);
  const clippedPixelPercent = (clippedPixels / totalPixels) * 100;
  const colorDistortionValue = ((colorBalanceDeviation / 255) + (clippedPixelPercent / 100)) / 2 * 100;

  // --- BOOLEAN FLAGS ---
  const effectiveBlurThreshold = options.blurThreshold ?? BLUR_THRESHOLD;
  const effectiveFocusThreshold = options.focusThreshold ?? FOCUS_GRADIENT_MAGNITUDE_THRESHOLD;
  
  const isLowResolution = width < MIN_RESOLUTION_WIDTH || height < MIN_RESOLUTION_HEIGHT;
  const isTooDark = brightnessValue < BRIGHTNESS_LOW_THRESHOLD;
  const isTooBright = brightnessValue > BRIGHTNESS_HIGH_THRESHOLD;
  const isLowContrast = contrastValue < CONTRAST_LOW_THRESHOLD;
  const isBlurry = blurValue < effectiveBlurThreshold;
  const isOutOfFocus = focusValue < effectiveFocusThreshold;
  const isOverSaturated = saturationValue > SATURATION_HIGH_THRESHOLD;
  const isColorDistorted = colorBalanceDeviation > COLOR_BALANCE_DEVIATION_THRESHOLD || clippedPixelPercent > COLOR_CLIPPING_PIXEL_PERCENT_THRESHOLD;

  // --- COMPONENT SCORES (0-100) ---
  const resolutionScore = isLowResolution ? 0 : 100;
  
  const normalizedBlur = Math.min(1, blurValue / BLUR_OPTIMAL);
  const normalizedFocus = Math.min(1, focusValue / FOCUS_OPTIMAL);
  const sharpnessScore = (normalizedBlur * 0.6 + normalizedFocus * 0.4) * 100;

  const brightnessProximity = 1 - (Math.abs(brightnessValue - BRIGHTNESS_OPTIMAL) / BRIGHTNESS_OPTIMAL);
  const normalizedBrightness = Math.max(0, brightnessProximity) * 100;
  const normalizedContrast = Math.min(1, contrastValue / CONTRAST_OPTIMAL) * 100;
  const lightingScore = (normalizedBrightness * 0.5 + normalizedContrast * 0.5);

  const colorScore = 100 - colorDistortionValue;

  // --- OVERALL WEIGHTED SCORE ---
  const overallQualityScore = 
    (sharpnessScore * 0.40) +
    (lightingScore * 0.40) +
    (resolutionScore * 0.15) +
    (colorScore * 0.05);

  // --- ACTIONABLE TIPS ---
  const tips: string[] = [];
  if (isBlurry || isOutOfFocus) {
      tips.push("Image is not sharp. Hold the camera steady and tap the screen to focus directly on the ID card's text. Ensure the camera lens is clean.");
  }
  if (isTooDark) {
      tips.push("Image is too dark. Move to a well-lit area, preferably with neutral, indirect light. Using your phone's flash may help if the room is dark.");
      if (isLowContrast) {
          tips.push("The lack of light is also causing low contrast, making text hard to read. Brighter, more direct lighting is needed.");
      }
  } else if (isTooBright) {
      tips.push("Image is overexposed or has glare. Avoid direct overhead lights or camera flash reflecting off the card. Tilting the card slightly can reduce reflections.");
  } else if (isLowContrast) {
      tips.push("Text lacks contrast. Ensure the ID is on a plain, dark surface and lit evenly without shadows across the card face.");
  }
  if (isLowResolution) {
      tips.push(`Resolution is low (${width}x${height}). Move the camera closer to ensure the ID card fills most of the frame before taking the photo.`);
  }
  if (tips.length === 0 && overallQualityScore < 90) {
      tips.push("For best results, ensure the ID is on a flat surface, in sharp focus, and evenly lit without any glare or shadows.");
  }

  return {
    overallQualityScore: parseFloat(overallQualityScore.toFixed(0)),
    sharpnessScore: parseFloat(sharpnessScore.toFixed(0)),
    lightingScore: parseFloat(lightingScore.toFixed(0)),
    resolutionScore: parseFloat(resolutionScore.toFixed(0)),
    colorScore: parseFloat(colorScore.toFixed(0)),
    isBlurry,
    blurValue: parseFloat(blurValue.toFixed(2)),
    isOutOfFocus,
    focusValue: parseFloat(focusValue.toFixed(2)),
    isTooDark,
    isTooBright,
    brightnessValue: parseFloat(brightnessValue.toFixed(2)),
    isLowContrast,
    contrastValue: parseFloat(contrastValue.toFixed(2)),
    isLowResolution,
    resolutionWidth: width,
    resolutionHeight: height,
    isOverSaturated,
    saturationValue: parseFloat(saturationValue.toFixed(2)),
    isColorDistorted,
    colorDistortionValue: parseFloat(colorDistortionValue.toFixed(2)),
    tips,
  };
}
