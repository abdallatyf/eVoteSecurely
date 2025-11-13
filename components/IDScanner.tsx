
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { IDCardData } from '../types';
import { extractIDCardData, extractIDCardDataTextOnly } from '../services/geminiService';
import { analyzeImageQuality, ImageQualityReport } from '../utils/imageQualityAnalysis';
import { preprocessImageForOCR } from '../utils/imagePreprocessing';
import { applyTransformationsToImage, applyImageAdjustments } from '../utils/imageTransformation';
import Button from './Button';
import LoadingSpinner from './LoadingSpinner';
import Modal from './Modal';
import Input from './Input';

interface IDScannerProps {
  onIDDataExtracted: (idCardData: IDCardData) => void;
}

const IDScanner: React.FC<IDScannerProps> = ({ onIDDataExtracted }) => {
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Extracting data...');
  const [error, setError] = useState<string | null>(null);
  const [capturedImage, setCapturedImage] = useState<{ data: string; mimeType: string } | null>(null);
  const [imageQualityReport, setImageQualityReport] = useState<ImageQualityReport | null>(null);
  const [isAnalysisRunning, setIsAnalysisRunning] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0); // New state for progress
  const [qrCodeData, setQrCodeData] = useState<string | null>(null);

  // Manual Edit State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editImageSrc, setEditImageSrc] = useState<string>('');
  const [rotation, setRotation] = useState(0);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [isExtractingAfterEdit, setIsExtractingAfterEdit] = useState(false); // New state for combined workflow
  
  // Manual Entry State
  const [isManualEntryModalOpen, setIsManualEntryModalOpen] = useState(false);
  const [manualFormData, setManualFormData] = useState<Partial<IDCardData>>({});
  const [isPrefilling, setIsPrefilling] = useState(false);


  // Preprocessing controls state
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [sharpnessSensitivity, setSharpnessSensitivity] = useState(100); // Corresponds to BLUR_THRESHOLD
  const [binarizationConstant, setBinarizationConstant] = useState(7);   // Corresponds to 'C' in adaptive thresholding
  const [preprocessedPreview, setPreprocessedPreview] = useState<string | null>(null);
  const [isPreprocessingPreview, setIsPreprocessingPreview] = useState(false);
  const debounceTimer = useRef<number | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const startCamera = async () => {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setIsCameraOn(true);
          setCapturedImage(null);
          setError(null);
        }
      } catch (err) {
        console.error('Error accessing camera:', err);
        setError('Could not access the camera. Please check permissions and try again.');
        setIsCameraOn(false);
      }
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsCameraOn(false);
  };

  useEffect(() => {
    return () => {
      stopCamera(); // Cleanup on unmount
    };
  }, []);

  // New useEffect to animate progress bar
  useEffect(() => {
    let interval: number;
    if (isAnalysisRunning) {
        setAnalysisProgress(0);
        interval = window.setInterval(() => {
            setAnalysisProgress(prev => {
                if (prev >= 95) { // Stop before 100%, let analysis completion set it
                    clearInterval(interval);
                    return prev;
                }
                // Animate progress with some randomness to look more realistic
                const increment = 5 + Math.random() * 10;
                return Math.min(prev + increment, 95);
            });
        }, 300); // Slower interval for smoother feel
    }

    return () => {
        if (interval) {
            clearInterval(interval);
        }
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
        
        const focusThresholdRatio = 8 / 100; // Ratio from original constants

        const [qualityReport, qrCodeResult] = await Promise.all([
            analyzeImageQuality(imageData, { blurThreshold: currentSharpness, focusThreshold: currentSharpness * focusThresholdRatio }),
            window.jsQR ? Promise.resolve(window.jsQR(imageData.data, imageData.width, imageData.height)) : Promise.resolve(null)
        ]);
        
        setImageQualityReport(qualityReport);
        if (qrCodeResult) {
            setQrCodeData(qrCodeResult.data);
        }
        
        setAnalysisProgress(100); // Finalize progress
        setTimeout(() => { // Give user time to see 100%
            setIsAnalysisRunning(false);
        }, 500);
    };
    img.src = imageDataUrl;
  }, []);
  
  const generatePreprocessedPreview = useCallback(async (imageDataUrl: string, C: number) => {
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
            const preprocessed = await preprocessImageForOCR(imageData, { binarizationConstantC: C });
            setPreprocessedPreview(preprocessed.ocrOptimizedPng);
        } catch (e) {
            console.error("Failed to generate preview:", e);
        } finally {
            setIsPreprocessingPreview(false);
        }
    };
    img.src = imageDataUrl;
  }, []);

  // Re-run sharpness analysis on slider change with debounce
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

  // Re-run preprocessing preview on slider change with debounce
  useEffect(() => {
    if (capturedImage) {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = window.setTimeout(() => {
        generatePreprocessedPreview(`data:${capturedImage.mimeType};base64,${capturedImage.data}`, binarizationConstant);
      }, 300);
    }
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    }
  }, [binarizationConstant, capturedImage, generatePreprocessedPreview]);


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
        generatePreprocessedPreview(dataUrl, binarizationConstant);
      }
    }
  }, [analyzeImage, generatePreprocessedPreview, sharpnessSensitivity, binarizationConstant]);

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
        generatePreprocessedPreview(dataUrl, binarizationConstant);
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
    setPreprocessedPreview(null);
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
          { binarizationConstantC: binarizationConstant }
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
        
        // Attach the preprocessed image and thumbnail for previewing in the next step
        mergedData.preprocessedBase64Image = preprocessedBase64;
        mergedData.preprocessedThumbnailBase64Image = preprocessedThumbnailBase64;
        mergedData.extractionTimestamp = new Date().toISOString();

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
                generatePreprocessedPreview(currentImage, binarizationConstant);
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
  
  // --- Manual Entry Functions ---
  const handleOpenManualEntry = () => {
    setIsManualEntryModalOpen(true);
  };

  const handleCloseManualEntry = () => {
    setIsManualEntryModalOpen(false);
    setManualFormData({}); // Clear form data on close
  };

  useEffect(() => {
    if (isManualEntryModalOpen && capturedImage) {
      const prefill = async () => {
        setIsPrefilling(true);
        try {
          const prefilledData = await extractIDCardDataTextOnly(
            capturedImage.data,
            capturedImage.mimeType,
            qrCodeData ?? undefined
          );
          setManualFormData(prefilledData);
        } catch (err) {
          console.error("Failed to prefill manual entry form:", err);
          setManualFormData({});
        } finally {
          setIsPrefilling(false);
        }
      };
      prefill();
    }
  }, [isManualEntryModalOpen, capturedImage, qrCodeData]);
  
  const handleManualFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setManualFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualFormData.fullName || !manualFormData.dob || !manualFormData.idNumber || !manualFormData.country) {
        alert("Please fill in all required fields: Full Name, DOB, ID Number, Country.");
        return;
    }
    if (!capturedImage) return;

    setIsLoading(true);
    setLoadingMessage("Submitting manual entry...");
    handleCloseManualEntry();

    const finalData: IDCardData = {
        fullName: manualFormData.fullName || "N/A",
        dob: manualFormData.dob || "N/A",
        idNumber: manualFormData.idNumber || "N/A",
        country: manualFormData.country || "N/A",
        contactNumber: manualFormData.contactNumber || undefined,
        issueDate: manualFormData.issueDate || undefined,
        expiryDate: manualFormData.expiryDate || undefined,
        address: manualFormData.address || undefined,
        gender: manualFormData.gender || undefined,
        facialDescription: manualFormData.facialDescription || "Manually entered data.",
        otherText: manualFormData.otherText || undefined,
        facialLandmarks: null,
        base64Image: capturedImage.data,
        imageMimeType: capturedImage.mimeType,
        qrCodeData: qrCodeData ?? undefined,
        confidenceScore: 1.0,
        facialDescriptionConfidence: 1.0,
        extractionTimestamp: new Date().toISOString(),
    };

    setTimeout(() => {
        onIDDataExtracted(finalData);
        clearCapture();
        setIsLoading(false);
    }, 500);
  };

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
                            </>
                        ) : (
                            <div className="text-center">
                                <div className="flex justify-center flex-wrap gap-4">
                                    <Button onClick={startCamera} variant="primary">Start Camera</Button>
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
                                <div
                                    className="bg-theme-primary h-full rounded-full transition-all duration-300 ease-out"
                                    style={{ width: `${analysisProgress}%` }}
                                    aria-valuenow={analysisProgress}
                                    aria-valuemin={0}
                                    aria-valuemax={100}
                                    role="progressbar"
                                ></div>
                            </div>
                            <p className="text-xl font-bold text-theme-primary">{Math.round(analysisProgress)}%</p>
                        </div>
                    )}
                    {imageQualityReport && !isAnalysisRunning && (
                        <div className="border-t border-theme-border pt-4">
                            <h4 className="font-semibold text-lg mb-2">Image Quality Analysis</h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                                <div className="p-3 bg-gray-100 dark:bg-slate-700 rounded-md">
                                    <p className="text-sm font-medium">Overall</p>
                                    <p className="text-2xl font-bold">{imageQualityReport.overallQualityScore}<span className="text-base">%</span></p>
                                </div>
                                <div className="p-3 bg-gray-100 dark:bg-slate-700 rounded-md">
                                    <p className="text-sm font-medium">Sharpness</p>
                                    <p className="text-2xl font-bold">{imageQualityReport.sharpnessScore}<span className="text-base">%</span></p>
                                </div>
                                <div className="p-3 bg-gray-100 dark:bg-slate-700 rounded-md">
                                    <p className="text-sm font-medium">Lighting</p>
                                    <p className="text-2xl font-bold">{imageQualityReport.lightingScore}<span className="text-base">%</span></p>
                                </div>
                                <div className="p-3 bg-gray-100 dark:bg-slate-700 rounded-md">
                                    <p className="text-sm font-medium">Resolution</p>
                                    <p className={`text-2xl font-bold ${imageQualityReport.isLowResolution ? 'text-red-500' : ''}`}>{imageQualityReport.isLowResolution ? 'Low' : 'OK'}</p>
                                </div>
                            </div>
                            {imageQualityReport.tips.length > 0 && (
                                <div className="mt-4 p-3 bg-yellow-100 text-yellow-800 rounded-md">
                                    <h5 className="font-bold">Tips for a better scan:</h5>
                                    <ul className="list-disc list-inside text-sm">
                                        {imageQualityReport.tips.map((tip, i) => <li key={i}>{tip}</li>)}
                                    </ul>
                                </div>
                            )}
                            {qrCodeData && (
                                <div className="mt-4 p-3 bg-green-100 text-green-800 rounded-md">
                                    <h5 className="font-bold">QR Code Detected:</h5>
                                    <p className="text-sm break-all">{qrCodeData}</p>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="border-t border-theme-border pt-4">
                        <Button variant="secondary" size="sm" onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}>
                            {showAdvancedSettings ? 'Hide' : 'Show'} Preprocessing Controls
                        </Button>
                        {showAdvancedSettings && (
                            <div className="mt-4 p-4 bg-gray-100 dark:bg-slate-800 rounded-lg border border-theme-border space-y-4">
                                <div>
                                    <label htmlFor="sharpness-slider" className="block text-sm font-medium text-theme-text mb-1">Sharpness Sensitivity: <span className="font-bold">{sharpnessSensitivity}</span></label>
                                    <input id="sharpness-slider" type="range" min="50" max="200" value={sharpnessSensitivity} onChange={(e) => setSharpnessSensitivity(parseInt(e.target.value, 10))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700" />
                                    <p className="text-xs text-gray-500 mt-1">Adjusts the blur/focus detection threshold. Higher values require a sharper image.</p>
                                </div>
                                <div>
                                    <label htmlFor="binarization-slider" className="block text-sm font-medium text-theme-text mb-1">Binarization Contrast: <span className="font-bold">{binarizationConstant}</span></label>
                                    <input id="binarization-slider" type="range" min="1" max="15" value={binarizationConstant} onChange={(e) => setBinarizationConstant(parseInt(e.target.value, 10))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700" />
                                     <p className="text-xs text-gray-500 mt-1">Adjusts the threshold for converting the image to black & white for OCR. Higher values make text thinner.</p>
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-center text-theme-text mb-2">OCR Preprocessed Preview</p>
                                    <div className="bg-gray-200 dark:bg-gray-900 rounded-md p-2 flex justify-center items-center min-h-[10rem]">
                                        {isPreprocessingPreview ? <LoadingSpinner /> : (
                                            preprocessedPreview ? 
                                            <img src={preprocessedPreview} alt="Preprocessed Preview" className="max-w-full max-h-48 object-contain rounded" />
                                            : <p className="text-gray-500 text-sm">Preview will appear here.</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                    
                    <div className="flex justify-center flex-wrap gap-4 pt-4 border-t border-theme-border">
                        <Button onClick={clearCapture} variant="secondary">Clear</Button>
                        <Button onClick={handleOpenEditModal} variant="secondary">Edit Image</Button>
                        <Button 
                            onClick={handleTransformAndExtract} 
                            variant="secondary"
                            disabled={isAnalysisRunning}
                            title="Edit the image and then immediately submit for data extraction."
                        >
                            Apply Transformations
                        </Button>
                        <Button onClick={handleOpenManualEntry} variant="secondary" disabled={isAnalysisRunning}>
                            Manual Entry
                        </Button>
                        <Button 
                            onClick={() => submitForExtraction(capturedImage)} 
                            variant="primary" 
                            disabled={isAnalysisRunning || (imageQualityReport && imageQualityReport.overallQualityScore < 50)}
                            title={imageQualityReport && imageQualityReport.overallQualityScore < 50 ? "Image quality is too low for reliable extraction." : ""}
                        >
                            Extract Data
                        </Button>
                    </div>
                </div>
            )}
        </>
      )}

      <Modal isOpen={isEditModalOpen} onClose={handleCloseEditModal} title="Manual Image Editor">
        {editImageSrc ? (
          <div className="flex flex-col items-center w-full">
            <div className="relative w-full max-w-lg mb-4 bg-gray-200 dark:bg-gray-800 rounded-md overflow-hidden">
                <img 
                    src={editImageSrc} 
                    alt="Edit preview" 
                    className="w-full h-auto"
                    style={{
                        transform: `rotate(${rotation}deg)`,
                        filter: `brightness(${brightness}%) contrast(${contrast}%)`,
                        transition: 'transform 0.2s, filter 0.2s',
                    }}
                />
            </div>
            <div className="w-full space-y-4">
              <div className="flex items-center gap-2"><label htmlFor="brightness-slider" className="text-sm font-medium whitespace-nowrap w-20">Brightness:</label><input id="brightness-slider" type="range" min="50" max="150" value={brightness} onChange={(e) => setBrightness(parseInt(e.target.value, 10))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700" /><span className="text-sm w-10 text-right">{brightness}%</span></div>
              <div className="flex items-center gap-2"><label htmlFor="contrast-slider" className="text-sm font-medium whitespace-nowrap w-20">Contrast:</label><input id="contrast-slider" type="range" min="50" max="150" value={contrast} onChange={(e) => setContrast(parseInt(e.target.value, 10))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700" /><span className="text-sm w-10 text-right">{contrast}%</span></div>
              <div className="flex items-center gap-2"><label className="text-sm font-medium whitespace-nowrap w-20">Rotate:</label><Button size="sm" variant="secondary" onClick={() => setRotation(r => (r + 270) % 360)}>-90°</Button><Button size="sm" variant="secondary" onClick={() => setRotation(r => (r + 90) % 360)}>+90°</Button></div>
            </div>
            <div className="flex justify-end space-x-2 mt-6 w-full">
              <Button variant="secondary" onClick={handleCloseEditModal}>Cancel</Button>
              <Button variant="primary" onClick={handleApplyEdits}>
                {isExtractingAfterEdit ? 'Apply & Extract' : 'Apply & Save'}
              </Button>
            </div>
          </div>
        ) : (<p className="text-center p-4">No image data to edit.</p>)}
      </Modal>
      
      <Modal isOpen={isManualEntryModalOpen} onClose={handleCloseManualEntry} title="Manual Data Entry">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex flex-col items-center">
                <p className="text-sm text-gray-500 mb-2">Reference Image</p>
                {capturedImage && (
                    <img src={`data:${capturedImage.mimeType};base64,${capturedImage.data}`} alt="ID for manual entry" className="max-w-full rounded-md shadow-lg border border-theme-border" />
                )}
            </div>
            <div className="relative">
                {isPrefilling && (
                    <div className="absolute inset-0 bg-theme-card/80 flex flex-col items-center justify-center rounded-md z-10">
                        <LoadingSpinner />
                        <p className="mt-2 text-sm text-gray-500">Auto-filling form...</p>
                    </div>
                )}
                <form onSubmit={handleManualSubmit} className="space-y-3">
                    <Input name="fullName" label="Full Name *" value={manualFormData.fullName || ''} onChange={handleManualFormChange} required />
                    <Input name="dob" label="Date of Birth *" value={manualFormData.dob || ''} onChange={handleManualFormChange} placeholder="DD-MM-YYYY" required />
                    <Input name="idNumber" label="ID Number *" value={manualFormData.idNumber || ''} onChange={handleManualFormChange} required />
                    <Input name="country" label="Country *" value={manualFormData.country || ''} onChange={handleManualFormChange} required />
                    <Input name="contactNumber" label="Contact Number" value={manualFormData.contactNumber || ''} onChange={handleManualFormChange} />
                    <Input name="issueDate" label="Issue Date" value={manualFormData.issueDate || ''} onChange={handleManualFormChange} />
                    <Input name="expiryDate" label="Expiry Date" value={manualFormData.expiryDate || ''} onChange={handleManualFormChange} />
                    <Input name="address" label="Address" value={manualFormData.address || ''} onChange={handleManualFormChange} />
                    <Input name="gender" label="Gender" value={manualFormData.gender || ''} onChange={handleManualFormChange} />
                    <div>
                        <label htmlFor="facialDescription" className="block text-sm font-medium text-theme-text mb-1">Facial Description</label>
                        <textarea
                            id="facialDescription"
                            name="facialDescription"
                            rows={2}
                            className="block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-theme-primary sm:text-sm bg-theme-card text-theme-text border-theme-border"
                            value={manualFormData.facialDescription || ''}
                            onChange={handleManualFormChange}
                        ></textarea>
                    </div>
                    <div className="flex justify-end space-x-2 pt-4">
                        <Button type="button" variant="secondary" onClick={handleCloseManualEntry}>Cancel</Button>
                        <Button type="submit" variant="primary">Submit Manually</Button>
                    </div>
                </form>
            </div>
        </div>
      </Modal>
    </div>
  );
};

export default IDScanner;
