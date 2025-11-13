import React, { useState, useRef, useCallback, useEffect } from 'react';
import { IDCardData } from '../types';
import { extractIDCardData, extractIDCardDataTextOnly } from '../services/geminiService';
import { analyzeImageQuality, ImageQualityReport } from '../utils/imageQualityAnalysis';
import { preprocessImageForOCR } from '../utils/imagePreprocessing';
import { applyTransformationsToImage, applyImageAdjustments } from '../utils/imageTransformation';
import Button from './Button';
import LoadingSpinner from './LoadingSpinner';
import Modal from './Modal';

interface IDScannerProps {
  onIDDataExtracted: (idCardData: IDCardData) => void;
}

const IDScanner: React.FC<IDScannerProps> = ({ onIDDataExtracted }) => {
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Extracting data...');
  const [error, setError] = useState<string | null>(null);
  const [capturedImage, setCapturedImage] = useState<{ data: string; mimeType: string } | null>(null);
  const [imageQualityReport, setImageQualityReport] = useState<ImageQualityReport | null>(null);
  const [isAnalysisRunning, setIsAnalysisRunning] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [qrCodeData, setQrCodeData] = useState<string | null>(null);

  // Manual Edit State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editImageSrc, setEditImageSrc] = useState<string>('');
  const [rotation, setRotation] = useState(0);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [isExtractingAfterEdit, setIsExtractingAfterEdit] = useState(false);

  // Profile Picture State
  const [isProfilePicModalOpen, setIsProfilePicModalOpen] = useState(false);
  const [profilePicStep, setProfilePicStep] = useState<'capture' | 'preview'>('capture');
  const [capturedProfilePic, setCapturedProfilePic] = useState<string | null>(null);
  const [confirmedProfilePic, setConfirmedProfilePic] = useState<string | null>(null);

  // Preprocessing controls state
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [sharpnessSensitivity, setSharpnessSensitivity] = useState(100);
  const [binarizationConstant, setBinarizationConstant] = useState(7);
  const [claheClipLimit, setClaheClipLimit] = useState(2.0);
  const [claheGridSize, setClaheGridSize] = useState(8);
  const [preprocessedPreview, setPreprocessedPreview] = useState<string | null>(null);
  const [isPreprocessingPreview, setIsPreprocessingPreview] = useState(false);
  const debounceTimer = useRef<number | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsCameraOn(false);
  };

  const startCamera = async (mode: 'environment' | 'user' = 'environment') => {
    stopCamera(); // Stop any existing stream
    setFacingMode(mode); // Keep track of the current mode
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: mode,
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setIsCameraOn(true);
          if (mode === 'environment') {
            setCapturedImage(null);
          }
          setError(null);
        }
      } catch (err) {
        console.error('Error accessing camera:', err);
        setError(`Could not access the ${mode} camera. Please check permissions and try again.`);
        setIsCameraOn(false);
      }
    }
  };
  
  const handleSwitchCamera = () => {
    const newMode = facingMode === 'environment' ? 'user' : 'environment';
    startCamera(newMode);
  };

  useEffect(() => {
    // General cleanup on unmount
    return () => stopCamera();
  }, []);

  useEffect(() => {
    if (isProfilePicModalOpen && profilePicStep === 'capture') {
      startCamera('user');
    } else if (!isProfilePicModalOpen) {
      // If the main camera was on before opening the modal, this will stop it.
      // A better approach would be to restore state, but for now this is simpler.
      stopCamera();
    }
  }, [isProfilePicModalOpen, profilePicStep]);

  useEffect(() => {
    let interval: number;
    if (isAnalysisRunning) {
        setAnalysisProgress(0);
        interval = window.setInterval(() => {
            setAnalysisProgress(prev => {
                if (prev >= 95) {
                    clearInterval(interval);
                    return prev;
                }
                const increment = 5 + Math.random() * 10;
                return Math.min(prev + increment, 95);
            });
        }, 300);
    }
    return () => {
        if (interval) clearInterval(interval);
    };
}, [isAnalysisRunning]);

  const analyzeImage = useCallback(async (imageDataUrl: string, currentSharpness: number) => {
    if (!canvasRef.current) return;
    setIsAnalysisRunning(true);
    setQrCodeData(null);
    setImageQualityReport(null);

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
        setIsAnalysisRunning(false);
        return;
    }

    const img = new Image();
    img.onload = async () => {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        const focusThresholdRatio = 8 / 100;

        const [qualityReport, qrCodeResult] = await Promise.all([
            analyzeImageQuality(imageData, { blurThreshold: currentSharpness, focusThreshold: currentSharpness * focusThresholdRatio }),
            window.jsQR ? Promise.resolve(window.jsQR(imageData.data, imageData.width, imageData.height)) : Promise.resolve(null)
        ]);
        
        setImageQualityReport(qualityReport);
        if (qrCodeResult) setQrCodeData(qrCodeResult.data);
        
        setAnalysisProgress(100);
        setTimeout(() => setIsAnalysisRunning(false), 500);
    };
    img.src = imageDataUrl;
  }, []);
  
  const generatePreprocessedPreview = useCallback(async (imageDataUrl: string, C: number, clip: number, grid: number) => {
    if (!canvasRef.current) return;
    setIsPreprocessingPreview(true);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
        setIsPreprocessingPreview(false);
        return;
    }
    const img = new Image();
    img.onload = async () => {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        try {
            const preprocessed = await preprocessImageForOCR(imageData, {
                binarizationConstantC: C,
                claheClipLimit: clip,
                claheGridSize: grid,
            });
            setPreprocessedPreview(preprocessed.ocrOptimizedPng);
        } catch (e) {
            console.error("Failed to generate preview:", e);
        } finally {
            setIsPreprocessingPreview(false);
        }
    };
    img.src = imageDataUrl;
  }, []);

  useEffect(() => {
    if (capturedImage) {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = window.setTimeout(() => {
        analyzeImage(`data:${capturedImage.mimeType};base64,${capturedImage.data}`, sharpnessSensitivity);
      }, 300);
    }
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    }
  }, [sharpnessSensitivity, capturedImage, analyzeImage]);

  useEffect(() => {
    if (capturedImage) {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = window.setTimeout(() => {
        generatePreprocessedPreview(`data:${capturedImage.mimeType};base64,${capturedImage.data}`, binarizationConstant, claheClipLimit, claheGridSize);
      }, 300);
    }
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    }
  }, [binarizationConstant, claheClipLimit, claheGridSize, capturedImage, generatePreprocessedPreview]);

  const handleCapture = useCallback(() => {
    if (videoRef.current && canvasRef.current) {
      stopCamera();
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
        const mimeType = 'image/jpeg';
        const dataUrl = canvas.toDataURL(mimeType, 0.95);
        const base64Data = dataUrl.split(',')[1];
        setCapturedImage({ data: base64Data, mimeType });
        analyzeImage(dataUrl, sharpnessSensitivity);
        generatePreprocessedPreview(dataUrl, binarizationConstant, claheClipLimit, claheGridSize);
      }
    }
  }, [analyzeImage, generatePreprocessedPreview, sharpnessSensitivity, binarizationConstant, claheClipLimit, claheGridSize]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (isCameraOn) stopCamera();
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        const base64Data = dataUrl.split(',')[1];
        setCapturedImage({ data: base64Data, mimeType: file.type });
        analyzeImage(dataUrl, sharpnessSensitivity);
        generatePreprocessedPreview(dataUrl, binarizationConstant, claheClipLimit, claheGridSize);
      };
      reader.readAsDataURL(file);
    }
    if(event.target) event.target.value = '';
  };

  const clearCapture = () => {
    setCapturedImage(null);
    setImageQualityReport(null);
    setQrCodeData(null);
    setError(null);
    setIsEditModalOpen(false);
    setIsExtractingAfterEdit(false);
    setShowAdvancedSettings(false);
    setSharpnessSensitivity(100);
    setBinarizationConstant(7);
    setClaheClipLimit(2.0);
    setClaheGridSize(8);
    setPreprocessedPreview(null);
    setConfirmedProfilePic(null);
    setCapturedProfilePic(null);
    setIsProfilePicModalOpen(false);
  };
  
  const submitForExtraction = async (image: { data: string; mimeType: string }) => {
    setIsLoading(true);
    setLoadingMessage('Preprocessing image for OCR...');
    setError(null);

    try {
        if (!canvasRef.current) throw new Error("Canvas not available for preprocessing.");
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) throw new Error("Canvas context not available for preprocessing.");
        
        const img = new Image();
        img.src = `data:${image.mimeType};base64,${image.data}`;
        await new Promise(resolve => img.onload = resolve);
        canvasRef.current.width = img.naturalWidth;
        canvasRef.current.height = img.naturalHeight;
        ctx.drawImage(img, 0, 0);

        const preprocessedImages = await preprocessImageForOCR(
          ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height),
          { 
              binarizationConstantC: binarizationConstant,
              claheClipLimit: claheClipLimit,
              claheGridSize: claheGridSize,
          }
        );
        const preprocessedBase64 = preprocessedImages.ocrOptimizedPng.split(',')[1];
        const preprocessedThumbnailBase64 = preprocessedImages.thumbnailJpeg.split(',')[1];
        
        setLoadingMessage('Analyzing text and facial features...');
        const [fullData, textOnlyData] = await Promise.all([
            extractIDCardData(image.data, image.mimeType, qrCodeData ?? undefined),
            extractIDCardDataTextOnly(preprocessedBase64, 'image/png', qrCodeData ?? undefined)
        ]);

        setLoadingMessage('Merging results...');
        const mergedData = { ...fullData };
        if (textOnlyData.confidenceScore && (!fullData.confidenceScore || textOnlyData.confidenceScore > fullData.confidenceScore)) {
            mergedData.fullName = textOnlyData.fullName;
            mergedData.dob = textOnlyData.dob;
            mergedData.idNumber = textOnlyData.idNumber;
            mergedData.country = textOnlyData.country;
            mergedData.issueDate = textOnlyData.issueDate;
            mergedData.expiryDate = textOnlyData.expiryDate;
            mergedData.address = textOnlyData.address;
            mergedData.gender = textOnlyData.gender;
            mergedData.otherText = textOnlyData.otherText;
            mergedData.confidenceScore = textOnlyData.confidenceScore;
        }
        
        mergedData.preprocessedBase64Image = preprocessedBase64;
        mergedData.preprocessedThumbnailBase64Image = preprocessedThumbnailBase64;
        mergedData.extractionTimestamp = new Date().toISOString();
        if (confirmedProfilePic) {
            mergedData.profilePictureBase64 = confirmedProfilePic.split(',')[1];
        }

        onIDDataExtracted(mergedData);
        clearCapture();
    } catch (err) {
        console.error('Extraction failed:', err);
        setError(err instanceof Error ? err.message : 'An unknown error occurred during data extraction.');
    } finally {
        setIsLoading(false);
    }
  };

  const handleOpenEditModal = () => {
    if (capturedImage) {
      setEditImageSrc(`data:${capturedImage.mimeType};base64,${capturedImage.data}`);
      setRotation(0);
      setBrightness(100);
      setContrast(100);
      setIsEditModalOpen(true);
    }
  };

  const handleTransformAndExtract = () => {
    if (capturedImage) {
        setIsExtractingAfterEdit(true);
        handleOpenEditModal();
    }
  };

  const handleCloseEditModal = () => {
    setIsEditModalOpen(false);
    setIsExtractingAfterEdit(false);
  };

  const handleApplyEdits = async () => {
    if (editImageSrc && capturedImage) {
        if (!isExtractingAfterEdit) {
            setIsLoading(true);
            setLoadingMessage('Applying edits...');
        }
        setIsEditModalOpen(false);
        try {
            let currentImage = `data:${capturedImage.mimeType};base64,${capturedImage.data}`;
            if (rotation !== 0) {
              currentImage = await applyTransformationsToImage(
                  currentImage, capturedImage.mimeType, { flipH: false, flipV: false, rotation }
              );
            }
            if (brightness !== 100 || contrast !== 100) {
                currentImage = await applyImageAdjustments(
                    currentImage, capturedImage.mimeType, brightness, contrast
                );
            }
            
            const base64Data = currentImage.split(',')[1];
            const newImage = { data: base64Data, mimeType: capturedImage.mimeType };
            setCapturedImage(newImage);
            
            if (isExtractingAfterEdit) {
                setIsExtractingAfterEdit(false);
                await submitForExtraction(newImage);
            } else {
                analyzeImage(currentImage, sharpnessSensitivity);
                generatePreprocessedPreview(currentImage, binarizationConstant, claheClipLimit, claheGridSize);
            }
        } catch(e) {
            console.error(e);
            setError("Failed to apply image edits.");
            setIsExtractingAfterEdit(false);
        } finally {
            if (!isExtractingAfterEdit) {
                setIsLoading(false);
            }
        }
    }
  };

  // --- Profile Picture Functions ---
  const handleTakeProfilePic = useCallback(() => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.save();
        ctx.translate(video.videoWidth, 0);
        ctx.scale(-1, 1); // Flip horizontally for selfie view
        ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
        ctx.restore();

        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        setCapturedProfilePic(dataUrl);
        setProfilePicStep('preview');
        stopCamera();
      }
    }
  }, []);

  const handleConfirmProfilePic = useCallback(() => {
    setConfirmedProfilePic(capturedProfilePic);
    setIsProfilePicModalOpen(false);
    setProfilePicStep('capture'); // Reset for next time
    setCapturedProfilePic(null);
  }, [capturedProfilePic]);

  const handleRetakeProfilePic = useCallback(() => {
    setCapturedProfilePic(null);
    setProfilePicStep('capture');
  }, []);

  return (
    <div className="bg-theme-card p-6 rounded-lg shadow-md border border-theme-border text-theme-text">
      <h2 className="text-2xl font-bold mb-4 text-center">Scan or Upload ID Card</h2>
      <canvas ref={canvasRef} className="hidden"></canvas>
      
      {isLoading && (
        <div className="text-center p-8">
            <LoadingSpinner />
            <p className="mt-4 text-lg animate-pulse">{loadingMessage}</p>
        </div>
      )}

      {!isLoading && (
        <>
            {error && <p className="text-red-500 bg-red-100 p-3 rounded-md text-center mb-4">{error}</p>}
            
            {!capturedImage && (
                <div className="space-y-4">
                    <div className="bg-gray-200 dark:bg-gray-800 rounded-md aspect-video flex items-center justify-center">
                        <video ref={videoRef} autoPlay playsInline muted className={`${isCameraOn ? 'block' : 'hidden'} w-full h-full object-contain`}></video>
                        {!isCameraOn && <p className="text-gray-500">Camera is off or no image is selected</p>}
                    </div>
                    <div className="flex justify-center flex-wrap gap-4">
                        {isCameraOn ? (
                            <>
                                <Button onClick={handleCapture} variant="primary">Capture Photo</Button>
                                <Button onClick={stopCamera} variant="secondary">Stop Camera</Button>
                                <Button onClick={handleSwitchCamera} variant="secondary" className="inline-flex items-center gap-2">
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 110 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                                  </svg>
                                  Switch
                                </Button>
                            </>
                        ) : (
                            <div className="text-center">
                                <div className="flex justify-center flex-wrap gap-4">
                                    <Button onClick={() => startCamera('environment')} variant="primary">Start Camera</Button>
                                    <Button onClick={() => fileInputRef.current?.click()} variant="secondary">Upload Image</Button>
                                </div>
                                <p className="text-xs text-gray-500 mt-2">Accepted formats: JPEG, PNG, WebP, HEIC/HEIF</p>
                                <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/jpeg, image/png, image/webp, image/heic, image/heif" className="hidden" />
                            </div>
                        )}
                    </div>
                </div>
            )}

            {capturedImage && (
                <div className="space-y-6">
                    <div>
                        <p className="text-sm text-center text-gray-500 mb-2">Captured Image Preview</p>
                        <img src={`data:${capturedImage.mimeType};base64,${capturedImage.data}`} alt="Captured ID" className="max-w-full mx-auto rounded-md shadow-lg border border-theme-border max-h-72" />
                    </div>
                    {isAnalysisRunning && (
                        <div className="text-center p-4">
                            <p className="text-lg text-gray-500 mb-2">Analyzing image quality...</p>
                            <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-4 mb-2 overflow-hidden border border-theme-border">
                                <div className="bg-theme-primary h-full rounded-full transition-all duration-300 ease-out" style={{ width: `${analysisProgress}%` }} role="progressbar"></div>
                            </div>
                            <p className="text-xl font-bold text-theme-primary">{Math.round(analysisProgress)}%</p>
                        </div>
                    )}
                    {imageQualityReport && !isAnalysisRunning && (
                        <div className="border-t border-theme-border pt-4">
                            <h4 className="font-semibold text-lg mb-2">Image Quality Analysis</h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                                <div className="p-3 bg-gray-100 dark:bg-slate-700 rounded-md"><p className="text-sm font-medium">Overall</p><p className="text-2xl font-bold">{imageQualityReport.overallQualityScore}<span className="text-base">%</span></p></div>
                                <div className="p-3 bg-gray-100 dark:bg-slate-700 rounded-md"><p className="text-sm font-medium">Sharpness</p><p className="text-2xl font-bold">{imageQualityReport.sharpnessScore}<span className="text-base">%</span></p></div>
                                <div className="p-3 bg-gray-100 dark:bg-slate-700 rounded-md"><p className="text-sm font-medium">Lighting</p><p className="text-2xl font-bold">{imageQualityReport.lightingScore}<span className="text-base">%</span></p></div>
                                <div className="p-3 bg-gray-100 dark:bg-slate-700 rounded-md"><p className="text-sm font-medium">Resolution</p><p className={`text-2xl font-bold ${imageQualityReport.isLowResolution ? 'text-red-500' : ''}`}>{imageQualityReport.isLowResolution ? 'Low' : 'OK'}</p></div>
                            </div>
                            {imageQualityReport.tips.length > 0 && (<div className="mt-4 p-3 bg-yellow-100 text-yellow-800 rounded-md"><h5 className="font-bold">Tips:</h5><ul className="list-disc list-inside text-sm">{imageQualityReport.tips.map((tip, i) => <li key={i}>{tip}</li>)}</ul></div>)}
                            {qrCodeData && (<div className="mt-4 p-3 bg-green-100 text-green-800 rounded-md"><h5 className="font-bold">QR Code Detected:</h5><p className="text-sm break-all">{qrCodeData}</p></div>)}
                        </div>
                    )}
                    
                    <div className="text-center p-4 border-y border-theme-border">
                        <h4 className="font-semibold text-lg mb-2">Voter Profile Picture</h4>
                        {confirmedProfilePic ? (
                            <div className="flex flex-col items-center gap-2">
                                <img src={confirmedProfilePic} alt="Voter profile" className="w-24 h-24 rounded-full object-cover border-2 border-theme-border" />
                                <Button variant="secondary" size="sm" onClick={() => { setCapturedProfilePic(null); setProfilePicStep('capture'); setIsProfilePicModalOpen(true); }}>Change Photo</Button>
                            </div>
                        ) : (
                            <div>
                                <p className="text-sm text-gray-500 mb-2">Optionally, add a live photo of the voter.</p>
                                <Button variant="secondary" onClick={() => { setCapturedProfilePic(null); setProfilePicStep('capture'); setIsProfilePicModalOpen(true); }}>Add Profile Photo</Button>
                            </div>
                        )}
                    </div>

                    <div>
                        <Button variant="secondary" size="sm" onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}>{showAdvancedSettings ? 'Hide' : 'Show'} Preprocessing</Button>
                        {showAdvancedSettings && (
                           <div className="mt-4 p-4 bg-gray-100 dark:bg-slate-800 rounded-lg border border-theme-border space-y-4">
                                <div><label htmlFor="sharpness-slider" className="block text-sm font-medium text-theme-text mb-1">Sharpness Sensitivity: <span className="font-bold">{sharpnessSensitivity}</span></label><input id="sharpness-slider" type="range" min="50" max="200" value={sharpnessSensitivity} onChange={(e) => setSharpnessSensitivity(parseInt(e.target.value, 10))} className="w-full" /><p className="text-xs text-gray-500 mt-1">Higher values require a sharper image.</p></div>
                                <div><label htmlFor="binarization-slider" className="block text-sm font-medium text-theme-text mb-1">Binarization Contrast: <span className="font-bold">{binarizationConstant}</span></label><input id="binarization-slider" type="range" min="1" max="15" value={binarizationConstant} onChange={(e) => setBinarizationConstant(parseInt(e.target.value, 10))} className="w-full" /><p className="text-xs text-gray-500 mt-1">Adjusts black & white conversion. Higher values make text thinner.</p></div>
                                <div><label htmlFor="clahe-clip-slider" className="block text-sm font-medium text-theme-text mb-1">CLAHE Clip Limit: <span className="font-bold">{claheClipLimit.toFixed(1)}</span></label><input id="clahe-clip-slider" type="range" min="1.0" max="10.0" step="0.5" value={claheClipLimit} onChange={(e) => setClaheClipLimit(parseFloat(e.target.value))} className="w-full" /><p className="text-xs text-gray-500 mt-1">Controls local contrast. Higher values increase contrast but can add noise.</p></div>
                                <div><label htmlFor="clahe-grid-slider" className="block text-sm font-medium text-theme-text mb-1">CLAHE Grid Size: <span className="font-bold">{claheGridSize}x{claheGridSize}</span></label><input id="clahe-grid-slider" type="range" min="2" max="16" step="2" value={claheGridSize} onChange={(e) => setClaheGridSize(parseInt(e.target.value, 10))} className="w-full" /><p className="text-xs text-gray-500 mt-1">Number of tiles for local enhancement.</p></div>
                                <div><p className="text-sm font-medium text-center text-theme-text mb-2">OCR Preview</p><div className="bg-gray-200 dark:bg-gray-900 rounded-md p-2 flex justify-center items-center min-h-[10rem]">{isPreprocessingPreview ? <LoadingSpinner /> : (preprocessedPreview ? <img src={preprocessedPreview} alt="Preprocessed Preview" className="max-w-full max-h-48 object-contain rounded" />: <p className="text-gray-500 text-sm">Preview appears here.</p>)}</div></div>
                           </div>
                        )}
                    </div>
                    
                    <div className="flex justify-center flex-wrap gap-4 pt-4 border-t border-theme-border">
                        <Button onClick={clearCapture} variant="secondary">Clear</Button>
                        <Button onClick={handleOpenEditModal} variant="secondary">Edit Image</Button>
                        <Button onClick={handleTransformAndExtract} variant="secondary" disabled={isAnalysisRunning} title="Edit & Extract">Apply Transformations</Button>
                        <Button onClick={() => submitForExtraction(capturedImage)} variant="primary" disabled={isAnalysisRunning || (imageQualityReport && imageQualityReport.overallQualityScore < 50)} title={imageQualityReport && imageQualityReport.overallQualityScore < 50 ? "Image quality too low." : ""}>Extract Data</Button>
                    </div>
                </div>
            )}
        </>
      )}

      <Modal isOpen={isEditModalOpen} onClose={handleCloseEditModal} title="Manual Image Editor">
        {editImageSrc ? (
          <div className="flex flex-col items-center w-full"><div className="relative w-full max-w-lg mb-4 bg-gray-200 dark:bg-gray-800 rounded-md overflow-hidden"><img src={editImageSrc} alt="Edit preview" className="w-full h-auto" style={{transform: `rotate(${rotation}deg)`, filter: `brightness(${brightness}%) contrast(${contrast}%)`, transition: 'transform 0.2s, filter 0.2s',}}/></div><div className="w-full space-y-4"><div className="flex items-center gap-2"><label htmlFor="brightness-slider" className="text-sm font-medium whitespace-nowrap w-20">Brightness:</label><input id="brightness-slider" type="range" min="50" max="150" value={brightness} onChange={(e) => setBrightness(parseInt(e.target.value, 10))} className="w-full" /><span className="text-sm w-10 text-right">{brightness}%</span></div><div className="flex items-center gap-2"><label htmlFor="contrast-slider" className="text-sm font-medium whitespace-nowrap w-20">Contrast:</label><input id="contrast-slider" type="range" min="50" max="150" value={contrast} onChange={(e) => setContrast(parseInt(e.target.value, 10))} className="w-full" /><span className="text-sm w-10 text-right">{contrast}%</span></div><div className="flex items-center gap-2"><label className="text-sm font-medium whitespace-nowrap w-20">Rotate:</label><Button size="sm" variant="secondary" onClick={() => setRotation(r => (r + 270) % 360)}>-90°</Button><Button size="sm" variant="secondary" onClick={() => setRotation(r => (r + 90) % 360)}>+90°</Button></div></div><div className="flex justify-end space-x-2 mt-6 w-full"><Button variant="secondary" onClick={handleCloseEditModal}>Cancel</Button><Button variant="primary" onClick={handleApplyEdits}>{isExtractingAfterEdit ? 'Apply & Extract' : 'Apply & Save'}</Button></div></div>
        ) : (<p className="text-center p-4">No image data to edit.</p>)}
      </Modal>

      <Modal isOpen={isProfilePicModalOpen} onClose={() => setIsProfilePicModalOpen(false)} title="Capture Profile Picture">
        <div className="flex flex-col items-center">
            {profilePicStep === 'capture' && (
                <>
                    <div className="relative w-64 h-64 rounded-full overflow-hidden bg-gray-800 border-4 border-theme-border mb-4">
                        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover transform -scale-x-100"></video>
                        {!isCameraOn && <div className="absolute inset-0 flex items-center justify-center"><LoadingSpinner /></div>}
                    </div>
                    <Button onClick={handleTakeProfilePic} variant="primary" disabled={!isCameraOn}>Take Photo</Button>
                </>
            )}
            {profilePicStep === 'preview' && capturedProfilePic && (
                <>
                    <img src={capturedProfilePic} alt="Profile preview" className="w-64 h-64 rounded-full object-cover border-4 border-theme-border mb-4" />
                    <div className="flex gap-4">
                        <Button onClick={handleRetakeProfilePic} variant="secondary">Retake</Button>
                        <Button onClick={handleConfirmProfilePic} variant="primary">Confirm</Button>
                    </div>
                </>
            )}
        </div>
      </Modal>
    </div>
  );
};

export default IDScanner;