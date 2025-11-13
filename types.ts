import { ReactNode } from 'react';

export enum Theme {
  LIGHT = 'light',
  DARK = 'dark',
  EMERALD = 'emerald',
  PURPLE = 'purple',
}

export enum AdminRole {
  SUPER_ADMIN = 'Super Admin',
  VALIDATOR = 'Validator',
}

export interface AdminUser {
  id: string;
  username: string;
  passwordHash: string; // In a real app, this would be hashed and not directly stored
  fullName: string;
  role: AdminRole;
}

export interface IDCardData {
  fullName: string;
  dob: string;
  idNumber: string;
  country: string;
  contactNumber?: string; // Voter's contact number
  issueDate?: string;
  expiryDate?: string;
  address?: string;
  gender?: string;
  facialDescription: string;
  facialLandmarks?: any; // Added to store structured facial landmark data
  otherText?: string;
  base64Image?: string; // Add this to store the image data
  imageMimeType?: string; // Add this to store the image MIME type
  preprocessedBase64Image?: string; // The B&W image used for text-only OCR
  preprocessedThumbnailBase64Image?: string; // A smaller thumbnail of the B&W image
  qrCodeData?: string; // Add this to store extracted QR code data
  confidenceScore?: number; // Added for Gemini API confidence
  facialDescriptionConfidence?: number; // Confidence for the facial description
  extractionTimestamp?: string; // Timestamp for when Gemini processing was completed
}

export interface DetectedTextBlock {
  label: string; // The type of field detected (e.g., "FullName", "DOB")
  text: string;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence?: number; // Added for Gemini API confidence on a per-block basis
}

export enum ValidationStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export interface VotingEntry {
  id: string;
  idCardData: IDCardData;
  timestamp: string;
  validationStatus: ValidationStatus;
  validatedBy?: string; // Admin ID
  validationTimestamp?: string;
  rejectionReason?: string; // Added to store reason for rejection
  assignedPosition?: string; // The constitutional position for the candidate
  isOfficial?: boolean; // New field to mark as an official, saved record
  hasVoted?: boolean; // Add this field to track vote status
}

export type GovernmentStructureData = Record<string, Record<string, string[]>>;

export interface HistoricalStructure {
  id: string; // Unique ID, can be timestamp + filename hash
  timestamp: string; // ISO string for when it was uploaded
  filename: string; // Name of the uploaded XLSX file
  structure: GovernmentStructureData; // The parsed structure object
}

export interface AuthContextType {
  isAdminAuthenticated: boolean;
  loggedInAdmin: AdminUser | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
}

export interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

export interface ProtectedRouteProps {
  children: ReactNode;
}

// Fix: Moved chart types here to break circular dependency between AdminDashboard and GovernmentStructure.
export type ChartType = 'distribution' | 'positions' | 'gender';
export type ChartDesign = 'pie' | 'doughnut' | '3d';

declare global {
  interface Window {
    jsQR: ((
      data: Uint8ClampedArray,
      width: number,
      height: number,
      options?: { inversionAttempts?: "dontInvert" | "onlyInvert" | "both" | "b&w" }
    ) => {
      binaryData: Uint8ClampedArray;
      data: string;
      chunks: Array<{ type: string; bytes: number[]; data: string }>;
      location: {
        bottomLeft: { x: number; y: number };
        bottomRight: { x: number; y: number };
        topLeft: { x: number; y: number };
        topRight: { x: number; y: number };
        topLeftFinderPattern: { x: number; y: number };
        topRightFinderPattern: { x: number; y: number };
        bottomLeftFinderPattern: { x: number; y: number };
        topRightAlignmentPattern: { x: number; y: number };
      };
    } | null);
    XLSX: any; // Add type declaration for SheetJS library
  }
}