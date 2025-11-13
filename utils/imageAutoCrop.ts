// utils/imageAutoCrop.ts

export interface CropSuggestion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Prepares a downscaled, grayscaled, and contrast-enhanced version of the image for edge detection.
 * @param imageData The original ImageData object.
 * @returns An object containing the processed grayscale data and its dimensions.
 */
async function processImageForEdgeDetection(
  imageData: ImageData
): Promise<{ grayscale: Uint8ClampedArray; width: number; height: number }> {
  const { width, height, data } = imageData;
  const grayscale = new Uint8ClampedArray(width * height);

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    let lum = 0.299 * r + 0.587 * g + 0.114 * b;

    // A simple contrast stretch to make edges more prominent
    lum = 1.5 * (lum - 128) + 128;
    lum = Math.max(0, Math.min(255, lum));

    grayscale[i / 4] = lum;
  }
  return { grayscale, width, height };
}

/**
 * Applies the Sobel operator to a grayscale image to detect edges.
 * @param grayscale The grayscale image data.
 * @param width The width of the image.
 * @param height The height of the image.
 * @returns A new Uint8ClampedArray where pixel values represent edge magnitude.
 */
function sobel(grayscale: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const edgeData = new Uint8ClampedArray(grayscale.length);
  const sobelX = [
    [-1, 0, 1],
    [-2, 0, 2],
    [-1, 0, 1],
  ];
  const sobelY = [
    [-1, -2, -1],
    [0, 0, 0],
    [1, 2, 1],
  ];

  let maxMagnitude = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let Gx = 0;
      let Gy = 0;
      for (let ky = 0; ky < 3; ky++) {
        for (let kx = 0; kx < 3; kx++) {
          const idx = (y + ky - 1) * width + (x + kx - 1);
          const pixelValue = grayscale[idx];
          Gx += pixelValue * sobelX[ky][kx];
          Gy += pixelValue * sobelY[ky][kx];
        }
      }
      const magnitude = Math.sqrt(Gx * Gx + Gy * Gy);
      if (magnitude > maxMagnitude) {
        maxMagnitude = magnitude;
      }
      const currentIdx = y * width + x;
      edgeData[currentIdx] = magnitude;
    }
  }

  // Normalize edge data to 0-255 for easier thresholding
  if (maxMagnitude > 0) {
    for (let i = 0; i < edgeData.length; i++) {
      edgeData[i] = (edgeData[i] / maxMagnitude) * 255;
    }
  }

  return edgeData;
}

/**
 * Scans the edge data to find the bounding box of the main object.
 * @param edgeData The edge-detected image data.
 * @param width The width of the image.
 * @param height The height of the image.
 * @returns A CropSuggestion object or null if no significant object is found.
 */
function findBoundingBox(edgeData: Uint8ClampedArray, width: number, height: number): CropSuggestion | null {
  const edgePixelThreshold = 50; // A pixel is considered an edge if its magnitude is over this
  const lineDensityThreshold = 0.1; // A row/column is part of the card if its edge density is over this

  let top = -1, bottom = -1, left = -1, right = -1;

  // Find top
  for (let y = 0; y < height; y++) {
    let edgeCount = 0;
    for (let x = 0; x < width; x++) {
      if (edgeData[y * width + x] > edgePixelThreshold) edgeCount++;
    }
    if (edgeCount / width > lineDensityThreshold) {
      top = y;
      break;
    }
  }

  // Find bottom
  for (let y = height - 1; y >= 0; y--) {
    let edgeCount = 0;
    for (let x = 0; x < width; x++) {
      if (edgeData[y * width + x] > edgePixelThreshold) edgeCount++;
    }
    if (edgeCount / width > lineDensityThreshold) {
      bottom = y;
      break;
    }
  }

  // Find left
  for (let x = 0; x < width; x++) {
    let edgeCount = 0;
    for (let y = 0; y < height; y++) {
      if (edgeData[y * width + x] > edgePixelThreshold) edgeCount++;
    }
    if (edgeCount / height > lineDensityThreshold) {
      left = x;
      break;
    }
  }

  // Find right
  for (let x = width - 1; x >= 0; x--) {
    let edgeCount = 0;
    for (let y = 0; y < height; y++) {
      if (edgeData[y * width + x] > edgePixelThreshold) edgeCount++;
    }
    if (edgeCount / height > lineDensityThreshold) {
      right = x;
      break;
    }
  }

  if (top === -1 || bottom === -1 || left === -1 || right === -1 || right <= left || bottom <= top) {
    return null; // Failed to find a bounding box
  }

  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * Analyzes an image to suggest an automatic crop rectangle around a potential ID card.
 * @param imageData The ImageData object of the source image.
 * @returns A promise that resolves to a CropSuggestion or null if detection fails.
 */
export async function suggestCrop(imageData: ImageData): Promise<CropSuggestion | null> {
  return new Promise(async (resolve) => {
    try {
      // Downscale for performance
      const DOWNSCALE_WIDTH = 400;
      const originalWidth = imageData.width;
      const originalHeight = imageData.height;
      const scale = originalWidth / DOWNSCALE_WIDTH;
      const downscaleHeight = Math.round(originalHeight / scale);

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = DOWNSCALE_WIDTH;
      tempCanvas.height = downscaleHeight;
      const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
      if (!tempCtx) return resolve(null);

      const tempImage = await createImageBitmap(imageData);
      tempCtx.drawImage(tempImage, 0, 0, DOWNSCALE_WIDTH, downscaleHeight);
      const downscaledImageData = tempCtx.getImageData(0, 0, DOWNSCALE_WIDTH, downscaleHeight);

      // Process the downscaled image
      const { grayscale, width, height } = await processImageForEdgeDetection(downscaledImageData);
      const edgeData = sobel(grayscale, width, height);
      let box = findBoundingBox(edgeData, width, height);

      if (!box) {
        return resolve(null); // Detection failed
      }

      // Refine and scale back up. Add a small inner padding to avoid capturing edge noise.
      const paddingX = box.width * 0.02;
      const paddingY = box.height * 0.02;
      box.x += paddingX;
      box.y += paddingY;
      box.width -= paddingX * 2;
      box.height -= paddingY * 2;

      // Scale back to original image dimensions
      const finalCrop = {
        x: Math.round(box.x * scale),
        y: Math.round(box.y * scale),
        width: Math.round(box.width * scale),
        height: Math.round(box.height * scale),
      };

      // Final sanity check: if the crop is too small or too large, reject it.
      const minArea = (originalWidth * originalHeight) * 0.1;
      const maxArea = (originalWidth * originalHeight) * 0.98;
      const cropArea = finalCrop.width * finalCrop.height;

      if (cropArea < minArea || cropArea > maxArea) {
        return resolve(null);
      }
      
      resolve(finalCrop);
    } catch (error) {
      console.error("Error during auto-crop suggestion:", error);
      resolve(null);
    }
  });
}