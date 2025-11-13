import React, { useState, useMemo, useCallback } from 'react';
import { Candidate } from '../types';
import { CONSTITUTIONAL_POSITIONS } from '../constants';
import Button from './Button';
import Modal from './Modal';
import Input from './Input';
import LoadingSpinner from './LoadingSpinner';

interface CandidateManagementProps {
  candidates: Candidate[];
  onAdd: (candidate: Omit<Candidate, 'id'>) => Promise<void>;
  onUpdate: (candidate: Candidate) => Promise<void>;
  onDelete: (candidateId: string) => Promise<void>;
}

const CandidateManagement: React.FC<CandidateManagementProps> = ({ candidates, onAdd, onUpdate, onDelete }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState<Candidate | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  
  // Form state
  const [fullName, setFullName] = useState('');
  const [party, setParty] = useState('');
  const [position, setPosition] = useState('');
  const [profilePictureBase64, setProfilePictureBase64] = useState<string | null>(null);
  const [imageError, setImageError] = useState('');

  const candidatesByPosition = useMemo(() => {
    const grouped: Record<string, Candidate[]> = {};
    CONSTITUTIONAL_POSITIONS.forEach(pos => {
      grouped[pos] = candidates.filter(c => c.position === pos);
    });
    return grouped;
  }, [candidates]);

  const handleOpenAddModal = (pos: string) => {
    setIsEditing(null);
    setFullName('');
    setParty('');
    setPosition(pos);
    setProfilePictureBase64(null);
    setError('');
    setImageError('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (candidate: Candidate) => {
    setIsEditing(candidate);
    setFullName(candidate.fullName);
    setParty(candidate.party || '');
    setPosition(candidate.position);
    setProfilePictureBase64(candidate.profilePictureBase64 || null);
    setError('');
    setImageError('');
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    if (isSubmitting) return;
    setIsModalOpen(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        setImageError('Invalid file type. Please upload JPEG, PNG, or WebP.');
        return;
      }
      const maxSizeInBytes = 2 * 1024 * 1024; // 2MB
      if (file.size > maxSizeInBytes) {
        setImageError('File is too large. Maximum size is 2MB.');
        return;
      }
      
      setImageError('');
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        setProfilePictureBase64(dataUrl.split(',')[1]);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDelete = async (candidate: Candidate) => {
    if (window.confirm(`Are you sure you want to delete the candidate "${candidate.fullName}"?`)) {
      await onDelete(candidate.id);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !position) {
      setError('Full Name and Position are required.');
      return;
    }
    
    setIsSubmitting(true);
    setError('');
    
    try {
      if (isEditing) {
        await onUpdate({
          id: isEditing.id,
          fullName,
          party,
          position,
          profilePictureBase64: profilePictureBase64 || undefined,
        });
      } else {
        await onAdd({
          fullName,
          party,
          position,
          profilePictureBase64: profilePictureBase64 || undefined,
        });
      }
      setIsModalOpen(false);
    } catch (err) {
      console.error(err);
      setError("An error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {CONSTITUTIONAL_POSITIONS.map(pos => (
        <div key={pos} className="bg-theme-card p-4 rounded-lg shadow-md border border-theme-border">
          <div className="flex justify-between items-center mb-4">
            <h4 className="text-lg font-semibold">{pos}</h4>
            <Button size="sm" variant="primary" onClick={() => handleOpenAddModal(pos)}>Add Candidate</Button>
          </div>
          <div className="space-y-3">
            {candidatesByPosition[pos].length > 0 ? (
              candidatesByPosition[pos].map(candidate => (
                <div key={candidate.id} className="flex items-center justify-between p-2 bg-theme-background rounded border border-theme-border">
                  <div className="flex items-center gap-3">
                    <img
                      src={candidate.profilePictureBase64 ? `data:image/jpeg;base64,${candidate.profilePictureBase64}` : `https://ui-avatars.com/api/?name=${encodeURIComponent(candidate.fullName)}&background=random`}
                      alt={candidate.fullName}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                    <div>
                      <p className="font-medium">{candidate.fullName}</p>
                      <p className="text-xs text-gray-500">{candidate.party || 'Independent'}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => handleOpenEditModal(candidate)}>Edit</Button>
                    <Button size="sm" variant="danger" onClick={() => handleDelete(candidate)}>Delete</Button>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500 text-center py-2">No candidates configured for this position.</p>
            )}
          </div>
        </div>
      ))}

      <Modal isOpen={isModalOpen} onClose={handleCloseModal} title={isEditing ? 'Edit Candidate' : 'Add New Candidate'}>
        <form onSubmit={handleSubmit} className="space-y-4 p-2">
          {error && <p className="text-red-500 text-sm text-center bg-red-100 dark:bg-red-900/20 p-2 rounded">{error}</p>}
          <Input label="Position" value={position} disabled required />
          <Input label="Full Name" value={fullName} onChange={e => setFullName(e.target.value)} required disabled={isSubmitting} />
          <Input label="Party / Affiliation" value={party} onChange={e => setParty(e.target.value)} disabled={isSubmitting} />
          <div>
            <label className="block text-sm font-medium text-theme-text mb-1">Profile Picture (Optional)</label>
            <div className="flex items-center gap-4">
              <input type="file" accept="image/jpeg, image/png, image/webp" onChange={handleFileChange} disabled={isSubmitting} className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-theme-primary/10 file:text-theme-primary hover:file:bg-theme-primary/20" />
              {profilePictureBase64 && (
                <img src={`data:image/jpeg;base64,${profilePictureBase64}`} alt="Preview" className="h-16 w-16 rounded-full object-cover border border-theme-border" />
              )}
            </div>
            {imageError && <p className="mt-1 text-sm text-red-600">{imageError}</p>}
          </div>
          <div className="flex justify-end space-x-2 mt-6">
            <Button type="button" variant="secondary" onClick={handleCloseModal} disabled={isSubmitting}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {isSubmitting ? <LoadingSpinner /> : (isEditing ? 'Save Changes' : 'Add Candidate')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default CandidateManagement;