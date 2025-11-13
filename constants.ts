import { AdminUser, Theme, AdminRole } from './types';

// In a real application, passwords would be securely hashed and stored on a backend.
// This is for demonstration purposes only.
export const ADMIN_USERS: AdminUser[] = [
  {
    id: 'admin_leiff',
    username: 'leiff.mendoza',
    passwordHash: '87300123', // Mocked password
    fullName: 'Leiff Nathan A. Mendoza',
    role: AdminRole.SUPER_ADMIN,
  },
  {
    id: 'admin_superuser',
    username: 'superuser',
    passwordHash: '87300123', // Mocked password
    fullName: 'Super User',
    role: AdminRole.VALIDATOR,
  },
];

export const DEFAULT_THEME: Theme = Theme.DARK;

export const THEMES: Theme[] = [
  Theme.LIGHT,
  Theme.DARK,
  Theme.EMERALD,
  Theme.PURPLE,
];

export const themeColorMapping: Record<Theme, string> = {
  [Theme.LIGHT]: 'bg-blue-500',
  [Theme.DARK]: 'bg-blue-400',
  [Theme.EMERALD]: 'bg-emerald-500',
  [Theme.PURPLE]: 'bg-purple-500',
};

// Gemini model for multimodal content (text + image) that supports JSON output
export const GEMINI_VISION_MODEL = 'gemini-2.5-flash';

// Placeholder for the singular voting event
export const VOTING_EVENT_NAME = "National Presidential Election 2024";

// List of possible constitutional positions for candidates
export const CONSTITUTIONAL_POSITIONS: string[] = [
  'President',
  'Vice President',
  'Senator',
  'Representative',
  'Governor',
  'Vice Governor',
  'Provincial Board Member',
  'Mayor',
  'Vice Mayor',
  'City Councilor',
  'Municipal Councilor',
];

// New constant for highlighting important OCR fields
export const CRITICAL_OCR_FIELDS: string[] = ['fullName', 'dob', 'idNumber'];

// New constant for admin roles
export const ADMIN_ROLES: AdminRole[] = [AdminRole.SUPER_ADMIN, AdminRole.VALIDATOR];
