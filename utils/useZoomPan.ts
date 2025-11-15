import React, { useState, useRef, useEffect, useCallback, CSSProperties } from 'react';

interface UseZoomPanProps {
  containerRef: React.RefObject<HTMLElement>;
  imageSrc?: string; // Base64 image data (data URL)
  imageMimeType?: string;
  initialZoom?: number;
  maxZoom?: number;
  minZoom?: number; // Minimum zoom level, will be overridden if image is smaller than container
  zoomStep?: number;
  brightness: number;
  contrast: number;
  rotation?: number; // New prop for rotation
}

interface UseZoomPanReturn {
  zoomLevel: number;
  panX: number;
  panY: number;
  imageNaturalSize: { width: number; height: number } | null;
  containerSize: { width: number; height: number } | null;
  isDragging: boolean;
  transformStyle: CSSProperties;
  filterStyle: CSSProperties;
  cursorStyle: CSSProperties;
  handleWheel: (e: React.WheelEvent<HTMLElement>) => void;
  handlePointerDown: (e: React.PointerEvent<HTMLElement>) => void;
  handlePointerMove: (e: React.PointerEvent<HTMLElement>) => void;
  handlePointerUp: (e: React.PointerEvent<HTMLElement>) => void;
  handlePointerCancel: (e: React.PointerEvent<HTMLElement>) => void;
  handleDoubleClick: (e: React.MouseEvent<HTMLElement>) => void; // New
  resetZoomPan: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  focusOnRect: (rect: { x: number; y: number; width: number; height: number; }, padding?: number) => void;
}

const DEFAULT_INITIAL_ZOOM = 1;
const DEFAULT_MAX_ZOOM = 5;
const DEFAULT_ZOOM_STEP = 1.15;

const useZoomPan = ({
  containerRef,
  imageSrc,
  imageMimeType,
  initialZoom = DEFAULT_INITIAL_ZOOM,
  maxZoom = DEFAULT_MAX_ZOOM,
  minZoom = 0,
  zoomStep = DEFAULT_ZOOM_STEP,
  brightness,
  contrast,
  rotation = 0,
}: UseZoomPanProps): UseZoomPanReturn => {
  const [zoomLevel, setZoomLevel] = useState(initialZoom);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);

  const [imageNaturalSize, setImageNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number } | null>(null);

  // Panning state
  const [isDragging, setIsDragging] = useState(false);
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const startPanRef = useRef({ x: 0, y: 0 }); // Pan at start of drag
  const initialPointerRef = useRef({ x: 0, y: 0 }); // Pointer pos at start of drag

  // Pinch-to-zoom state
  const pinchStateRef = useRef<{
    distance: number;
    zoom: number;
    panX: number;
    panY: number;
    originX: number; // Relative to container
    originY: number; // Relative to container
  } | null>(null);

  // Memoized initial fit calculation
  const getMinFitZoom = useCallback((imgWidth: number, imgHeight: number, containerWidth: number, containerHeight: number, currentRotation: number) => {
    if (imgWidth === 0 || imgHeight === 0 || containerWidth === 0 || containerHeight === 0) return 0;
    const isSideways = currentRotation === 90 || currentRotation === 270;
    const effectiveImgWidth = isSideways ? imgHeight : imgWidth;
    const effectiveImgHeight = isSideways ? imgWidth : imgHeight;
    return Math.min(1, containerWidth / effectiveImgWidth, containerHeight / effectiveImgHeight);
  }, []);

  const resetZoomPan = useCallback(() => {
    pointersRef.current.clear();
    setIsDragging(false);
    startPanRef.current = { x: 0, y: 0 };
    initialPointerRef.current = { x: 0, y: 0 };
    pinchStateRef.current = null;
    setImageNaturalSize(null); // Resetting this will trigger image reload in components
    setContainerSize(null); // This will be updated by ResizeObserver

    // Reset zoom/pan based on current image and container if available, otherwise to defaults
    if (imageNaturalSize && containerSize) {
        const minFit = getMinFitZoom(imageNaturalSize.width, imageNaturalSize.height, containerSize.width, containerSize.height, rotation);
        setZoomLevel(minFit);
        setPanX(0);
        setPanY(0);
    } else {
        setZoomLevel(initialZoom);
        setPanX(0);
        setPanY(0);
    }
  }, [imageNaturalSize, containerSize, initialZoom, getMinFitZoom, rotation]);

  // Helper to get relative coordinates within the container
  const getRelativeCoordinates = useCallback((clientX: number, clientY: number) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }, [containerRef]);

  // Clamping pan values to keep the image within container bounds
  const clampPan = useCallback((currentPanX: number, currentPanY: number, currentZoom: number) => {
    if (!imageNaturalSize || !containerSize) {
      return { clampedPanX: currentPanX, clampedPanY: currentPanY };
    }
    
    const isSideways = rotation === 90 || rotation === 270;
    const imgEffectiveWidth = isSideways ? imageNaturalSize.height : imageNaturalSize.width;
    const imgEffectiveHeight = isSideways ? imageNaturalSize.width : imageNaturalSize.height;

    const imgDisplayWidth = imgEffectiveWidth * currentZoom;
    const imgDisplayHeight = imgEffectiveHeight * currentZoom;
    const { width: containerWidth, height: containerHeight } = containerSize;

    // Center the pan view for more intuitive control
    const centeredPanX = currentPanX - (containerWidth / 2) + (imgDisplayWidth / 2);
    const centeredPanY = currentPanY - (containerHeight / 2) + (imgDisplayHeight / 2);

    const maxPanX = imgDisplayWidth > containerWidth ? (imgDisplayWidth - containerWidth) / 2 : 0;
    const maxPanY = imgDisplayHeight > containerHeight ? (imgDisplayHeight - containerHeight) / 2 : 0;
    
    const clampedCenteredPanX = Math.max(-maxPanX, Math.min(maxPanX, centeredPanX));
    const clampedCenteredPanY = Math.max(-maxPanY, Math.min(maxPanY, centeredPanY));
    
    const clampedPanX = clampedCenteredPanX - (imgDisplayWidth / 2) + (containerWidth / 2);
    const clampedPanY = clampedCenteredPanY - (imgDisplayHeight / 2) + (containerHeight / 2);

    return { clampedPanX, clampedPanY };
  }, [imageNaturalSize, containerSize, rotation]);

  // Effect to re-clamp pan values when zoom level or sizes change
  useEffect(() => {
    const { clampedPanX, clampedPanY } = clampPan(panX, panY, zoomLevel);
    if (clampedPanX !== panX) {
      setPanX(clampedPanX);
    }
    if (clampedPanY !== panY) {
      setPanY(clampedPanY);
    }
  }, [zoomLevel, clampPan, panX, panY]);


  // Load image natural dimensions when imageSrc changes
  useEffect(() => {
    if (imageSrc && imageMimeType) {
      const img = new Image();
      img.onload = () => {
        setImageNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = () => {
        console.error('Failed to load image for zoom/pan calculations.');
        setImageNaturalSize(null);
      };
      
      // FIX: The imageSrc prop might be a raw base64 string or a full data URL.
      // This gracefully handles both cases by extracting only the base64 data part.
      const base64Data = imageSrc.includes(',') ? imageSrc.split(',')[1] : imageSrc;
      
      if (base64Data) {
        img.src = `data:${imageMimeType};base64,${base64Data}`;
      } else {
        setImageNaturalSize(null);
      }
    } else {
      setImageNaturalSize(null);
    }
  }, [imageSrc, imageMimeType]);

  // ResizeObserver for the container to get dynamic dimensions and set initial fit
  useEffect(() => {
    const containerElement = containerRef.current;
    if (!containerElement) return;

    const observer = new ResizeObserver(entries => {
      for (let entry of entries) {
        if (entry.target === containerElement) {
          const { width, height } = entry.contentRect;
          setContainerSize({ width, height });

          if (imageNaturalSize) {
            const minFit = getMinFitZoom(imageNaturalSize.width, imageNaturalSize.height, width, height, rotation);
            setZoomLevel(minFit);
            const initialPan = clampPan(0, 0, minFit);
            setPanX(initialPan.clampedPanX);
            setPanY(initialPan.clampedPanY);
          } else {
            // If image not yet loaded, set to initial defaults
            setZoomLevel(initialZoom);
            setPanX(0);
            setPanY(0);
          }
        }
      }
    });

    observer.observe(containerElement);

    return () => {
      observer.disconnect();
    };
  }, [containerRef, imageNaturalSize, initialZoom, getMinFitZoom, rotation, clampPan]);
  
  const applyZoom = useCallback((zoomFactor: number, originX?: number, originY?: number) => {
    if (!imageNaturalSize || !containerSize) return;
    
    const zoomOriginX = originX ?? containerSize.width / 2;
    const zoomOriginY = originY ?? containerSize.height / 2;

    const prevZoom = zoomLevel;
    let newZoom = prevZoom * zoomFactor;

    const minFitZoom = getMinFitZoom(imageNaturalSize.width, imageNaturalSize.height, containerSize.width, containerSize.height, rotation);
    newZoom = Math.max(minFitZoom, Math.min(newZoom, maxZoom));
    
    if (newZoom === prevZoom) return;
    
    const newPanX = zoomOriginX - ((zoomOriginX - panX) / prevZoom) * newZoom;
    const newPanY = zoomOriginY - ((zoomOriginY - panY) / prevZoom) * newZoom;

    const { clampedPanX, clampedPanY } = clampPan(newPanX, newPanY, newZoom);

    setZoomLevel(newZoom);
    setPanX(clampedPanX);
    setPanY(clampedPanY);
  }, [imageNaturalSize, containerSize, getMinFitZoom, zoomLevel, panX, panY, maxZoom, clampPan, rotation]);

  const zoomIn = useCallback(() => {
    applyZoom(zoomStep);
  }, [applyZoom, zoomStep]);

  const zoomOut = useCallback(() => {
    applyZoom(1 / zoomStep);
  }, [applyZoom, zoomStep]);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const { x: mouseX, y: mouseY } = getRelativeCoordinates(e.clientX, e.clientY);
    const zoomFactor = e.deltaY < 0 ? zoomStep : 1 / zoomStep;
    applyZoom(zoomFactor, mouseX, mouseY);
  }, [getRelativeCoordinates, zoomStep, applyZoom]);
  
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (containerRef.current) {
        containerRef.current.setPointerCapture(e.pointerId);
    }

    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 1) {
      setIsDragging(true);
      initialPointerRef.current = { x: e.clientX, y: e.clientY };
      startPanRef.current = { x: panX, y: panY };
    } else if (pointersRef.current.size === 2) {
      setIsDragging(false);
      // FIX: Add type assertion to fix 'unknown' type error on p1 and p2.
      const [p1, p2] = Array.from(pointersRef.current.values()) as { x: number; y: number }[];
      const distance = Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));

      const { x: originX, y: originY } = getRelativeCoordinates((p1.x + p2.x) / 2, (p1.y + p2.y) / 2);

      pinchStateRef.current = {
        distance: distance,
        zoom: zoomLevel,
        panX: panX,
        panY: panY,
        originX: originX,
        originY: originY,
      };
    }
  }, [containerRef, getRelativeCoordinates, panX, panY, zoomLevel]);


  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (!containerRef.current || !containerRef.current.hasPointerCapture(e.pointerId)) return;
    e.preventDefault();
    e.stopPropagation();

    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Single pointer pan
    if (pointersRef.current.size === 1 && isDragging) {
      const deltaX = e.clientX - initialPointerRef.current.x;
      const deltaY = e.clientY - initialPointerRef.current.y;
      const newPanX = startPanRef.current.x + deltaX;
      const newPanY = startPanRef.current.y + deltaY;
      
      const { clampedPanX, clampedPanY } = clampPan(newPanX, newPanY, zoomLevel);
      setPanX(clampedPanX);
      setPanY(clampedPanY);
    } 
    // Two-pointer pinch-zoom
    else if (pointersRef.current.size === 2 && pinchStateRef.current && imageNaturalSize && containerSize) {
      // FIX: Add type assertion to fix 'unknown' type error on p1 and p2.
      const [p1, p2] = Array.from(pointersRef.current.values()) as { x: number; y: number }[];
      const currentDistance = Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));

      if (currentDistance === 0) return;

      const scaleFactor = currentDistance / pinchStateRef.current.distance;
      const prevZoom = zoomLevel;
      let newZoom = pinchStateRef.current.zoom * scaleFactor;

      const minFitZoom = getMinFitZoom(imageNaturalSize.width, imageNaturalSize.height, containerSize.width, containerSize.height, rotation);
      newZoom = Math.max(minFitZoom, Math.min(newZoom, maxZoom));

      if (newZoom !== prevZoom) {
        const { originX, originY, panX: startPinchPanX, panY: startPinchPanY, zoom: startPinchZoom } = pinchStateRef.current;
        const newPanX = originX - ((originX - startPinchPanX) / startPinchZoom) * newZoom;
        const newPanY = originY - ((originY - startPinchPanY) / startPinchZoom) * newZoom;

        const { clampedPanX, clampedPanY } = clampPan(newPanX, newPanY, newZoom);
        
        setZoomLevel(newZoom);
        setPanX(clampedPanX);
        setPanY(clampedPanY);
      }
    }
  }, [
    containerRef, isDragging, imageNaturalSize, containerSize, zoomLevel, 
    maxZoom, clampPan, getMinFitZoom, rotation
  ]);


  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (containerRef.current) {
        containerRef.current.releasePointerCapture(e.pointerId);
    }
    e.stopPropagation();

    pointersRef.current.delete(e.pointerId);

    if (pointersRef.current.size < 2) {
      pinchStateRef.current = null;
    }
    if (pointersRef.current.size === 0) {
      setIsDragging(false);
    }
  }, [containerRef]);

  const handlePointerCancel = handlePointerUp;

  const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!imageNaturalSize || !containerSize) return;

    const { x: mouseX, y: mouseY } = getRelativeCoordinates(e.clientX, e.clientY);
    const minFitZoom = getMinFitZoom(imageNaturalSize.width, imageNaturalSize.height, containerSize.width, containerSize.height, rotation);
    
    // If we are zoomed in more than the minimum fit + a small tolerance, reset the zoom.
    if (zoomLevel > minFitZoom + 0.01) {
        const { clampedPanX, clampedPanY } = clampPan(0, 0, minFitZoom);
        setZoomLevel(minFitZoom);
        setPanX(clampedPanX);
        setPanY(clampedPanY);
    } else {
        // Otherwise, zoom in towards the mouse point.
        applyZoom(3, mouseX, mouseY); // zoom in more aggressively on double click
    }
  }, [getRelativeCoordinates, zoomLevel, imageNaturalSize, containerSize, getMinFitZoom, applyZoom, clampPan, rotation]);

  const focusOnRect = useCallback((rect: { x: number, y: number, width: number, height: number }, padding: number = 0.8) => {
    if (!imageNaturalSize || !containerSize || rect.width <= 0 || rect.height <= 0) return;

    const { width: containerWidth, height: containerHeight } = containerSize;
    
    // 1. Calculate the required zoom level to fit the rect with padding.
    const zoomX = containerWidth / rect.width * padding;
    const zoomY = containerHeight / rect.height * padding;
    let newZoom = Math.min(zoomX, zoomY);

    // 2. Clamp the zoom level
    const minFitZoom = getMinFitZoom(imageNaturalSize.width, imageNaturalSize.height, containerWidth, containerHeight, rotation);
    newZoom = Math.max(minFitZoom, Math.min(newZoom, maxZoom));

    // 3. Calculate the center of the rectangle in image coordinates
    const targetX = rect.x + rect.width / 2;
    const targetY = rect.y + rect.height / 2;

    // 4. Calculate the pan required to center this point.
    // The pan is relative to the container's center, so we adjust accordingly.
    const newPanX = -(targetX - imageNaturalSize.width / 2) * newZoom;
    const newPanY = -(targetY - imageNaturalSize.height / 2) * newZoom;
    
    // 5. Clamp the pan and update state
    const { clampedPanX, clampedPanY } = clampPan(newPanX, newPanY, newZoom);
    setZoomLevel(newZoom);
    setPanX(clampedPanX);
    setPanY(clampedPanY);

  }, [imageNaturalSize, containerSize, getMinFitZoom, clampPan, maxZoom, rotation]);

  const transformStyle: CSSProperties = {
    transform: `translate(${panX}px, ${panY}px) scale(${zoomLevel}) rotate(${rotation}deg)`,
    touchAction: 'none',
  };

  const filterStyle: CSSProperties = {
    filter: `brightness(${brightness}%) contrast(${contrast}%)`,
  };

  const cursorStyle: CSSProperties = {
    cursor: isDragging ? 'grabbing' : (zoomLevel > (containerSize && imageNaturalSize ? getMinFitZoom(imageNaturalSize.width, imageNaturalSize.height, containerSize.width, containerSize.height, rotation) : initialZoom) ? 'grab' : 'default'),
  };

  return {
    zoomLevel,
    panX,
    panY,
    imageNaturalSize,
    containerSize,
    isDragging: isDragging,
    transformStyle,
    filterStyle,
    cursorStyle,
    handleWheel,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handleDoubleClick,
    resetZoomPan,
    zoomIn,
    zoomOut,
    focusOnRect,
  };
};

export default useZoomPan;
