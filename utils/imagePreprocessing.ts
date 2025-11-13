// utils/imagePreprocessing.ts

export interface ProcessedImageOutput {
  ocrOptimizedPng: string; // The B&W image as base64 PNG (HD)
  thumbnailJpeg: string;   // A smaller JPEG thumbnail of the B&W image
}

const THUMBNAIL_WIDTH = 200;

/**
 * Applies a median filter to reduce salt-and-pepper noise from grayscale image data.
 * @param grayscale The source grayscale data.
 * @param width The width of the image.
 * @param height The height of the image.
 * @param kernelSize The size of the median kernel (e.g., 3 for a 3x3 window). Must be odd.
 * @returns The noise-reduced grayscale data.
 */
function applyMedianFilter(grayscale: Uint8ClampedArray, width: number, height: number, kernelSize: number = 3): Uint8ClampedArray {
  const result = new Uint8ClampedArray(grayscale.length);
  const halfKernel = Math.floor(kernelSize / 2);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const window: number[] = [];
      // Iterate over the kernel window
      for (let ky = -halfKernel; ky <= halfKernel; ky++) {
        for (let kx = -halfKernel; kx <= halfKernel; kx++) {
          // Clamp coordinates to be within image bounds
          const newY = Math.min(height - 1, Math.max(0, y + ky));
          const newX = Math.min(width - 1, Math.max(0, x + kx));
          window.push(grayscale[newY * width + newX]);
        }
      }
      // Sort the window and pick the median value
      window.sort((a, b) => a - b);
      result[y * width + x] = window[Math.floor(window.length / 2)];
    }
  }
  return result;
}

/**
 * Applies a simple 3x3 sharpening kernel to a grayscale image.
 * @param grayscale The source grayscale data.
 * @param width The width of the image.
 * @param height The height of the image.
 * @returns The sharpened grayscale data.
 */
function applySharpening(grayscale: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const result = new Uint8ClampedArray(grayscale.length);
  const kernel = [
    [0, -1, 0],
    [-1, 5, -1],
    [0, -1, 0],
  ];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let sum = 0;
      for (let ky = 0; ky < 3; ky++) {
        for (let kx = 0; kx < 3; kx++) {
          const pixelIndex = (y + ky - 1) * width + (x + kx - 1);
          sum += grayscale[pixelIndex] * kernel[ky][kx];
        }
      }
      const currentIndex = y * width + x;
      result[currentIndex] = Math.max(0, Math.min(255, sum));
    }
  }
  
  // Handle borders by simply copying them from the source to avoid black edges
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (y === 0 || y === height - 1 || x === 0 || x === width - 1) {
        result[y * width + x] = grayscale[y * width + x];
      }
    }
  }

  return result;
}


/**
 * Applies adaptive thresholding (Mean-C method) using an integral image for performance.
 * This is effective for images with varying lighting conditions.
 * @param grayscale The source grayscale data.
 * @param width The width of the image.
 * @param height The height of the image.
 * @param blockSize The size of the neighborhood area. Must be an odd number.
 * @param C A constant subtracted from the mean, used to fine-tune the threshold.
 * @returns The binarized (black and white) image data.
 */
function applyAdaptiveThresholding(grayscale: Uint8ClampedArray, width: number, height: number, blockSize: number = 21, C: number = 7): Uint8ClampedArray {
  const result = new Uint8ClampedArray(grayscale.length);
  const halfBlock = Math.floor(blockSize / 2);

  // 1. Create the integral image (summed-area table) for fast mean calculation.
  // A 32-bit unsigned integer can hold up to ~4.29e9.
  // A 4k image (4096x2160) at 255 brightness for all pixels would have a sum of ~2.25e9, so Uint32Array is sufficient.
  const integralImage = new Uint32Array(width * height);
  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      rowSum += grayscale[index];
      if (y === 0) {
        integralImage[index] = rowSum;
      } else {
        integralImage[index] = rowSum + integralImage[(y - 1) * width + x];
      }
    }
  }

  // 2. Apply thresholding using the integral image
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Define the neighborhood boundaries, clamped to the image edges
      const x1 = Math.max(0, x - halfBlock);
      const y1 = Math.max(0, y - halfBlock);
      const x2 = Math.min(width - 1, x + halfBlock);
      const y2 = Math.min(height - 1, y + halfBlock);

      const count = (x2 - x1 + 1) * (y2 - y1 + 1);

      // Calculate the sum of the neighborhood using the integral image in O(1) time
      const sum = 
        integralImage[y2 * width + x2] -
        (x1 > 0 ? integralImage[y2 * width + (x1 - 1)] : 0) -
        (y1 > 0 ? integralImage[(y1 - 1) * width + x2] : 0) +
        (x1 > 0 && y1 > 0 ? integralImage[(y1 - 1) * width + (x1 - 1)] : 0);
      
      const threshold = (sum / count) - C;
      
      const index = y * width + x;
      result[index] = grayscale[index] > threshold ? 255 : 0;
    }
  }

  return result;
}

/**
 * Preprocesses an image to improve OCR accuracy using an enhanced and optimized pipeline.
 * This involves grayscale conversion, noise reduction, sharpening, and adaptive binarization.
 * It outputs multiple formats for different use cases.
 *
 * @param imageData The original ImageData object.
 * @param options An object to override default preprocessing parameters.
 * @returns A promise that resolves to an object containing base64 data URLs for the processed images.
 */
export const preprocessImageForOCR = async (
  imageData: ImageData,
  options: { binarizationConstantC?: number } = {}
): Promise<ProcessedImageOutput> => {
  return new Promise((resolve, reject) => {
    // Process asynchronously to avoid blocking the UI thread.
    setTimeout(() => {
      try {
        const { width, height, data } = imageData;

        // 1. Convert to Grayscale using the Rec. 601 Luma formula
        const grayscaleData = new Uint8ClampedArray(width * height);
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2];
          const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
          grayscaleData[i / 4] = luminance;
        }

        // 2. Apply Median Filter for Noise Reduction
        // This is effective against salt-and-pepper noise common in captured images.
        const noiseReducedData = applyMedianFilter(grayscaleData, width, height, 3);
        
        // 3. Apply Sharpening to enhance text edges
        const sharpenedData = applySharpening(noiseReducedData, width, height);
        
        // 4. Apply Optimized Adaptive Thresholding for Binarization
        // This handles uneven lighting well and is fast due to using an integral image.
        const binaryData = applyAdaptiveThresholding(sharpenedData, width, height, 21, options.binarizationConstantC ?? 7);

        // 5. Create final RGBA image data from the binary data for canvas drawing
        const outputRgbaData = new Uint8ClampedArray(data.length);
        for (let i = 0; i < binaryData.length; i++) {
          const value = binaryData[i];
          const outputPixelIndex = i * 4;
          outputRgbaData[outputPixelIndex] = value;     // R
          outputRgbaData[outputPixelIndex + 1] = value; // G
          outputRgbaData[outputPixelIndex + 2] = value; // B
          outputRgbaData[outputPixelIndex + 3] = 255;   // A
        }

        // 6. Draw to a canvas to get HD PNG and create other formats
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Could not get canvas context for preprocessing.');
        }
        const newImageData = new ImageData(outputRgbaData, width, height);
        ctx.putImageData(newImageData, 0, 0);

        // Generate HD PNG for OCR
        const ocrOptimizedPng = canvas.toDataURL('image/png');

        // Generate Thumbnail JPEG
        const thumbCanvas = document.createElement('canvas');
        const thumbCtx = thumbCanvas.getContext('2d');
        if (!thumbCtx) {
          throw new Error('Could not get canvas context for thumbnail.');
        }
        const aspectRatio = height / width;
        thumbCanvas.width = THUMBNAIL_WIDTH;
        thumbCanvas.height = THUMBNAIL_WIDTH * aspectRatio;
        thumbCtx.drawImage(canvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
        const thumbnailJpeg = thumbCanvas.toDataURL('image/jpeg', 0.85);

        resolve({ ocrOptimizedPng, thumbnailJpeg });
      } catch (error) {
        reject(error);
      }
    }, 10);
  });
};
