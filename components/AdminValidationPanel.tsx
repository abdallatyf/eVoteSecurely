import React, { useState } from 'react';
import { VotingEntry, ValidationStatus } from '../types';
import Button from './Button';
import { useAuth } from './AuthProvider';
import Modal from './Modal';

interface AdminValidationPanelProps {
  pendingEntries: VotingEntry[];
  onValidateEntry: (entryId: string, status: ValidationStatus, reason?: string) => void;
}

const AdminValidationPanel: React.FC<AdminValidationPanelProps> = ({
  pendingEntries,
  onValidateEntry,
}) => {
  const { loggedInAdmin } = useAuth();
  const [selectedEntry, setSelectedEntry] = useState<VotingEntry | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectionError, setRejectionError] = useState<string | null>(null);

  const handleValidate = (status: ValidationStatus) => {
    if (selectedEntry && loggedInAdmin) {
      if (status === ValidationStatus.REJECTED) {
        if (!rejectionReason.trim()) {
          setRejectionError('A reason is required to reject an entry.');
          return;
        }
        onValidateEntry(selectedEntry.id, status, rejectionReason);
      } else {
        onValidateEntry(selectedEntry.id, status);
      }
      // Reset states and close modal
      setSelectedEntry(null);
      setRejectionReason('');
      setRejectionError(null);
    }
  };

  const handleCloseModal = () => {
    setSelectedEntry(null);
    setRejectionReason('');
    setRejectionError(null);
  };

  const getStatusBadgeClass = (status: ValidationStatus) => {
    switch (status) {
      case ValidationStatus.PENDING:
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-700 dark:text-yellow-100';
      case ValidationStatus.APPROVED:
        return 'bg-green-100 text-green-800 dark:bg-green-700 dark:text-green-100';
      case ValidationStatus.REJECTED:
        return 'bg-red-100 text-red-800 dark:bg-red-700 dark:text-red-100';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-100';
    }
  };

  return (
    <div className="bg-theme-card p-6 rounded-lg shadow-md border border-theme-border text-theme-text">
      <h3 className="text-xl font-semibold mb-4">Admin Validation Panel</h3>
      <p className="mb-4 text-sm text-yellow-500">
        As an authorized administrator ({loggedInAdmin?.fullName}), you can review and validate pending ID entries.
      </p>

      {pendingEntries.length === 0 ? (
        <p className="text-center text-gray-500">No pending entries for validation.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-theme-border">
            <thead className="bg-gray-100 dark:bg-slate-700">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                  Full Name
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                  ID Number
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                  Submission Date
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                  Status
                </th>
                <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-theme-border">
              {pendingEntries.map((entry) => (
                <tr key={entry.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{entry.idCardData.fullName}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">{entry.idCardData.idNumber}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">{new Date(entry.timestamp).toLocaleString()}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadgeClass(entry.validationStatus)}`}>
                      {entry.validationStatus.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                    <Button onClick={() => setSelectedEntry(entry)} variant="secondary" size="sm">
                      Review
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        isOpen={!!selectedEntry}
        onClose={handleCloseModal}
        title="Review Entry for Validation"
      >
        {selectedEntry && (
          <div className="space-y-4">
            <p><strong>Full Name:</strong> {selectedEntry.idCardData.fullName}</p>
            <p><strong>Date of Birth:</strong> {selectedEntry.idCardData.dob}</p>
            <p><strong>ID Number:</strong> {selectedEntry.idCardData.idNumber}</p>
            <p><strong>Contact Number:</strong> {selectedEntry.idCardData.contactNumber || 'N/A'}</p>
            <p><strong>Country:</strong> {selectedEntry.idCardData.country}</p>
            <p><strong>Issue Date:</strong> {selectedEntry.idCardData.issueDate || 'N/A'}</p>
            <p><strong>Expiry Date:</strong> {selectedEntry.idCardData.expiryDate || 'N/A'}</p>
            <p><strong>Address:</strong> {selectedEntry.idCardData.address || 'N/A'}</p>
            <p><strong>Gender:</strong> {selectedEntry.idCardData.gender || 'N/A'}</p>
            <p><strong>Facial Description:</strong> {selectedEntry.idCardData.facialDescription}</p>
            <p><strong>Other Text:</strong> {selectedEntry.idCardData.otherText || 'N/A'}</p>
            {selectedEntry.idCardData.confidenceScore !== undefined && (
              <p><strong>Extraction Confidence:</strong> {(selectedEntry.idCardData.confidenceScore * 100).toFixed(2)}%</p>
            )}
            <p><strong>Submission Time:</strong> {new Date(selectedEntry.timestamp).toLocaleString()}</p>
            {selectedEntry.idCardData.extractionTimestamp && (<p><strong>Extraction Time:</strong> {new Date(selectedEntry.idCardData.extractionTimestamp).toLocaleString()}</p>)}
            
            <div className="mt-4 pt-4 border-t border-theme-border">
                <label htmlFor="rejectionReason" className="block text-sm font-medium text-theme-text">
                    Rejection Reason (Required if rejecting)
                </label>
                <textarea
                    id="rejectionReason"
                    rows={3}
                    className="mt-1 block w-full px-3 py-2 border border-theme-border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-theme-primary sm:text-sm bg-theme-card text-theme-text"
                    value={rejectionReason}
                    onChange={(e) => {
                        setRejectionReason(e.target.value);
                        if (rejectionError) setRejectionError(null); // Clear error on typing
                    }}
                    placeholder="Provide a clear reason for rejection..."
                ></textarea>
                {rejectionError && <p className="mt-1 text-sm text-red-600">{rejectionError}</p>}
            </div>

            <div className="flex justify-end space-x-2 mt-6">
              <Button onClick={() => handleValidate(ValidationStatus.REJECTED)} variant="danger">
                Reject
              </Button>
              <Button onClick={() => handleValidate(ValidationStatus.APPROVED)} variant="primary">
                Approve
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default AdminValidationPanel;