export interface FacialSymmetryResult {
  score: number;
  quality: string;
  description: string;
}

/**
 * Calculates facial symmetry based on collected landmarks.
 * @param landmarks An object containing facial landmark data, potentially nested.
 * @returns An object with symmetry score, quality, and a description.
 */
export function calculateFacialSymmetry(landmarks: any): FacialSymmetryResult {
  if (!landmarks || typeof landmarks !== 'object') {
    return { score: 0, quality: 'N/A', description: 'No landmark data available.' };
  }

  const allPoints: { x: number; y: number }[] = [];

  // Recursive function to collect all x, y points
  const collectPoints = (obj: any) => {
    if (obj === null || typeof obj !== 'object') return;

    if (Array.isArray(obj)) {
      obj.forEach(item => collectPoints(item));
    } else if (typeof obj.x === 'number' && typeof obj.y === 'number' && !isNaN(obj.x) && !isNaN(obj.y)) {
      allPoints.push({ x: obj.x, y: obj.y });
    } else {
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          collectPoints(obj[key]);
        }
      }
    }
  };

  collectPoints(landmarks);

  if (allPoints.length < 2) {
    return { score: 0, quality: 'N/A', description: 'Insufficient landmark points for symmetry analysis.' };
  }

  const minX = Math.min(...allPoints.map(p => p.x));
  const maxX = Math.max(...allPoints.map(p => p.x));
  const faceWidth = maxX - minX;

  if (faceWidth === 0) {
    return { score: 0, quality: 'N/A', description: 'Face width is zero, cannot calculate symmetry.' };
  }

  // Calculate the overall horizontal center of the detected landmarks
  const overallAvgX = allPoints.reduce((sum, p) => sum + p.x, 0) / allPoints.length;

  const leftPoints = allPoints.filter(p => p.x < overallAvgX);
  const rightPoints = allPoints.filter(p => p.x > overallAvgX);

  if (leftPoints.length === 0 || rightPoints.length === 0) {
    return { score: 0, quality: 'N/A', description: 'Cannot determine distinct left/right point distribution for symmetry.' };
  }

  const avgXLeft = leftPoints.reduce((sum, p) => sum + p.x, 0) / leftPoints.length;
  const avgXRight = rightPoints.reduce((sum, p) => sum + p.x, 0) / rightPoints.length;

  const leftSpread = overallAvgX - avgXLeft;
  const rightSpread = avgXRight - overallAvgX;

  // The symmetry deviation is how much these spreads differ
  const symmetryDeviation = Math.abs(leftSpread - rightSpread);

  // Normalize by face width to get a score between 0 and 1, where 1 is perfect symmetry.
  // A simple inverse relationship: higher deviation = lower score.
  // Fix: Define relativeDeviation
  const relativeDeviation = faceWidth > 0 ? symmetryDeviation / faceWidth : 0;
  let score = Math.max(0, 1 - (relativeDeviation * 2)); // Multiply by 2 to make small deviations impact more, capping at 0.

  score = Math.round(score * 100); // Scale to 0-100

  let quality = 'N/A';
  let description = '';

  if (score >= 90) {
    quality = 'High Symmetry';
    description = 'Facial features are highly balanced, often associated with perceived attractiveness and health.';
  } else if (score >= 70) {
    quality = 'Good Symmetry';
    description = 'Facial features show good balance with only minor, subtle asymmetries.';
  } else if (score >= 50) {
    quality = 'Moderate Symmetry';
    description = 'Some noticeable asymmetries are present, but the overall facial structure remains largely balanced.';
  } else if (score > 0) {
    quality = 'Lower Symmetry';
    description = 'More distinct asymmetries are observed in the facial features.';
  } else {
    quality = 'Indeterminate'; // If score is 0 due to some edge cases, or if calculations led to a very low score
    description = 'Symmetry analysis was inconclusive or very low, potentially due to limited or uneven landmark data.';
  }

  return { score, quality, description };
}

/**
 * Escapes a string for CSV format by enclosing it in double quotes if it contains commas,
 * double quotes, or newlines, and by doubling any existing double quotes.
 * @param value The value to escape.
 * @returns The escaped string.
 */
export function escapeCSV(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  let stringValue = String(value);
  // If the string contains a comma, double-quote, or newline, enclose it in double quotes.
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    // Double any existing double quotes
    stringValue = stringValue.replace(/"/g, '""');
    return `"${stringValue}"`;
  }
  return stringValue;
}

/**
 * Generates a QR code data URL from a text string.
 * @param text The string to encode into the QR code.
 * @returns A promise that resolves to the data URL of the generated QR code image.
 */
export const generateQRCodeDataURL = async (text: string): Promise<string> => {
  if (!window.QRCode) {
    throw new Error('QRCode library is not loaded.');
  }
  try {
    // Returns a full data URL: "data:image/png;base64,..."
    const dataUrl = await window.QRCode.toDataURL(text, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      quality: 0.9,
      margin: 1,
    });
    return dataUrl;
  } catch (err) {
    console.error('Failed to generate QR code:', err);
    throw err;
  }
};
