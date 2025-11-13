

import React, { useState, useCallback, useEffect } from 'react';
import { IDCardData, VotingEntry } from '../types';
import Button from './Button';
import Input from './Input';
import LoadingSpinner from './LoadingSpinner';

interface ManualEntryFormProps {
  onAddEntry: (idCardData: IDCardData) => Promise<VotingEntry>;
  onEntryAdded: () => void; // Callback to notify parent when entry is added
}

const DRAFT_STORAGE_KEY = 'manual-entry-draft';

const ManualEntryForm: React.FC<ManualEntryFormProps> = ({ onAddEntry, onEntryAdded }) => {
  // Form state
  const [formData, setFormData] = useState<Partial<IDCardData>>({});
  const [base64Image, setBase64Image] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<string | null>(null);
  
  // UI state
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  
  // Load draft from local storage on mount
  useEffect(() => {
    try {
      const savedDraft = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (savedDraft) {
        const parsedDraft = JSON.parse(savedDraft);
        setFormData(parsedDraft.formData || {});
        setBase64Image(parsedDraft.base64Image || null);
        setImageMimeType(parsedDraft.imageMimeType || null);
      }
    } catch (e) {
      console.error("Failed to load manual entry draft:", e);
      localStorage.removeItem(DRAFT_STORAGE_KEY);
    }
  }, []);

  // Save draft to local storage on change
  useEffect(() => {
    const isAutoSaveEnabled = localStorage.getItem('settings-autoSaveManualEntry') !== 'false';
    if (isAutoSaveEnabled) {
        const draft = { formData, base64Image, imageMimeType };
        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    }
  }, [formData, base64Image, imageMimeType]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));

    // Real-time validation for ID number
    if (name === 'idNumber') {
      const idNumberRegex = /^[a-zA-Z0-9-]{8,20}$/;
      if (value && !idNumberRegex.test(value)) {
        setErrors(prev => ({ ...prev, idNumber: "ID Number must be 8-20 alphanumeric characters or hyphens." }));
      } else {
        setErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors.idNumber;
          return newErrors;
        });
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Type validation
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        setErrors(prev => ({ ...prev, image: 'Invalid file type. Please upload JPEG, PNG, or WebP.' }));
        setBase64Image(null);
        setImageMimeType(null);
        if (e.target) e.target.value = ''; // Reset file input
        return;
      }

      // Size validation (e.g., max 10MB)
      const maxSizeInBytes = 10 * 1024 * 1024;
      if (file.size > maxSizeInBytes) {
        setErrors(prev => ({ ...prev, image: 'File is too large. Maximum size is 10MB.' }));
        setBase64Image(null);
        setImageMimeType(null);
        if (e.target) e.target.value = ''; // Reset file input
        return;
      }

      // Clear previous image error if validation passes
      if (errors.image) {
        const newErrors = { ...errors };
        delete newErrors.image;
        setErrors(newErrors);
      }
      
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        setBase64Image(dataUrl.split(',')[1]);
        setImageMimeType(file.type);
      };
      reader.readAsDataURL(file);
      // Reset file input value after successful selection to allow re-selecting the same file
      if (e.target) e.target.value = '';
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    const idNumberRegex = /^[a-zA-Z0-9-]{8,20}$/;
    const dobRegex = /^\d{2}[-\/.]\d{2}[-\/.]\d{4}$|^\d{4}[-\/.]\d{2}[-\/.]\d{2}$/;

    if (!formData.fullName?.trim()) newErrors.fullName = "Full Name is required.";
    
    if (!formData.dob?.trim()) {
        newErrors.dob = "Date of Birth is required.";
    } else if (!dobRegex.test(formData.dob.trim())) {
        newErrors.dob = "Invalid format. Use DD-MM-YYYY or YYYY-MM-DD.";
    }

    if (!formData.idNumber?.trim()) {
        newErrors.idNumber = "ID Number is required.";
    } else if (!idNumberRegex.test(formData.idNumber.trim())) {
        newErrors.idNumber = "ID Number must be 8-20 alphanumeric characters or hyphens.";
    }
    
    if (!formData.country?.trim()) newErrors.country = "Country is required.";
    if (!base64Image) newErrors.image = "An ID card image is required.";
    
    if (!formData.contactNumber?.trim()) {
      newErrors.contactNumber = "Contact Number is required.";
    } else if (!/^\+639\d{9}$/.test(formData.contactNumber.trim().replace(/\s/g, ''))) {
      newErrors.contactNumber = "Invalid format. Use +639XXXXXXXXX.";
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const resetForm = useCallback(() => {
    setFormData({});
    setBase64Image(null);
    setImageMimeType(null);
    setErrors({});
    localStorage.removeItem(DRAFT_STORAGE_KEY);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitSuccess(null);
    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      const finalData: IDCardData = {
        fullName: formData.fullName!,
        dob: formData.dob!,
        idNumber: formData.idNumber!,
        country: formData.country!,
        contactNumber: formData.contactNumber!.trim().replace(/\s/g, ''),
        issueDate: formData.issueDate || 'N/A',
        expiryDate: formData.expiryDate || 'N/A',
        address: formData.address || 'N/A',
        gender: formData.gender || 'N/A',
        facialDescription: formData.facialDescription || 'Manually entered data.',
        base64Image: base64Image!,
        imageMimeType: imageMimeType!,
        extractionTimestamp: new Date().toISOString(),
        confidenceScore: 1.0, // Manually entered data is considered confident
        facialDescriptionConfidence: 1.0,
      };
      
      await onAddEntry(finalData);
      setSubmitSuccess('Entry successfully created and sent for validation!');
      resetForm();
      onEntryAdded(); // Notify parent
    } catch (error) {
      console.error("Failed to submit manual entry:", error);
      setErrors({ form: "An error occurred during submission. Please try again." });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Fix: Added the missing return statement to ensure the component renders JSX.
  return (
    <div className="bg-theme-card p-6 rounded-lg shadow-md border border-theme-border">
        <h3 className="text-xl font-semibold mb-2">Manual Entry Creation</h3>
        <p className="text-sm text-gray-500 mb-6">Create a new voter entry manually. All fields marked with * are required. The entry will be added to the validation queue.</p>
        {submitSuccess && <div className="text-green-600 bg-green-100 p-3 rounded-md text-center mb-4" role="alert">{submitSuccess}</div>}
        {errors.form && <div className="text-red-500 bg-red-100 p-3 rounded-md text-center mb-4" role="alert">{errors.form}</div>}
        
        <form onSubmit={handleSubmit} noValidate>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
                {/* Text fields */}
                <Input name="fullName" label="Full Name *" value={formData.fullName || ''} onChange={handleInputChange} error={errors.fullName} required />
                <Input name="dob" label="Date of Birth *" value={formData.dob || ''} onChange={handleInputChange} error={errors.dob} placeholder="DD-MM-YYYY or YYYY-MM-DD" required />
                <Input name="idNumber" label="ID Number *" value={formData.idNumber || ''} onChange={handleInputChange} error={errors.idNumber} required />
                <Input name="country" label="Country of Issuance *" value={formData.country || ''} onChange={handleInputChange} error={errors.country} required />
                <Input name="contactNumber" label="Contact Number *" value={formData.contactNumber || ''} onChange={handleInputChange} error={errors.contactNumber} placeholder="+639XXXXXXXXX" required />
                <Input name="gender" label="Gender" value={formData.gender || ''} onChange={handleInputChange} />
                <Input name="issueDate" label="Issue Date" value={formData.issueDate || ''} onChange={handleInputChange} placeholder="DD-MM-YYYY" />
                <Input name="expiryDate" label="Expiry Date" value={formData.expiryDate || ''} onChange={handleInputChange} placeholder="DD-MM-YYYY" />
                <Input name="address" label="Address" value={formData.address || ''} onChange={handleInputChange} className="md:col-span-2" />
                <Input name="facialDescription" label="Facial Description" value={formData.facialDescription || ''} onChange={handleInputChange} className="md:col-span-2" placeholder="Brief, objective description..." />
                
                {/* Image upload */}
                <div className="md:col-span-2 mt-4">
                    <label className="block text-sm font-medium text-theme-text mb-1" htmlFor="manual-file-upload">ID Card Image *</label>
                    <div className="flex items-center gap-4">
                        <input type="file" id="manual-file-upload" accept="image/jpeg, image/png, image/webp" onChange={handleFileChange} className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-theme-primary/10 file:text-theme-primary hover:file:bg-theme-primary/20" />
                        {base64Image && imageMimeType && (
                            <img src={`data:${imageMimeType};base64,${base64Image}`} alt="ID Preview" className="h-16 w-auto rounded border border-theme-border" />
                        )}
                    </div>
                    {errors.image && <p className="mt-1 text-sm text-red-600">{errors.image}</p>}
                </div>
            </div>

            <div className="mt-8 flex justify-end gap-4 border-t border-theme-border pt-6">
                <Button type="button" variant="secondary" onClick={resetForm} disabled={isSubmitting}>Clear Form</Button>
                <Button type="submit" variant="primary" disabled={isSubmitting}>
                    {isSubmitting ? <LoadingSpinner /> : 'Submit for Validation'}
                </Button>
            </div>
        </form>
    </div>
  );
};
export default ManualEntryForm;