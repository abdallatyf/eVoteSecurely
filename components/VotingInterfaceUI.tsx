import React, { useState, useMemo } from 'react';
import { VotingEntry, Candidate } from '../types';
import { VOTING_EVENT_NAME } from '../constants';
import Button from './Button';
import Modal from './Modal';
import LoadingSpinner from './LoadingSpinner';

interface VotingInterfaceUIProps {
  entry: VotingEntry;
  candidates: Candidate[];
  onConfirmVote: (candidateId: string, candidateName: string) => Promise<void>;
  onClear: () => void;
}

const VotingInterfaceUI: React.FC<VotingInterfaceUIProps> = ({ entry, candidates, onConfirmVote, onClear }) => {
  const [isVoteModalOpen, setIsVoteModalOpen] = useState(false);
  const [isVoting, setIsVoting] = useState(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);

  const relevantCandidates = useMemo(() => {
    return candidates.filter(c => c.position === entry.assignedPosition);
  }, [candidates, entry.assignedPosition]);

  const selectedCandidate = useMemo(() => {
    return relevantCandidates.find(c => c.id === selectedCandidateId);
  }, [relevantCandidates, selectedCandidateId]);

  const handleVoteClick = () => {
    if (selectedCandidate) {
      setIsVoteModalOpen(true);
    }
  };

  const handleConfirm = async () => {
    if (!selectedCandidate) return;
    setIsVoting(true);
    try {
      await onConfirmVote(selectedCandidate.id, selectedCandidate.fullName);
    } catch (error) {
      console.error("Failed to record vote:", error);
      setIsVoting(false);
    }
  };
  
  const profileImageSrc = entry.idCardData.profilePictureBase64
    ? `data:image/jpeg;base64,${entry.idCardData.profilePictureBase64}`
    : `data:${entry.idCardData.imageMimeType};base64,${entry.idCardData.base64Image}`;

  return (
    <div className="bg-theme-card p-6 rounded-lg shadow-xl border-2 border-theme-primary text-theme-text max-w-4xl mx-auto">
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

      <div className="border-t border-theme-border pt-6">
        <p className="text-lg mb-1 text-center">You are voting for the position of:</p>
        <p className="text-3xl font-extrabold text-theme-primary mb-6 text-center">{entry.assignedPosition}</p>

        <div className="space-y-4">
          <h3 className="font-semibold text-center">Please select one candidate:</h3>
          {relevantCandidates.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {relevantCandidates.map(candidate => (
                <button
                  key={candidate.id}
                  onClick={() => setSelectedCandidateId(candidate.id)}
                  className={`p-4 rounded-lg border-2 text-center transition-all duration-200 ${
                    selectedCandidateId === candidate.id
                      ? 'border-theme-primary bg-theme-primary/10 ring-2 ring-theme-primary'
                      : 'border-theme-border bg-theme-background hover:border-theme-secondary'
                  }`}
                >
                  <img
                    src={candidate.profilePictureBase64 ? `data:image/jpeg;base64,${candidate.profilePictureBase64}` : `https://ui-avatars.com/api/?name=${encodeURIComponent(candidate.fullName)}&background=random`}
                    alt={candidate.fullName}
                    className="w-24 h-24 rounded-full object-cover mx-auto mb-3 border-2 border-theme-border"
                  />
                  <p className="font-bold">{candidate.fullName}</p>
                  <p className="text-sm text-gray-500">{candidate.party || 'Independent'}</p>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-center text-gray-500 py-8">No candidates have been configured for this position.</p>
          )}
        </div>
        
        <div className="text-center mt-8">
            <Button
            onClick={handleVoteClick}
            size="lg"
            disabled={!selectedCandidateId}
            className="w-full max-w-md !text-2xl !py-4 !bg-green-600 hover:!bg-green-700 focus:ring-green-500 disabled:!bg-gray-400 disabled:cursor-not-allowed"
            >
            CAST YOUR VOTE
            </Button>
        </div>
      </div>

      <div className="text-center mt-6">
        <button onClick={onClear} className="text-sm text-gray-500 hover:text-theme-primary hover:underline">
          Not you? or Problem with details? Clear and rescan.
        </button>
      </div>
      
      <Modal isOpen={isVoteModalOpen} onClose={() => !isVoting && setIsVoteModalOpen(false)} title="Confirm Your Vote">
        {selectedCandidate && (
            <div className="p-4">
            <p className="mb-6 text-lg">You have selected to cast your vote for:</p>
            <div className="p-4 rounded-md bg-theme-background border border-theme-border mb-6 text-center">
                <p className="text-2xl font-bold text-theme-primary">{selectedCandidate.fullName}</p>
                <p className="text-md text-gray-500">{selectedCandidate.party || 'Independent'}</p>
                <p className="mt-2 text-sm">for the position of <strong>{entry.assignedPosition}</strong>.</p>
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
        )}
      </Modal>
    </div>
  );
};

export default VotingInterfaceUI;