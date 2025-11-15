import React, { useState, useRef, useEffect, useCallback } from 'react';
import { VotingEntry, ValidationStatus, IDCardData } from '../types';
import Button from './Button';
import Modal from './Modal'; // Import the Modal component
import { calculateFacialSymmetry, FacialSymmetryResult } from '../utils/dataExportUtils'; // Import from utility
import Input from './Input';
import useZoomPan from '../utils/useZoomPan'; // Import useZoomPan
import ZoomControls from './ZoomControls';
import LoadingSpinner from './LoadingSpinner';

interface ExtractedIDDataProps {
  entry: VotingEntry;
  onClear: () => void;
  onUpdateIDData: (updatedIDCardData: IDCardData) => Promise<void>; // Prop now returns a Promise
  onUndoIDDataEdit: () => void;
  canUndo: boolean;
  onUpdateEntry: (updatedEntry: VotingEntry) => Promise<void>;
}

const dobRegex = /^\d{2}[-\/.]\d{2}[-\/.]\d{4}$|^\d{4}[-\/.]\d{2}[-\/.]\d{2}$/;
const idNumberRegex = /^[a-zA-Z0-9-]{8,20}$/;
const contactRegex = /^\+639\d{9}$/;

const ExtractedIDData: React.FC<ExtractedIDDataProps> = ({ entry, onClear, onUpdateIDData, onUndoIDDataEdit, canUndo, onUpdateEntry }) => {
  const { idCardData, timestamp, validationStatus } = entry;
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [showAllDetails, setShowAllDetails] = useState(false);
  const [showLandmarks, setShowLandmarks] = useState(false);
  const [showBwImage, setShowBwImage] = useState(false);
  const [facialSymmetry, setFacialSymmetry] = useState<FacialSymmetryResult | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportWithLandmarks, setExportWithLandmarks] = useState(false);

  // Edit Modal States
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editFullName, setEditFullName] = useState('');
  const [editDob, setEditDob] = useState('');
  const [editIdNumber, setEditIdNumber] = useState('');
  const [editCountry, setEditCountry] = useState('');
  const [editContactNumber, setEditContactNumber] = useState('');
  const [editIssueDate, setEditIssueDate] = useState('');
  const [editExpiryDate, setEditExpiryDate] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editGender, setEditGender] = useState('');
  const [editFacialDescription, setEditFacialDescription] = useState('');
  const [editOtherText, setEditOtherText] = useState('');
  const [editConfidenceScore, setEditConfidenceScore] = useState(0.0);
  const [editFacialDescriptionConfidence, setEditFacialDescriptionConfidence] = useState(0.0);
  const [isSaving, setIsSaving] = useState(false);
  const [savingProgress, setSavingProgress] = useState(0);
  const [editFormError, setEditFormError] = useState<string | null>(null);
  const [isContactEditingAllowed, setIsContactEditingAllowed] = useState(false);

  // Edit Form Error States
  const [editFullNameError, setEditFullNameError] = useState<string | null>(null);
  const [editDobError, setEditDobError] = useState<string | null>(null);
  const [editIdNumberError, setEditIdNumberError] = useState<string | null>(null);
  const [editCountryError, setEditCountryError] = useState<string | null>(null);
  const [editContactNumberError, setEditContactNumberError] = useState<string | null>(null);
  const [editFacialDescriptionError, setEditFacialDescriptionError] = useState<string | null>(null);
  const [editConfidenceScoreError, setEditConfidenceScoreError] = useState<string | null>(null);
  const [editFacialDescriptionConfidenceError, setEditFacialDescriptionConfidenceError] = useState<string | null>(null);

  const [modalBrightness, setModalBrightness] = useState(100);
  const [modalContrast, setModalContrast] = useState(100);
  const [modalLandmarkOpacity, setModalLandmarkOpacity] = useState(70);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modalCanvasRef = useRef<HTMLCanvasElement>(null);
  const wasDraggingRef = useRef(false);
  
  const activeImageSrc = showBwImage && idCardData.preprocessedBase64Image
    ? idCardData.preprocessedBase64Image
    : idCardData.base64Image;
  
  const activeImageMimeType = showBwImage && idCardData.preprocessedBase64Image
    ? 'image/png'
    : idCardData.imageMimeType;

  const mainViewContainerRef = useRef<HTMLDivElement>(null);
  const {
    transformStyle: mainViewTransformStyle,
    cursorStyle: mainViewCursorStyle,
    handleWheel: mainViewHandleWheel,
    handlePointerDown: mainViewHandlePointerDown,
    handlePointerMove: mainViewHandlePointerMove,
    handlePointerUp: mainViewHandlePointerUp,
    handleDoubleClick: mainViewHandleDoubleClick,
    isDragging: mainViewIsDragging,
    imageNaturalSize: mainViewImageNaturalSize,
    zoomIn: mainViewZoomIn,
    zoomOut: mainViewZoomOut,
    resetZoomPan: mainViewResetZoomPan,
  } = useZoomPan({
    containerRef: mainViewContainerRef,
    imageSrc: activeImageSrc,
    imageMimeType: activeImageMimeType,
    brightness: 100,
    contrast: 100,
  });

  const modalViewContainerRef = useRef<HTMLDivElement>(null);
  const {
    imageNaturalSize: modalViewImageNaturalSize,
    transformStyle: modalViewTransformStyle,
    filterStyle: modalViewFilterStyle,
    cursorStyle: modalViewCursorStyle,
    handleWheel: modalViewHandleWheel,
    handlePointerDown: modalViewHandlePointerDown,
    handlePointerMove: modalViewHandlePointerMove,
    handlePointerUp: modalViewHandlePointerUp,
    handlePointerCancel: modalViewHandlePointerCancel,
    handleDoubleClick: modalViewHandleDoubleClick,
    resetZoomPan: modalViewResetZoomPan,
    zoomIn: modalViewZoomIn,
    zoomOut: modalViewZoomOut,
  } = useZoomPan({
    containerRef: modalViewContainerRef,
    imageSrc: activeImageSrc,
    imageMimeType: activeImageMimeType,
    brightness: modalBrightness,
    contrast: modalContrast,
  });

  const modalViewResetImageAdjustments = useCallback(() => {
    setModalBrightness(100);
    setModalContrast(100);
    setModalLandmarkOpacity(70);
  }, []);

  const renderImageWithLandmarks = useCallback((
    canvas: HTMLCanvasElement,
    imageData: string,
    imageMime: string,
    landmarks: any | undefined,
    options: { radius?: number; color?: string; opacity?: number } = {}
  ) => {
    const { radius = 3, color = '#34d399', opacity = 1.0 } = options;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const hexToRgb = (hex: string) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    };

    const img = new Image();
    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      if (landmarks && Object.keys(landmarks).length > 0) {
        const rgbColor = hexToRgb(color);
        const finalColor = rgbColor ? `rgba(${rgbColor.r}, ${rgbColor.g}, ${rgbColor.b}, ${opacity})` : color;
        ctx.fillStyle = finalColor;
        ctx.strokeStyle = finalColor;
        ctx.lineWidth = 1;

        const drawPoint = (x: number, y: number) => {
          if (typeof x === 'number' && typeof y === 'number' && !isNaN(x) && !isNaN(y)) {
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, 2 * Math.PI);
            ctx.fill();
          }
        };

        const parseAndDraw = (obj: any) => {
          if (obj === null || typeof obj !== 'object') return;
          if (Array.isArray(obj)) {
            obj.forEach(item => parseAndDraw(item));
          } else if (typeof obj.x === 'number' && typeof obj.y === 'number') {
            drawPoint(obj.x, obj.y);
          } else {
            for (const key in obj) {
              if (obj.hasOwnProperty(key)) {
                parseAndDraw(obj[key]);
              }
            }
          }
        };
        parseAndDraw(landmarks);
      }
    };
    img.src = `data:${imageMime};base64,${imageData}`;
  }, []);

  useEffect(() => {
    if (activeImageSrc && activeImageMimeType && canvasRef.current && mainViewImageNaturalSize) {
      renderImageWithLandmarks(
        canvasRef.current,
        activeImageSrc,
        activeImageMimeType,
        showLandmarks ? idCardData.facialLandmarks : undefined
      );
    }
  }, [showLandmarks, activeImageSrc, activeImageMimeType, idCardData.facialLandmarks, renderImageWithLandmarks, mainViewImageNaturalSize]);

  useEffect(() => {
    if (isImageModalOpen && activeImageSrc && activeImageMimeType && modalCanvasRef.current && modalViewImageNaturalSize) {
      renderImageWithLandmarks(
        modalCanvasRef.current,
        activeImageSrc,
        activeImageMimeType,
        idCardData.facialLandmarks,
        { opacity: modalLandmarkOpacity / 100 }
      );
    }
  }, [isImageModalOpen, activeImageSrc, activeImageMimeType, idCardData.facialLandmarks, renderImageWithLandmarks, modalViewImageNaturalSize, modalLandmarkOpacity]);

  useEffect(() => {
    if (idCardData.facialLandmarks) {
      setFacialSymmetry(calculateFacialSymmetry(idCardData.facialLandmarks));
    } else {
      setFacialSymmetry(null);
    }
  }, [idCardData.facialLandmarks]);

  useEffect(() => {
    if (!isImageModalOpen) {
      modalViewResetZoomPan();
    }
  }, [isImageModalOpen, modalViewResetZoomPan]);

  useEffect(() => {
    modalViewResetImageAdjustments();
  }, [entry.id, modalViewResetImageAdjustments]);

  const handleCopyData = async () => {
    const dataToCopy = `
      --- ID Card Data ---
      Full Name: ${idCardData.fullName}
      Date of Birth: ${idCardData.dob}
      ID Number: ${idCardData.idNumber}
      Country: ${idCardData.country}
      Contact Number: ${idCardData.contactNumber || 'N/A'}
      Issue Date: ${idCardData.issueDate || 'N/A'}
      Expiry Date: ${idCardData.expiryDate || 'N/A'}
      Address: ${idCardData.address || 'N/A'}
      Gender: ${idCardData.gender || 'N/A'}
      Facial Description: ${idCardData.facialDescription}
      Other Text: ${idCardData.otherText || 'N/A'}
      
      --- Additional Entry Details ---
      QR Code Data: ${idCardData.qrCodeData || 'N/A'}
      Overall Confidence Score: ${(idCardData.confidenceScore !== undefined ? (idCardData.confidenceScore * 100).toFixed(2) : 'N/A')}%
      Facial Description Confidence: ${(idCardData.facialDescriptionConfidence !== undefined ? (idCardData.facialDescriptionConfidence * 100).toFixed(2) : 'N/A')}%
      Extraction Time: ${idCardData.extractionTimestamp ? new Date(idCardData.extractionTimestamp).toLocaleString() : 'N/A'}
      Submission Time: ${new Date(timestamp).toLocaleString()}
      Current Status: ${validationStatus.toUpperCase()}
      ${idCardData.facialLandmarks ? `Facial Landmarks: ${JSON.stringify(idCardData.facialLandmarks, null, 2)}` : ''}
      ${facialSymmetry ? `Facial Symmetry Score: ${facialSymmetry.score}% (${facialSymmetry.quality})` : ''}
    `.trim();

    try {
      await navigator.clipboard.writeText(dataToCopy);
      alert('ID Data copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy ID data:', err);
      alert('Failed to copy ID data. Please try again.');
    }
  };

  const hasLandmarks = idCardData.facialLandmarks && Object.keys(idCardData.facialLandmarks).length > 0;

  const handleExportImage = useCallback((format: 'image/png' | 'image/jpeg', includeLandmarks: boolean) => {
    const imageToExport = activeImageSrc;
    const mimeToExport = activeImageMimeType;

    if (!imageToExport || !mimeToExport) {
        alert('No image data available to export.');
        setIsExportModalOpen(false);
        return;
    }

    const img = new Image();
    img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            alert('Failed to get canvas context for export.');
            setIsExportModalOpen(false);
            return;
        }

        ctx.drawImage(img, 0, 0);

        if (includeLandmarks && hasLandmarks) {
            const landmarks = idCardData.facialLandmarks;
            const radius = 3;
            const color = '#34d399';
            ctx.fillStyle = color;
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;

            const drawPoint = (x: number, y: number) => {
                if (typeof x === 'number' && typeof y === 'number' && !isNaN(x) && !isNaN(y)) {
                    ctx.beginPath();
                    ctx.arc(x, y, radius, 0, 2 * Math.PI);
                    ctx.fill();
                }
            };

            const parseAndDraw = (obj: any) => {
                if (obj === null || typeof obj !== 'object') return;
                if (Array.isArray(obj)) {
                    obj.forEach(item => parseAndDraw(item));
                } else if (typeof obj.x === 'number' && typeof obj.y === 'number') {
                    drawPoint(obj.x, obj.y);
                } else {
                    for (const key in obj) {
                        if (obj.hasOwnProperty(key)) {
                            parseAndDraw(obj[key]);
                        }
                    }
                }
            };
            parseAndDraw(landmarks);
        }

        const timestampString = new Date().toISOString().slice(0, 19).replace(/[^0-9]/g, '');
        const filename = `id_card_export_${timestampString}.${format === 'image/png' ? 'png' : 'jpeg'}`;
        const dataURL = canvas.toDataURL(format, 0.9);
        const link = document.createElement('a');
        link.href = dataURL;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setIsExportModalOpen(false);
    };
    img.onerror = () => {
        alert('Failed to load image for export.');
        setIsExportModalOpen(false);
    };
    img.src = `data:${mimeToExport};base64,${imageToExport}`;
  }, [activeImageSrc, activeImageMimeType, idCardData.facialLandmarks, hasLandmarks]);

  const handleOpenEditModal = useCallback(() => {
    const allowEditing = localStorage.getItem('settings-allowContactEditing') === 'true';
    setIsContactEditingAllowed(allowEditing);

    setEditFullName(idCardData.fullName);
    setEditDob(idCardData.dob);
    setEditIdNumber(idCardData.idNumber);
    setEditCountry(idCardData.country);
    setEditContactNumber(idCardData.contactNumber || '');
    setEditIssueDate(idCardData.issueDate || '');
    setEditExpiryDate(idCardData.expiryDate || '');
    setEditAddress(idCardData.address || '');
    setEditGender(idCardData.gender || '');
    setEditFacialDescription(idCardData.facialDescription);
    setEditOtherText(idCardData.otherText || '');
    setEditConfidenceScore(idCardData.confidenceScore ?? 0.0);
    setEditFacialDescriptionConfidence(idCardData.facialDescriptionConfidence ?? 0.0);
    setEditFullNameError(null); setEditDobError(null); setEditIdNumberError(null);
    setEditCountryError(null); setEditContactNumberError(null); setEditFacialDescriptionError(null); 
    setEditConfidenceScoreError(null); setEditFacialDescriptionConfidenceError(null);
    setIsEditModalOpen(true);
  }, [idCardData]);

  const handleCloseEditModal = useCallback(() => {
      setIsEditModalOpen(false);
      setEditFormError(null);
      setIsSaving(false);
      setSavingProgress(0);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    
    const stateSetterMap: { [key: string]: React.Dispatch<React.SetStateAction<string>> } = {
        fullName: setEditFullName,
        dob: setEditDob,
        idNumber: setEditIdNumber,
        country: setEditCountry,
        contactNumber: setEditContactNumber,
        issueDate: setEditIssueDate,
        expiryDate: setEditExpiryDate,
        address: setEditAddress,
        gender: setEditGender,
        facialDescription: setEditFacialDescription,
        otherText: setEditOtherText,
    };

    if (stateSetterMap[name]) {
        stateSetterMap[name](value);
    }

    if (name === 'fullName') {
        if (!value.trim()) setEditFullNameError('Full Name is required.');
        else setEditFullNameError(null);
    } else if (name === 'dob') {
        if (!value.trim()) setEditDobError('Date of Birth is required.');
        else if (!dobRegex.test(value.trim())) setEditDobError('Invalid format (e.g., DD-MM-YYYY).');
        else setEditDobError(null);
    } else if (name === 'idNumber') {
        if (!value.trim()) setEditIdNumberError('ID Number is required.');
        else if (!idNumberRegex.test(value.trim())) setEditIdNumberError('Must be 8-20 alphanumeric/hyphens.');
        else setEditIdNumberError(null);
    }
  };

  const handleEditSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setEditFormError(null);
    setEditFullNameError(null); setEditDobError(null); setEditIdNumberError(null);
    setEditCountryError(null); setEditContactNumberError(null); setEditFacialDescriptionError(null); 
    setEditConfidenceScoreError(null); setEditFacialDescriptionConfidenceError(null);
    let hasError = false;
    
    if (!editFullName.trim()) { setEditFullNameError('Full Name is required.'); hasError = true; }
    if (!editDob.trim()) { setEditDobError('Date of Birth is required.'); hasError = true; }
    else if (!dobRegex.test(editDob)) { setEditDobError('Invalid date format.'); hasError = true; }
    if (!editIdNumber.trim()) { setEditIdNumberError('ID Number is required.'); hasError = true; }
    else if (!idNumberRegex.test(editIdNumber.trim())) { setEditIdNumberError('Must be 8-20 alphanumeric/hyphens.'); hasError = true; }
    if (!editCountry.trim()) { setEditCountryError('Country is required.'); hasError = true; }
    if (!editContactNumber.trim()) {
        setEditContactNumberError('Contact Number is required.');
        hasError = true;
    } else if (!contactRegex.test(editContactNumber.trim().replace(/\s/g, ''))) {
        setEditContactNumberError('Invalid format. Use +639XXXXXXXXX.');
        hasError = true;
    }
    if (!editFacialDescription.trim() || editFacialDescription.trim().length < 20) { setEditFacialDescriptionError('Description must be at least 20 characters.'); hasError = true; }
    if (editConfidenceScore < 0.0 || editConfidenceScore > 1.0 || isNaN(editConfidenceScore)) { setEditConfidenceScoreError('Score must be between 0.0 and 1.0.'); hasError = true; }
    if (editFacialDescriptionConfidence < 0.0 || editFacialDescriptionConfidence > 1.0 || isNaN(editFacialDescriptionConfidence)) { setEditFacialDescriptionConfidenceError('Score must be between 0.0 and 1.0.'); hasError = true; }
    if (hasError) return;

    setIsSaving(true);
    setSavingProgress(0);
    const progressInterval = setInterval(() => {
        setSavingProgress(prev => Math.min(prev + Math.floor(Math.random() * 15) + 5, 95));
    }, 250);

    try {
        const updatedIDCardData: IDCardData = {
            ...idCardData,
            fullName: editFullName, dob: editDob, idNumber: editIdNumber, country: editCountry,
            contactNumber: editContactNumber.trim().replace(/\s/g, ''),
            issueDate: editIssueDate, expiryDate: editExpiryDate, address: editAddress,
            gender: editGender, facialDescription: editFacialDescription, otherText: editOtherText, 
            confidenceScore: editConfidenceScore, 
            facialDescriptionConfidence: editFacialDescriptionConfidence,
        };
        await onUpdateIDData(updatedIDCardData);
        
        clearInterval(progressInterval);
        setSavingProgress(100);
        setTimeout(() => {
            handleCloseEditModal();
        }, 500);

    } catch (error) {
        clearInterval(progressInterval);
        console.error('Failed to save changes:', error);
        setEditFormError('Failed to save changes. Please check your connection and try again.');
        setIsSaving(false);
        setSavingProgress(0);
    }
  }, [
      editFullName, editDob, editIdNumber, editCountry, editContactNumber, editIssueDate, editExpiryDate, 
      editAddress, editGender, editFacialDescription, editOtherText, editConfidenceScore, 
      editFacialDescriptionConfidence, idCardData, onUpdateIDData, handleCloseEditModal
  ]);
  
  const customMainHandlePointerDown = (e: React.PointerEvent<HTMLElement>) => {
    wasDraggingRef.current = false;
    mainViewHandlePointerDown(e);
  };
  const customMainHandlePointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (mainViewIsDragging) wasDraggingRef.current = true;
    mainViewHandlePointerMove(e);
  };
  const customMainHandlePointerUp = (e: React.PointerEvent<HTMLElement>) => {
    if (!wasDraggingRef.current) setIsImageModalOpen(true);
    mainViewHandlePointerUp(e);
  };

  const hasFormErrors = !!(
    editFullNameError ||
    editDobError ||
    editIdNumberError ||
    editCountryError ||
    editContactNumberError ||
    editFacialDescriptionError ||
    editConfidenceScoreError ||
    editFacialDescriptionConfidenceError
  );

  return (
    <div className="bg-theme-card p-6 rounded-lg shadow-md border border-theme-border text-theme-text mt-6">
      <h3 className="text-xl font-semibold mb-4">Extracted ID Data</h3>
      {entry.validationStatus === ValidationStatus.PENDING && (
        <p className="text-sm text-yellow-500 mb-4">
            This entry has been successfully submitted and is now awaiting administrator validation.
        </p>
      )}
      {entry.validationStatus === ValidationStatus.REJECTED && (
          <div className="text-sm text-red-500 mb-4 p-3 bg-red-100 dark:bg-red-900/20 rounded-md border border-red-200 dark:border-red-800/50">
              <p className="font-bold">This entry has been reviewed and was rejected by an administrator.</p>
              {entry.rejectionReason && (
                <p className="mt-2"><strong>Reason:</strong> {entry.rejectionReason}</p>
              )}
          </div>
      )}
      {entry.validationStatus === ValidationStatus.APPROVED && !entry.hasVoted && (
          <p className="text-sm text-green-500 mb-4">
              This voter's identity has been approved. Please follow the instructions to cast your vote.
          </p>
      )}
      {entry.validationStatus === ValidationStatus.APPROVED && entry.hasVoted && (
          <div className="text-sm text-blue-500 mb-4 p-3 bg-blue-100 dark:bg-blue-900/20 rounded-md border border-blue-200 dark:border-blue-800/50">
            <p className="font-bold">Thank you for voting!</p>
            <p>Your vote for <span className="font-semibold">{entry.votedForCandidateName}</span> in the <span className="font-semibold">{entry.assignedPosition}</span> race has been recorded.</p>
          </div>
      )}

    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6 items-start">
        <div className="md:col-span-1 flex flex-col items-center justify-center">
            {idCardData.profilePictureBase64 ? (
                <>
                    <p className="text-sm font-semibold text-gray-500 mb-2">Voter Profile Picture</p>
                    <img 
                        src={`data:image/jpeg;base64,${idCardData.profilePictureBase64}`} 
                        alt="Voter's profile" 
                        className="w-40 h-40 rounded-full object-cover border-4 border-theme-border shadow-lg" 
                    />
                </>
            ) : (
                <>
                    <p className="text-sm font-semibold text-gray-500 mb-2">Voter Profile Picture</p>
                    <div className="w-40 h-40 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-center text-sm text-gray-500 p-4 border-2 border-dashed border-theme-border">
                        No live profile picture was captured for this entry.
                    </div>
                </>
            )}
        </div>
        <div className="md:col-span-2">
            {idCardData.base64Image && idCardData.imageMimeType && (
                <div className="flex flex-col items-center">
                    <p className="text-sm text-gray-500 mb-2">Scanned ID Card Image (Scroll to zoom, drag to pan):</p>
                    <div className="flex justify-center flex-wrap gap-2 mb-2">
                        <Button variant="secondary" size="sm" onClick={() => setShowLandmarks(!showLandmarks)} className="mb-2" disabled={!hasLandmarks}>
                        {showLandmarks ? 'Hide Facial Landmarks' : 'Show Facial Landmarks'}
                        </Button>
                        {idCardData.preprocessedBase64Image && (
                        <Button variant="secondary" size="sm" onClick={() => setShowBwImage(!showBwImage)} className="mb-2">
                            {showBwImage ? 'Show Original Color' : 'Show B&W for OCR'}
                        </Button>
                        )}
                    </div>
                    <div
                        ref={mainViewContainerRef}
                        onWheel={mainViewHandleWheel}
                        onPointerDown={customMainHandlePointerDown}
                        onPointerMove={customMainHandlePointerMove}
                        onPointerUp={customMainHandlePointerUp}
                        onPointerCancel={mainViewHandlePointerUp}
                        onDoubleClick={mainViewHandleDoubleClick}
                        className="relative w-full max-w-sm h-auto aspect-[1.586] bg-gray-200 dark:bg-gray-800 flex justify-center items-center overflow-hidden rounded-md border border-theme-border shadow-sm"
                        style={mainViewCursorStyle}
                        aria-label="Scanned ID card image. Scroll to zoom, drag to pan, click to open larger view."
                    >
                        {mainViewImageNaturalSize ? (
                        <canvas
                            ref={canvasRef}
                            style={{
                            ...mainViewTransformStyle,
                            display: 'block',
                            position: 'absolute',
                            width: mainViewImageNaturalSize.width,
                            height: mainViewImageNaturalSize.height,
                            }}
                        ></canvas>
                        ) : (
                        <p className="text-center p-4 text-sm text-gray-500">Loading image...</p>
                        )}
                        {mainViewImageNaturalSize && (
                        <ZoomControls onZoomIn={mainViewZoomIn} onZoomOut={mainViewZoomOut} onReset={mainViewResetZoomPan} />
                        )}
                    </div>
                </div>
            )}
        </div>
    </div>


      <div className="flex justify-end mb-4">
        <Button variant="secondary" size="sm" onClick={() => setShowAllDetails(!showAllDetails)}>
          {showAllDetails ? 'Show Less Details' : 'Show More Details'}
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        <div>
          <p><strong>Full Name:</strong> {idCardData.fullName}</p>
          <p><strong>Date of Birth:</strong> {idCardData.dob}</p>
          <p><strong>ID Number:</strong> {idCardData.idNumber}</p>
          <p><strong>Country:</strong> {idCardData.country}</p>
        </div>
        <div>
          <p><strong>Submission Time:</strong> {new Date(timestamp).toLocaleString()}</p>
          {idCardData.extractionTimestamp && (<p><strong>Extraction Time:</strong> {new Date(idCardData.extractionTimestamp).toLocaleString()}</p>)}
          <p><strong>Current Status:</strong> <span className={`font-bold ${validationStatus === ValidationStatus.PENDING ? 'text-yellow-500' : validationStatus === ValidationStatus.APPROVED ? 'text-green-500' : 'text-red-500'}`}>{validationStatus.toUpperCase()}</span></p>
          {idCardData.confidenceScore !== undefined && (<p><strong>Overall Confidence:</strong> {(idCardData.confidenceScore * 100).toFixed(2)}%</p>)}
          {idCardData.facialDescriptionConfidence !== undefined && (<p><strong>Facial Desc. Confidence:</strong> {(idCardData.facialDescriptionConfidence * 100).toFixed(2)}%</p>)}
        </div>
      </div>

      {showAllDetails && (
        <div className="mt-6 pt-4 border-t border-theme-border text-sm grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p><strong>Contact Number:</strong> {idCardData.contactNumber || 'N/A'}</p>
            <p><strong>Issue Date:</strong> {idCardData.issueDate || 'N/A'}</p>
            <p><strong>Expiry Date:</strong> {idCardData.expiryDate || 'N/A'}</p>
            <p><strong>Address:</strong> {idCardData.address || 'N/A'}</p>
            <p><strong>Gender:</strong> {idCardData.gender || 'N/A'}</p>
            <p className="mt-4"><strong>Facial Description:</strong> {idCardData.facialDescription}</p>
            {idCardData.facialLandmarks && (<div className="mt-4"><p className="font-semibold text-theme-primary">Facial Landmarks (Raw Data):</p><pre className="whitespace-pre-wrap break-all text-xs bg-gray-100 dark:bg-slate-700 p-2 rounded-md mt-1">{JSON.stringify(idCardData.facialLandmarks, null, 2)}</pre></div>)}
            {facialSymmetry && facialSymmetry.quality !== 'N/A' && (<div className="mt-4"><p className="font-semibold text-theme-primary">Facial Symmetry Analysis:</p><p><strong>Quality:</strong> {facialSymmetry.quality}</p><p><strong>Score:</strong> {facialSymmetry.score}%</p>{facialSymmetry.description && <p className="text-xs text-gray-500 mt-1 italic">{facialSymmetry.description}</p>}</div>)}
            <p className="mt-4"><strong>Other Text:</strong> {idCardData.otherText || 'N/A'}</p>
          </div>
          <div>{idCardData.qrCodeData && (<p><strong>QR Code Data:</strong> <span className="break-all">{idCardData.qrCodeData}</span></p>)}</div>
        </div>
      )}

      <div className="mt-6 text-center flex justify-center flex-wrap gap-2">
        <Button onClick={onClear} variant="secondary">Clear Entry</Button>
        <Button onClick={handleCopyData} variant="secondary">Copy ID Data</Button>
        <Button onClick={handleOpenEditModal} variant="secondary">Edit Data</Button>
        {idCardData.voterQRCodeBase64 && (
          <Button onClick={() => setIsQrModalOpen(true)} variant="secondary">Show Voter QR Code</Button>
        )}
        <Button onClick={onUndoIDDataEdit} variant="secondary" disabled={!canUndo}>Undo Last Edit</Button>
        {idCardData.base64Image && (<Button onClick={() => { setIsExportModalOpen(true); setExportWithLandmarks(showLandmarks); }} variant="secondary">Export Image</Button>)}
      </div>

      <Modal isOpen={isImageModalOpen} onClose={() => setIsImageModalOpen(false)} title="Scanned ID Card (Zoomed)">
        {activeImageSrc && activeImageMimeType ? (
          <div className="flex flex-col items-center w-full h-[70vh]">
            <div className="flex flex-col lg:flex-row justify-center items-center gap-4 mb-4 w-full px-4">
              <div className="flex items-center gap-2 w-full lg:w-1/3"><label htmlFor="brightness-slider" className="text-sm font-medium whitespace-nowrap">Brightness:</label><input id="brightness-slider" type="range" min="0" max="200" value={modalBrightness} onChange={(e) => setModalBrightness(parseInt(e.target.value, 10))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700" /><span className="text-sm w-10 text-right">{modalBrightness}%</span></div>
              <div className="flex items-center gap-2 w-full lg:w-1/3"><label htmlFor="contrast-slider" className="text-sm font-medium whitespace-nowrap">Contrast:</label><input id="contrast-slider" type="range" min="0" max="200" value={modalContrast} onChange={(e) => setModalContrast(parseInt(e.target.value, 10))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700" /><span className="text-sm w-10 text-right">{modalContrast}%</span></div>
              {hasLandmarks && (
                <div className="flex items-center gap-2 w-full lg:w-1/3"><label htmlFor="landmark-opacity-slider" className="text-sm font-medium whitespace-nowrap">Landmark Opacity:</label><input id="landmark-opacity-slider" type="range" min="0" max="100" value={modalLandmarkOpacity} onChange={(e) => setModalLandmarkOpacity(parseInt(e.target.value, 10))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700" /><span className="text-sm w-10 text-right">{modalLandmarkOpacity}%</span></div>
              )}
              <Button onClick={modalViewResetImageAdjustments} variant="secondary" size="sm" className="whitespace-nowrap flex-shrink-0">Reset</Button>
            </div>
            <div ref={modalViewContainerRef} onWheel={modalViewHandleWheel} onPointerDown={modalViewHandlePointerDown} onPointerMove={modalViewHandlePointerMove} onPointerUp={modalViewHandlePointerUp} onPointerCancel={modalViewHandlePointerCancel} onDoubleClick={modalViewHandleDoubleClick} className="relative w-full h-full bg-gray-200 dark:bg-gray-800 flex justify-center items-center overflow-hidden rounded-md" style={modalViewCursorStyle}>
              {modalViewImageNaturalSize ? (<canvas ref={modalCanvasRef} style={{ ...modalViewTransformStyle, ...modalViewFilterStyle, display: 'block', position: 'absolute', width: modalViewImageNaturalSize.width, height: modalViewImageNaturalSize.height }}></canvas>) : (<p className="text-center p-4">Loading image for display...</p>)}
              {modalViewImageNaturalSize && (
                  <ZoomControls onZoomIn={modalViewZoomIn} onZoomOut={modalViewZoomOut} onReset={modalViewResetZoomPan} />
              )}
            </div>
          </div>
        ) : (<p className="text-center p-4">No image data available for display.</p>)}
      </Modal>

      <Modal isOpen={isExportModalOpen} onClose={() => setIsExportModalOpen(false)} title="Export ID Card Image">
        <div className="text-theme-text p-4"><p className="mb-6">Choose format and options. <span className="font-bold text-red-500 block mt-2">Note: Brightness/contrast adjustments are NOT applied to exports.</span></p><div className="flex items-center justify-center mb-6"><input type="checkbox" id="include-landmarks-checkbox" checked={exportWithLandmarks} onChange={(e) => setExportWithLandmarks(e.target.checked)} className="mr-2 h-4 w-4 text-theme-primary focus:ring-theme-primary border-gray-300 rounded" disabled={!hasLandmarks} /><label htmlFor="include-landmarks-checkbox" className="text-sm cursor-pointer select-none">Include Facial Landmarks</label>{!hasLandmarks && (<span className="text-xs text-gray-500 ml-2 italic">(No landmarks detected.)</span>)}</div><div className="flex justify-center space-x-4"><Button onClick={() => handleExportImage('image/png', exportWithLandmarks)} variant="primary">Export as PNG</Button><Button onClick={() => handleExportImage('image/jpeg', exportWithLandmarks)} variant="secondary">Export as JPEG</Button></div></div>
      </Modal>

      <Modal isOpen={isEditModalOpen} onClose={!isSaving ? handleCloseEditModal : () => {}} title="Edit Extracted ID Card Data">
        <form onSubmit={handleEditSubmit} className="space-y-4 p-2">
          <p className="text-sm text-yellow-600 dark:text-yellow-400 mb-4">Warning: Editing will revert status to 'PENDING' for re-validation.</p>
          {editFormError && <p className="text-red-500 text-sm text-center bg-red-100 dark:bg-red-900/20 p-2 rounded">{editFormError}</p>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
            <Input name="fullName" label="Full Name" type="text" value={editFullName} onChange={handleInputChange} required error={editFullNameError} disabled={isSaving} />
            <Input name="dob" label="Date of Birth" type="text" value={editDob} onChange={handleInputChange} required placeholder="DD-MM-YYYY or YYYY-MM-DD" error={editDobError} disabled={isSaving} />
            <Input name="idNumber" label="ID Number" type="text" value={editIdNumber} onChange={handleInputChange} required error={editIdNumberError} disabled={isSaving} />
            <Input name="country" label="Country" type="text" value={editCountry} onChange={(e) => setEditCountry(e.target.value)} required error={editCountryError} disabled={isSaving} />
            <Input name="contactNumber" label="Contact Number" type="text" value={editContactNumber} onChange={(e) => setEditContactNumber(e.target.value)} required placeholder="+639XXXXXXXXX" error={editContactNumberError} disabled={isSaving || !isContactEditingAllowed} title={!isContactEditingAllowed ? "Editing is disabled by an administrator." : ""} />
            <Input name="gender" label="Gender (Optional)" type="text" value={editGender} onChange={(e) => setEditGender(e.target.value)} disabled={isSaving} />
            <Input name="issueDate" label="Issue Date (Optional)" type="text" value={editIssueDate} onChange={(e) => setEditIssueDate(e.target.value)} placeholder="e.g., 01-01-2020" disabled={isSaving} />
            <Input name="expiryDate" label="Expiry Date (Optional)" type="text" value={editExpiryDate} onChange={(e) => setEditExpiryDate(e.target.value)} placeholder="e.g., 01-01-2030" disabled={isSaving} />
            <Input name="address" label="Address (Optional)" type="text" value={editAddress} onChange={(e) => setEditAddress(e.target.value)} disabled={isSaving} className="md:col-span-2" />
            <Input name="facialDescription" label="Facial Description" type="text" value={editFacialDescription} onChange={(e) => setEditFacialDescription(e.target.value)} required error={editFacialDescriptionError} disabled={isSaving} className="md:col-span-2" />
            <Input name="otherText" label="Other Text (Optional)" type="text" value={editOtherText} onChange={(e) => setEditOtherText(e.target.value)} disabled={isSaving} className="md:col-span-2" />
            <Input label="Overall Confidence" type="number" min="0.0" max="1.0" step="0.01" value={editConfidenceScore} onChange={(e) => setEditConfidenceScore(parseFloat(e.target.value))} required error={editConfidenceScoreError} disabled={isSaving} />
            <Input label="Facial Desc. Confidence" type="number" min="0.0" max="1.0" step="0.01" value={editFacialDescriptionConfidence} onChange={(e) => setEditFacialDescriptionConfidence(parseFloat(e.target.value))} required error={editFacialDescriptionConfidenceError} disabled={isSaving} />
          </div>
          {isSaving && (
            <div className="text-center pt-4">
              <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2.5">
                <div className="bg-theme-primary h-2.5 rounded-full transition-all duration-200" style={{ width: `${savingProgress}%` }}></div>
              </div>
              <p className="text-sm text-gray-500 mt-2">Saving... {savingProgress}%</p>
            </div>
          )}
          <div className="flex justify-end space-x-2 mt-6">
            <Button type="button" variant="secondary" onClick={handleCloseEditModal} disabled={isSaving}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={isSaving || hasFormErrors}>
                {isSaving ? <LoadingSpinner /> : 'Save Changes'}
            </Button>
          </div>
        </form>
      </Modal>
      <Modal isOpen={isQrModalOpen} onClose={() => setIsQrModalOpen(false)} title="Voter QR Code">
        {idCardData.voterQRCodeBase64 && (
          <div className="text-center p-4">
              <p className="mb-4">This QR code can be used for quick check-in or verification.</p>
              <img 
                  src={`data:image/png;base64,${idCardData.voterQRCodeBase64}`} 
                  alt="Voter QR Code" 
                  className="mx-auto w-64 h-64 border-4 border-theme-border rounded-lg" 
              />
              <p className="text-xs text-gray-500 mt-4 break-all">
                  Encoded data: {JSON.stringify({ entryId: entry.id, idNumber: idCardData.idNumber, fullName: idCardData.fullName })}
              </p>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ExtractedIDData;