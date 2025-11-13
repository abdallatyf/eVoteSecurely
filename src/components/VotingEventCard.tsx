import React from 'react';
import { VOTING_EVENT_NAME } from '../constants';

interface VotingEventCardProps {
  validatedVoteCount: number;
  votingEventDate: string; // Prop for the scheduled date
}

const VotingEventCard: React.FC<VotingEventCardProps> = ({ validatedVoteCount, votingEventDate }) => {
  const displayDate = votingEventDate 
    ? new Date(votingEventDate).toLocaleDateString(undefined, { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' }) 
    : 'Not Scheduled';

  return (
    <div className="bg-theme-card p-6 rounded-lg shadow-md border border-theme-border text-theme-text">
      <h3 className="text-xl font-semibold mb-2 text-center">Voting Event: {VOTING_EVENT_NAME}</h3>
      <p className="text-center text-lg font-medium mb-4">
        Scheduled Date: <span className={`font-bold ${votingEventDate ? 'text-theme-primary' : 'text-yellow-500'}`}>{displayDate}</span>
      </p>
      <div className="text-center border-t border-theme-border pt-4">
        <p className="text-3xl font-bold mb-2">Total Validated Votes:</p>
        <p className="text-6xl font-extrabold text-theme-primary">{validatedVoteCount}</p>
      </div>
    </div>
  );
};

export default VotingEventCard;