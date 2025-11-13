import React, { useState } from 'react';
import { VotingEntry } from '../types';
import { VOTING_EVENT_NAME } from '../constants';
import Button from './Button';
import Modal from './Modal';
import LoadingSpinner from './LoadingSpinner';

interface VotingInterfaceUIProps {
  entry: VotingEntry;
  onConfirmVote: () => Promise<void>;
  onClear: () => void; // To go back
}

const VotingInterfaceUI: React.FC<VotingInterfaceUIProps> = ({ entry, onConfirmVote, onClear }) => {
  const [isVoteModalOpen, setIsVoteModalOpen] = useState(false);
  const [isVoting, setIsVoting] = useState(false);

  const handleVoteClick = () => {
    setIsVoteModalOpen(true);
  };

  const handleConfirm = async () => {
    setIsVoting(true);
    try {
      await onConfirmVote();
      // The parent component will re-render and this component will unmount.
      // No need to close modal or reset state here.
    } catch (error) {
      console.error("Failed to record vote:", error);
      // Optional: show an error message in the modal
      setIsVoting(false);
    }
  };
  
  const profileImageSrc = entry.idCardData.profilePictureBase64
    ? `data:image/jpeg;base64,${entry.idCardData.profilePictureBase64}`
    : `data:${entry.idCardData.imageMimeType};base64,${entry.idCardData.base64Image}`;


  return (
    <div className="bg-theme-card p-6 rounded-lg shadow-xl border-2 border-theme-primary text-theme-text max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-2 text-center text-theme-primary">Official Ballot</h2>
      <p className="text-center text-gray-500 mb-6 font-medium">{VOTING_EVENT_NAME}</p>
      
      <div className="flex flex-col md:flex-row items-center gap-6 mb-6 bg-theme-background p-4 rounded-lg border border-theme-border">
        <img
          src={profileImageSrc}
          alt={`Photo of ${entry.idCardData.fullName}`}
          className="w-32 h-32 rounded-full object-cover border-4 border-theme-border shadow-md"
        />
        <div>
          <p className="text-xl font-bold">{entry.idCardData.fullName}</p>
          <p className="text-sm text-gray-500">ID Number: {entry.idCardData.idNumber}</p>
          <p className="text-sm text-gray-500">Country: {entry.idCardData.country}</p>
        </div>
      </div>

      <div className="text-center border-t border-theme-border pt-6">
        <p className="text-lg mb-1">You are voting for the position of:</p>
        <p className="text-3xl font-extrabold text-theme-primary mb-8">{entry.assignedPosition}</p>

        <Button
          onClick={handleVoteClick}
          size="lg"
          className="w-full !text-2xl !py-4 !bg-green-600 hover:!bg-green-700 focus:ring-green-500"
        >
          CAST YOUR VOTE
        </Button>
      </div>

      <div className="text-center mt-6">
        <button onClick={onClear} className="text-sm text-gray-500 hover:text-theme-primary hover:underline">
          Not you? or Problem with details? Clear and rescan.
        </button>
      </div>
      
      <Modal isOpen={isVoteModalOpen} onClose={() => !isVoting && setIsVoteModalOpen(false)} title="Confirm Your Vote">
        <div className="p-4">
          <p className="mb-6 text-lg">You are about to cast your vote for the position of <strong>{entry.assignedPosition}</strong> in the <strong>{VOTING_EVENT_NAME}</strong>.</p>
          <div className="p-4 rounded-md bg-gray-100 dark:bg-slate-700 border border-theme-border mb-6">
            <p><strong>Voter:</strong> {entry.idCardData.fullName}</p>
            <p><strong>ID Number:</strong> {entry.idCardData.idNumber}</p>
          </div>
          <p className="font-bold text-red-500 mb-6 text-center">This action is final and cannot be undone.</p>
          <div className="flex justify-end space-x-3">
            <Button variant="secondary" onClick={() => setIsVoteModalOpen(false)} disabled={isVoting}>Cancel</Button>
            <Button
              variant="primary"
              className="!bg-green-600 hover:!bg-green-700 focus:ring-green-500"
              onClick={handleConfirm}
              disabled={isVoting}
            >
              {isVoting ? <LoadingSpinner /> : 'Confirm and Cast Vote'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default VotingInterfaceUI;