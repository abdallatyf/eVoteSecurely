// utils/imageTransformation.ts

/**
 * Solves a system of linear equations Ax = b using Gauss-Jordan elimination.
 * @param A An n x n matrix of coefficients. This matrix will be modified in place.
 * @param b An n-element vector of results.
 * @returns An n-element solution vector x, or null if the matrix is singular.
 */
function solve(A: number[][], b: number[]): number[] | null {
  const n = A.length;
  // Augment the matrix with the results vector
  for (let i = 0; i < n; i++) {
    A[i].push(b[i]);
  }

  // Perform Gauss-Jordan elimination
  for (let i = 0; i < n; i++) {
    // Find pivot row (largest element in the current column)
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) {
        maxRow = k;
      }
    }
    // Swap rows to bring pivot to the current row
    [A[i], A[maxRow]] = [A[maxRow], A[i]];

    // Check for singularity (no unique solution)
    if (Math.abs(A[i][i]) < 1e-9) {
      return null;
    }

    // Normalize the pivot row (make the pivot element 1)
    const pivot = A[i][i];
    for (let j = i; j < n + 1; j++) {
      A[i][j] /= pivot;
    }

    // Eliminate other rows
    for (let k = 0; k < n; k++) {
      if (k !== i) {
        const factor = A[k][i];
        for (let j = i; j < n + 1; j++) {
          A[k][j] -= factor * A[i][j];
        }
      }
    }
  }

  // The last column of the matrix is now the solution vector
  const x = new Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = A[i][n];
  }

  return x;
}

/**
 * Applies a perspective transformation to an image to correct skewing.
 * @param imageDataUrl The base64 data URL of the source image.
 * @param sourcePoints An object with four {x, y} points representing the quadrilateral in the source image.
 * @param mimeType The MIME type for the output image (e.g., 'image/png').
 * @returns A promise that resolves to the base64 data URL of the corrected rectangular image.
 */
export const applyPerspectiveTransform = (
  imageDataUrl: string,
  sourcePoints: { tl: {x:number, y:number}, tr: {x:number, y:number}, br: {x:number, y:number}, bl: {x:number, y:number} },
  mimeType: string,
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      // 1. Determine output dimensions based on the average width/height of the quadrilateral
      const w1 = Math.hypot(sourcePoints.tr.x - sourcePoints.tl.x, sourcePoints.tr.y - sourcePoints.tl.y);
      const w2 = Math.hypot(sourcePoints.br.x - sourcePoints.bl.x, sourcePoints.br.y - sourcePoints.bl.y);
      const outputWidth = Math.round((w1 + w2) / 2);
      
      const h1 = Math.hypot(sourcePoints.bl.x - sourcePoints.tl.x, sourcePoints.bl.y - sourcePoints.tl.y);
      const h2 = Math.hypot(sourcePoints.br.x - sourcePoints.tr.x, sourcePoints.br.y - sourcePoints.tr.y);
      const outputHeight = Math.round((h1 + h2) / 2);
      
      if (outputWidth < 1 || outputHeight < 1) {
        return reject(new Error('Invalid source points result in a zero-sized output image.'));
      }

      // 2. Set up and solve the system of linear equations for the inverse transform matrix
      // This matrix maps a point (u,v) in the destination rectangle back to its corresponding point (x,y) in the source quadrilateral.
      const destPoints = {
        tl: { u: 0, v: 0 },
        tr: { u: outputWidth, v: 0 },
        br: { u: outputWidth, v: outputHeight },
        bl: { u: 0, v: outputHeight },
      };

      const { tl: s_tl, tr: s_tr, br: s_br, bl: s_bl } = sourcePoints;
      const { tl: d_tl, tr: d_tr, br: d_br, bl: d_bl } = destPoints;

      // Create the 8x8 matrix A for the Ax=b equation system
      const A = [
        [d_tl.u, d_tl.v, 1, 0, 0, 0, -s_tl.x * d_tl.u, -s_tl.x * d_tl.v],
        [d_tr.u, d_tr.v, 1, 0, 0, 0, -s_tr.x * d_tr.u, -s_tr.x * d_tr.v],
        [d_br.u, d_br.v, 1, 0, 0, 0, -s_br.x * d_br.u, -s_br.x * d_br.v],
        [d_bl.u, d_bl.v, 1, 0, 0, 0, -s_bl.x * d_bl.u, -s_bl.x * d_bl.v],
        [0, 0, 0, d_tl.u, d_tl.v, 1, -s_tl.y * d_tl.u, -s_tl.y * d_tl.v],
        [0, 0, 0, d_tr.u, d_tr.v, 1, -s_tr.y * d_tr.u, -s_tr.y * d_tr.v],
        [0, 0, 0, d_br.u, d_br.v, 1, -s_br.y * d_br.u, -s_br.y * d_br.v],
        [0, 0, 0, d_bl.u, d_bl.v, 1, -s_bl.y * d_bl.u, -s_bl.y * d_bl.v],
      ];
      // Create the vector b
      const b = [s_tl.x, s_tr.x, s_br.x, s_bl.x, s_tl.y, s_tr.y, s_br.y, s_bl.y];
      
      const h = solve(A, b); // h = [a, b, c, d, e, f, g, i]

      if (!h) {
        return reject(new Error('Could not solve perspective transform matrix. Ensure the four points are not collinear.'));
      }
      const [a, b_coeff, c, d, e_coeff, f, g, i_coeff] = h;
      
      // 3. Prepare source and destination canvases
      const sourceCanvas = document.createElement('canvas');
      sourceCanvas.width = image.naturalWidth;
      sourceCanvas.height = image.naturalHeight;
      const sourceCtx = sourceCanvas.getContext('2d');
      if (!sourceCtx) return reject(new Error('Could not get source canvas context.'));
      sourceCtx.drawImage(image, 0, 0);
      const sourceImageData = sourceCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
      const sourceData = sourceImageData.data;

      const destCanvas = document.createElement('canvas');
      destCanvas.width = outputWidth;
      destCanvas.height = outputHeight;
      const destCtx = destCanvas.getContext('2d');
      if (!destCtx) return reject(new Error('Could not get destination canvas context.'));
      const destImageData = destCtx.createImageData(outputWidth, outputHeight);
      const destData = destImageData.data;

      // 4. Apply the inverse mapping with bilinear interpolation
      for (let v = 0; v < outputHeight; v++) {
        for (let u = 0; u < outputWidth; u++) {
          const denominator = g * u + i_coeff * v + 1;
          const x = (a * u + b_coeff * v + c) / denominator;
          const y = (d * u + e_coeff * v + f) / denominator;

          const x_floor = Math.floor(x);
          const y_floor = Math.floor(y);

          // Check if the calculated source coordinates are within the image bounds
          if (x_floor >= 0 && x_floor < sourceCanvas.width - 1 && y_floor >= 0 && y_floor < sourceCanvas.height - 1) {
            const x_frac = x - x_floor;
            const y_frac = y - y_floor;

            const p00_idx = (y_floor * sourceCanvas.width + x_floor) * 4;
            const p10_idx = (y_floor * sourceCanvas.width + (x_floor + 1)) * 4;
            const p01_idx = ((y_floor + 1) * sourceCanvas.width + x_floor) * 4;
            const p11_idx = ((y_floor + 1) * sourceCanvas.width + (x_floor + 1)) * 4;

            const dest_idx = (v * outputWidth + u) * 4;
            
            // Interpolate for each channel (R, G, B, A)
            for (let channel = 0; channel < 4; channel++) {
              const val00 = sourceData[p00_idx + channel];
              const val10 = sourceData[p10_idx + channel];
              const val01 = sourceData[p01_idx + channel];
              const val11 = sourceData[p11_idx + channel];

              const interp_top = val00 * (1 - x_frac) + val10 * x_frac;
              const interp_bottom = val01 * (1 - x_frac) + val11 * x_frac;
              const final_val = interp_top * (1 - y_frac) + interp_bottom * y_frac;

              destData[dest_idx + channel] = final_val;
            }
          }
        }
      }

      destCtx.putImageData(destImageData, 0, 0);
      resolve(destCanvas.toDataURL(mimeType, 0.9));
    };
    image.onerror = (err) => reject(new Error(`Failed to load image for skewing: ${err}`));
    image.src = imageDataUrl;
  });
};

/**
 * Applies brightness and contrast adjustments to an image.
 * @param imageDataUrl The base64 data URL of the source image.
 * @param mimeType The MIME type of the image.
 * @param brightness The brightness percentage (100 is no change).
 * @param contrast The contrast percentage (100 is no change).
 * @returns A promise resolving to the base64 data URL of the adjusted image.
 */
export const applyImageAdjustments = (
  imageDataUrl: string,
  mimeType: string,
  brightness: number,
  contrast: number,
): Promise<string> => {
  return new Promise((resolve, reject) => {
    // If no adjustments are needed, return the original URL to save processing time.
    if (brightness === 100 && contrast === 100) {
      return resolve(imageDataUrl);
    }

    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return reject(new Error('Could not get canvas context for image adjustments'));
      }

      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;

      // Apply the filter and draw the image
      ctx.filter = `brightness(${brightness}%) contrast(${contrast}%)`;
      ctx.drawImage(image, 0, 0);

      // Export the adjusted image from the canvas
      resolve(canvas.toDataURL(mimeType, 0.9));
    };
    image.onerror = (err) => reject(new Error(`Failed to load image for adjustments: ${err}`));
    image.src = imageDataUrl;
  });
};

/**
 * Applies transformations like flip and rotation to an image.
 * @param imageDataUrl The base64 data URL of the source image.
 * @param mimeType The MIME type of the image.
 * @param transformations An object containing flip and rotation values.
 * @returns A promise resolving to the base64 data URL of the transformed image.
 */
export const applyTransformationsToImage = (
  imageDataUrl: string,
  mimeType: string,
  transformations: { flipH: boolean; flipV: boolean; rotation: number }
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return reject(new Error('Could not get canvas context for transformations'));
      }

      const { flipH, flipV, rotation } = transformations;
      const rad = rotation * (Math.PI / 180);
      const isSideways = rotation === 90 || rotation === 270;

      // Set canvas dimensions based on rotation
      canvas.width = isSideways ? image.naturalHeight : image.naturalWidth;
      canvas.height = isSideways ? image.naturalWidth : image.naturalHeight;

      ctx.save();
      // Move origin to the center of the canvas
      ctx.translate(canvas.width / 2, canvas.height / 2);
      // Apply transformations in order: rotate, then scale (flip)
      ctx.rotate(rad);
      ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
      // Draw the image centered on the new origin
      ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
      ctx.restore();

      resolve(canvas.toDataURL(mimeType, 0.9));
    };
    image.onerror = (err) => reject(new Error(`Failed to load image for transformation: ${err}`));
    image.src = imageDataUrl;
  });
};