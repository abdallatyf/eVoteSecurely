import { GoogleGenAI, Type } from "@google/genai";
import { IDCardData, DetectedTextBlock } from '../types';
import { GEMINI_VISION_MODEL } from '../constants';

/**
 * Initializes the GoogleGenAI client.
 * NOTE: The API key is assumed to be available via process.env.API_KEY,
 * which is managed externally by the execution environment.
 * Do not prompt the user for an API key.
 */
const getGeminiClient = () => {
  // Fix: Use process.env.API_KEY to adhere to guidelines.
  if (!process.env.API_KEY) {
    console.error("Gemini API Key is not set in environment variables.");
    throw new Error("Gemini API Key is not set.");
  }
  // Fix: Use process.env.API_KEY for initialization.
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

/**
 * Extracts data from a base64 encoded image of an ID card using Gemini's multimodal capabilities.
 *
 * @param base64ImageData The base64 encoded string of the ID card image.
 * @param mimeType The MIME type of the image (e.g., 'image/jpeg', 'image/png').
 * @param qrCodeData Optional QR code data detected from the image.
 * @returns A promise that resolves to the extracted IDCardData.
 */
export const extractIDCardData = async (
  base64ImageData: string,
  mimeType: string,
  qrCodeData?: string,
): Promise<IDCardData> => {
  const ai = getGeminiClient();

  const imagePart = {
    inlineData: {
      mimeType: mimeType,
      data: base64ImageData,
    },
  };

  let textPrompt = `Analyze this identification card image. Extract the following information and provide a detailed and nuanced description of the person's face.`;
  if (qrCodeData) {
    textPrompt += ` Cross-reference and verify with the following QR code data: "${qrCodeData}". If the QR data provides definitive information for a field, prioritize it.`;
  }
  textPrompt += `
  1. Full Name:
  2. Date of Birth (format DD-MM-YYYY if possible):
  3. ID Number:
  4. Country of Issuance:
  5. Issue Date (format DD-MM-YYYY if possible):
  6. Expiry Date (format DD-MM-YYYY if possible):
  7. Address:
  8. Gender:
  9. Contact Number (in international format if available, e.g., +639171234567):
  10. Any other identifiable text fields not covered above.
  
  Provide a detailed and nuanced description of the person's facial features visible on the card, focusing on key characteristics such as eye color, hair style and color, approximate age, any visible distinguishing marks (e.g., moles, scars), and overall facial structure.
  
  Crucially, extract a detailed set of facial landmark coordinates. The data must be precise and returned as a structured JSON object. For each landmark, provide an object with 'x' and 'y' coordinates representing its position on the image. If a specific landmark is not clearly visible or cannot be accurately determined, return null for its value instead of an object. The required landmarks are:
- left_eye: (inner_corner, outer_corner, center)
- right_eye: (inner_corner, outer_corner, center)
- nose: (tip, bridge_top, left_nostril, right_nostril)
- mouth: (left_corner, right_corner, top_lip_center, bottom_lip_center)
- left_eyebrow: (start, center, end)
- right_eyebrow: (start, center, end)
- chin: (tip)

  Avoid making assumptions about identity, emotion, or protected characteristics.
  Also, estimate an overall confidence score (0.0 to 1.0) for the accuracy of all extracted text data combined.
  Finally, provide a separate confidence score (0.0 to 1.0) specifically for the quality and accuracy of the facial description.
  
  Format the output as a JSON object strictly following this schema. If a field cannot be found, use "N/A" for strings and null for objects/numbers.
  `;

  try {
    const pointSchema = {
      type: Type.OBJECT,
      properties: {
        x: { type: Type.NUMBER, description: 'The x-coordinate of the point.' },
        y: { type: Type.NUMBER, description: 'The y-coordinate of the point.' },
      },
      required: ['x', 'y'],
    };

    const response = await ai.models.generateContent({
      model: GEMINI_VISION_MODEL,
      contents: { parts: [{ text: textPrompt }, imagePart] },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            fullName: { type: Type.STRING, description: 'The full name of the person on the ID.' },
            dob: { type: Type.STRING, description: 'The date of birth, formatted as DD-MM-YYYY or similar.' },
            idNumber: { type: Type.STRING, description: 'The identification number.' },
            country: { type: Type.STRING, description: 'The country that issued the ID.' },
            contactNumber: { type: Type.STRING, description: 'The contact phone number, preferably in international format (e.g., +63 917 123 4567).' },
            issueDate: { type: Type.STRING, description: 'The issue date of the ID, formatted as DD-MM-YYYY or similar.' },
            expiryDate: { type: Type.STRING, description: 'The expiry date of the ID, formatted as DD-MM-YYYY or similar.' },
            address: { type: Type.STRING, description: 'The residential address listed on the ID.' },
            gender: { type: Type.STRING, description: 'The gender of the person (e.g., Male, Female, Other).' },
            otherText: { type: Type.STRING, description: 'Any other extracted text fields, combined.' },
            facialDescription: { type: Type.STRING, description: 'A detailed description of the person\'s facial features.' },
            facialLandmarks: {
              type: Type.OBJECT,
              description: 'Structured data for specific facial landmarks. If a point is not visible, it should be null.',
              properties: {
                left_eye: {
                  type: Type.OBJECT,
                  description: "Coordinates for the left eye.",
                  properties: {
                    inner_corner: { ...pointSchema, description: "The inner corner of the left eye." },
                    outer_corner: { ...pointSchema, description: "The outer corner of the left eye." },
                    center: { ...pointSchema, description: "The center of the left pupil." },
                  }
                },
                right_eye: {
                  type: Type.OBJECT,
                  description: "Coordinates for the right eye.",
                  properties: {
                    inner_corner: { ...pointSchema, description: "The inner corner of the right eye." },
                    outer_corner: { ...pointSchema, description: "The outer corner of the right eye." },
                    center: { ...pointSchema, description: "The center of the right pupil." },
                  }
                },
                nose: {
                  type: Type.OBJECT,
                  description: "Coordinates for the nose.",
                  properties: {
                    tip: { ...pointSchema, description: "The tip of the nose." },
                    bridge_top: { ...pointSchema, description: "The top of the nose bridge between the eyes." },
                    left_nostril: { ...pointSchema, description: "The center of the left nostril." },
                    right_nostril: { ...pointSchema, description: "The center of the right nostril." },
                  }
                },
                mouth: {
                  type: Type.OBJECT,
                  description: "Coordinates for the mouth.",
                  properties: {
                    left_corner: { ...pointSchema, description: "The left corner of the mouth." },
                    right_corner: { ...pointSchema, description: "The right corner of the mouth." },
                    top_lip_center: { ...pointSchema, description: "The center of the top lip." },
                    bottom_lip_center: { ...pointSchema, description: "The center of the bottom lip." },
                  }
                },
                left_eyebrow: {
                  type: Type.OBJECT,
                  description: "Coordinates for the left eyebrow.",
                  properties: {
                    start: { ...pointSchema, description: "The inner start of the left eyebrow." },
                    center: { ...pointSchema, description: "The center arch of the left eyebrow." },
                    end: { ...pointSchema, description: "The outer end of the left eyebrow." },
                  }
                },
                right_eyebrow: {
                  type: Type.OBJECT,
                  description: "Coordinates for the right eyebrow.",
                  properties: {
                    start: { ...pointSchema, description: "The inner start of the right eyebrow." },
                    center: { ...pointSchema, description: "The center arch of the right eyebrow." },
                    end: { ...pointSchema, description: "The outer end of the right eyebrow." },
                  }
                },
                chin: {
                  type: Type.OBJECT,
                  description: "Coordinates for the chin.",
                  properties: {
                    tip: { ...pointSchema, description: "The tip of the chin." },
                  }
                },
              },
            },
            confidenceScore: { type: Type.NUMBER, description: 'Overall confidence score for the extracted text data (0.0 to 1.0).' },
            facialDescriptionConfidence: { type: Type.NUMBER, description: 'Confidence score for the facial description only (0.0 to 1.0).' },
          },
          required: ['fullName', 'dob', 'idNumber', 'country', 'facialDescription', 'facialLandmarks', 'confidenceScore', 'facialDescriptionConfidence'],
        },
      },
    });

    const jsonStr = response.text.trim();
    const extractedData: IDCardData = JSON.parse(jsonStr) as IDCardData;

    // Augment the extracted data with the original image base64 and mime type
    extractedData.base64Image = base64ImageData;
    extractedData.imageMimeType = mimeType;
    if (qrCodeData) {
      extractedData.qrCodeData = qrCodeData;
    }

    return extractedData;
  } catch (error) {
    console.error('Error extracting ID card data with Gemini:', error);
    // You might want to throw a custom error or return a default/empty structure
    throw new Error('Failed to extract ID card data.');
  }
};

/**
 * Extracts ONLY text data from a preprocessed (e.g., black and white) image of an ID card.
 * This function is optimized for OCR accuracy and does not attempt to analyze facial features.
 *
 * @param base64ImageData The base64 encoded string of the preprocessed ID card image.
 * @param mimeType The MIME type of the image (e.g., 'image/png').
 * @param qrCodeData Optional QR code data detected from the image.
 * @returns A promise that resolves to the extracted IDCardData, without facial analysis.
 */
export const extractIDCardDataTextOnly = async (
  base64ImageData: string,
  mimeType: string,
  qrCodeData?: string,
): Promise<IDCardData> => {
  const ai = getGeminiClient();

  const imagePart = {
    inlineData: {
      mimeType: mimeType,
      data: base64ImageData,
    },
  };

  let textPrompt = `Analyze this high-contrast, preprocessed identification card image. Your primary goal is to achieve the highest possible accuracy for Optical Character Recognition (OCR). Extract only the following text fields.`;
  if (qrCodeData) {
    textPrompt += ` Cross-reference and verify with the following QR code data: "${qrCodeData}". If the QR data provides definitive information for a field, prioritize it.`;
  }
  textPrompt += `
  1. Full Name:
  2. Date of Birth (format DD-MM-YYYY if possible):
  3. ID Number:
  4. Country of Issuance:
  5. Issue Date (format DD-MM-YYYY if possible):
  6. Expiry Date (format DD-MM-YYYY if possible):
  7. Address:
  8. Gender:
  9. Contact Number (in international format if available, e.g., +639171234567):
  10. Any other identifiable text fields not covered above.
  
  Do NOT analyze the person's photo for facial features, description, or landmarks.
  Estimate an overall confidence score (0.0 to 1.0) for the accuracy of all extracted text data combined.
  
  Format the output as a JSON object strictly following this schema. If a field cannot be found, use "N/A".
  `;

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_VISION_MODEL,
      contents: { parts: [{ text: textPrompt }, imagePart] },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            fullName: { type: Type.STRING, description: 'The full name on the ID.' },
            dob: { type: Type.STRING, description: 'The date of birth, formatted as DD-MM-YYYY or similar.' },
            idNumber: { type: Type.STRING, description: 'The identification number.' },
            country: { type: Type.STRING, description: 'The country that issued the ID.' },
            contactNumber: { type: Type.STRING, description: 'The contact phone number.' },
            issueDate: { type: Type.STRING, description: 'The issue date of the ID, formatted as DD-MM-YYYY or similar.' },
            expiryDate: { type: Type.STRING, description: 'The expiry date of the ID, formatted as DD-MM-YYYY or similar.' },
            address: { type: Type.STRING, description: 'The residential address listed on the ID.' },
            gender: { type: Type.STRING, description: 'The gender of the person (e.g., Male, Female, Other).' },
            otherText: { type: Type.STRING, description: 'Any other extracted text fields, combined.' },
            confidenceScore: { type: Type.NUMBER, description: 'Overall confidence score for the extracted text data (0.0 to 1.0).' },
          },
          required: ['fullName', 'dob', 'idNumber', 'country', 'confidenceScore'],
        },
      },
    });

    const jsonStr = response.text.trim();
    const extractedTextData = JSON.parse(jsonStr);

    // Construct a full IDCardData object, filling in defaults for non-text fields
    const finalData: IDCardData = {
      ...extractedTextData,
      facialDescription: 'N/A (Text-only processing was used)',
      facialLandmarks: null,
      facialDescriptionConfidence: 0.0,
      base64Image: base64ImageData, // Will be overwritten in IDScanner with original
      imageMimeType: mimeType,
      qrCodeData: qrCodeData,
    };

    return finalData;
  } catch (error) {
    console.error('Error extracting text-only ID card data with Gemini:', error);
    throw new Error('Failed to extract text-only ID card data.');
  }
};


/**
 * Extracts data from a base64 encoded image of an ID card using Gemini, returning it as a plain text block.
 * This is useful for pre-filling forms where the user can then make corrections.
 *
 * @param base64ImageData The base64 encoded string of the ID card image.
 * @param mimeType The MIME type of the image (e.g., 'image/jpeg', 'image/png').
 * @returns A promise that resolves to a string with the extracted data.
 */
export const extractTextFromImageForForm = async (
  base64ImageData: string,
  mimeType: string,
): Promise<string> => {
  const ai = getGeminiClient();

  const imagePart = {
    inlineData: {
      mimeType: mimeType,
      data: base64ImageData,
    },
  };

  const textPrompt = `Strictly analyze this identification card image and extract the following information.
  For any field you cannot find, please write "N/A".
  Do not add any introductory text, closing remarks, or markdown formatting.
  Your response must follow this exact format, with each field on a new line:
  FullName: [The full name on the card]
  DOB: [The date of birth on the card, preferably in DD-MM-YYYY or YYYY-MM-DD format]
  IDNumber: [The ID number on the card]
  Country: [The country that issued the card]
  ContactNumber: [The contact number on the card]
  IssueDate: [The issue date on the card, preferably in DD-MM-YYYY or YYYY-MM-DD format]
  ExpiryDate: [The expiry date on the card, preferably in DD-MM-YYYY or YYYY-MM-DD format]
  Address: [The address on the card]
  Gender: [The gender on the card]
  FacialDescription: [A detailed, objective description of the person's facial features]
  OtherText: [Any other text visible on the card, concatenated into a single string]
  `;

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_VISION_MODEL, // Use vision model for image input
      contents: { parts: [{ text: textPrompt }, imagePart] },
    });

    return response.text.trim();
  } catch (error) {
    console.error('Error extracting text from image with Gemini:', error);
    throw new Error('Failed to extract text data from the image.');
  }
};

/**
 * Performs OCR on an image to detect text blocks and their bounding boxes.
 *
 * @param base64ImageData The base64 encoded string of the ID card image.
 * @param mimeType The MIME type of the image (e.g., 'image/jpeg', 'image/png').
 * @returns A promise that resolves to an array of detected text blocks with their coordinates.
 */
export const detectTextAndBoundingBoxes = async (
  base64ImageData: string,
  mimeType: string,
): Promise<DetectedTextBlock[]> => {
  const ai = getGeminiClient();

  const imagePart = {
    inlineData: {
      mimeType: mimeType,
      data: base64ImageData,
    },
  };

  const textPrompt = `Perform Optical Character Recognition (OCR) on this high-contrast, preprocessed ID card image for maximum accuracy. For each distinct text field identified, extract the text content, assign a descriptive label (e.g., 'FullName', 'DOB', 'IDNumber', 'Other'), provide its exact bounding box coordinates (x, y, width, height), and estimate a confidence score (from 0.0 to 1.0) for the accuracy of the recognized text. The final output must be a JSON array of objects that strictly adheres to the provided response schema.`;

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_VISION_MODEL,
      contents: { parts: [{ text: textPrompt }, imagePart] },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              label: { type: Type.STRING, description: 'The identified field type (e.g., "FullName", "DOB", "Other").' },
              text: { type: Type.STRING, description: 'The detected text content.' },
              boundingBox: {
                type: Type.OBJECT,
                description: 'The bounding box coordinates of the text.',
                properties: {
                  x: { type: Type.NUMBER, description: 'The x-coordinate of the top-left corner.' },
                  y: { type: Type.NUMBER, description: 'The y-coordinate of the top-left corner.' },
                  width: { type: Type.NUMBER, description: 'The width of the bounding box.' },
                  height: { type: Type.NUMBER, description: 'The height of the bounding box.' },
                },
                required: ['x', 'y', 'width', 'height'],
              },
              confidence: { type: Type.NUMBER, description: 'The confidence score (0.0 to 1.0) for the OCR accuracy of this text block.' },
            },
            required: ['label', 'text', 'boundingBox', 'confidence'],
          },
        },
      },
    });

    const jsonStr = response.text.trim();
    // Gemini may sometimes return an array within a top-level object (e.g., { "blocks": [...] }),
    // so we'll try to handle that gracefully.
    const parsedJson = JSON.parse(jsonStr);
    if (Array.isArray(parsedJson)) {
      return parsedJson as DetectedTextBlock[];
    } else if (typeof parsedJson === 'object' && parsedJson !== null) {
        const key = Object.keys(parsedJson).find(k => Array.isArray(parsedJson[k]));
        if (key) {
            return parsedJson[key] as DetectedTextBlock[];
        }
    }
    console.warn("Could not find an array in the OCR response:", parsedJson);
    return [];

  } catch (error) {
    console.error('Error detecting text with Gemini:', error);
    throw new Error('Failed to perform OCR on the image.');
  }
};
