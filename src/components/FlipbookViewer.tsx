import React, { useState, useEffect, useRef, useCallback } from 'react';
import HTMLFlipBook from 'react-pageflip';
import * as pdfjsLib from 'pdfjs-dist';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize, Loader2 } from 'lucide-react';
import './FlipbookViewer.css';

// Set up the pdf.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

interface FlipbookViewerProps {
  pdfFile: string;
}

// Individual page component that receives an image data URL
const PageImage = React.forwardRef<HTMLDivElement, { src: string; pageNum: number }>(
  ({ src, pageNum }, ref) => {
    return (
      <div className="page-wrapper" ref={ref} data-page={pageNum}>
        <img src={src} alt={`Page ${pageNum}`} className="page-img" draggable={false} />
      </div>
    );
  }
);

export default function FlipbookViewer({ pdfFile }: FlipbookViewerProps) {
  const [pageImages, setPageImages] = useState<string[]>([]);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [scale, setScale] = useState(1);
  const [dimensions, setDimensions] = useState({ width: 459, height: 594 });
  const bookRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [windowHeight, setWindowHeight] = useState(window.innerHeight);

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
      setWindowHeight(window.innerHeight);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Render all PDF pages to images
  useEffect(() => {
    let cancelled = false;

    async function renderPDF() {
      try {
        setLoading(true);
        setLoadProgress(0);

        const loadingTask = pdfjsLib.getDocument({ url: pdfFile });
        const pdf = await loadingTask.promise;
        const total = pdf.numPages;

        if (cancelled) return;
        setNumPages(total);

        // Get the first page to determine dimensions
        const firstPage = await pdf.getPage(1);
        const viewport = firstPage.getViewport({ scale: 1.5 });
        const pageWidth = Math.round(viewport.width);
        const pageHeight = Math.round(viewport.height);

        if (cancelled) return;
        setDimensions({ width: pageWidth, height: pageHeight });

        const images: string[] = [];

        for (let i = 1; i <= total; i++) {
          if (cancelled) return;

          const page = await pdf.getPage(i);
          const vp = page.getViewport({ scale: 1.5 });

          const canvas = document.createElement('canvas');
          canvas.width = vp.width;
          canvas.height = vp.height;
          const ctx = canvas.getContext('2d')!;

          // @ts-ignore - Type definitions for pdfjs-dist are sometimes out of sync with runtime requirements
          await page.render({ canvasContext: ctx, viewport: vp }).promise;

          images.push(canvas.toDataURL('image/jpeg', 0.92));

          setLoadProgress(Math.round((i / total) * 100));

          // Clean up
          page.cleanup();
        }

        if (!cancelled) {
          setPageImages(images);
          setLoading(false);
        }
      } catch (err) {
        console.error('Failed to load PDF:', err);
        setLoading(false);
      }
    }

    renderPDF();

    return () => {
      cancelled = true;
    };
  }, [pdfFile]);

  const flipNext = useCallback(() => {
    bookRef.current?.pageFlip()?.flipNext();
  }, []);

  const flipPrev = useCallback(() => {
    bookRef.current?.pageFlip()?.flipPrev();
  }, []);

  const onFlip = useCallback((e: any) => {
    setCurrentPage(e.data + 1);
  }, []);

  const handleZoomIn = () => setScale(s => Math.min(s + 0.15, 2));
  const handleZoomOut = () => setScale(s => Math.max(s - 0.15, 0.5));

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  // Calculate responsive book size
  const bookWidth = Math.min(dimensions.width, 500);
  const bookHeight = Math.round(bookWidth * (dimensions.height / dimensions.width));

  const isMobile = windowWidth < 768;
  const domWidth = isMobile ? bookWidth : bookWidth * 2;
  const domHeight = bookHeight;

  const paddingX = isMobile ? 32 : 120;
  const paddingY = 160;

  const availableWidth = windowWidth - paddingX;
  const availableHeight = windowHeight - paddingY;

  const scaleX = availableWidth / domWidth;
  const scaleY = availableHeight / domHeight;
  const baseScale = Math.min(scaleX, scaleY, 1);
  const finalScale = baseScale * scale;

  return (
    <div className="flipbook-container" ref={containerRef}>
      {/* Ambient glow effect */}
      <div className="ambient-glow"></div>

      {loading ? (
        <div className="loading-state">
          <div className="loader-ring">
            <Loader2 className="spin-icon" size={48} />
          </div>
          <h2>Preparing Your Book</h2>
          <p>Rendering page {Math.max(1, Math.round(loadProgress * numPages / 100))} of {numPages || '...'}</p>
          <div className="progress-bar-track">
            <div className="progress-bar-fill" style={{ width: `${loadProgress}%` }}></div>
          </div>
          <span className="progress-text">{loadProgress}%</span>
        </div>
      ) : (
        <>
          <div 
            className="book-area" 
            style={{ 
              transform: `scale(${finalScale}) translateX(${
                (!isMobile && currentPage === 1) ? -(bookWidth / 2) : 
                (!isMobile && currentPage === numPages && numPages % 2 === 0) ? (bookWidth / 2) : 0
              }px)` 
            }}
          >
            {/* @ts-ignore — react-pageflip types are incomplete */}
            <HTMLFlipBook
              key={isMobile ? 'mobile' : 'desktop'}
              width={bookWidth}
              height={bookHeight}
              size="fixed"
              maxShadowOpacity={0.5}
              showCover={!isMobile}
              mobileScrollSupport={true}
              onFlip={onFlip}
              className="flipbook-el"
              ref={bookRef}
              usePortrait={isMobile}
              startPage={Math.max(0, currentPage - 1)}
              drawShadow={true}
              flippingTime={800}
              useMouseEvents={true}
              swipeDistance={30}
              clickEventForward={false}
              showPageCorners={true}
              disableFlipByClick={true}
              style={{}}
            >
              {pageImages.map((src, index) => (
                <PageImage
                  key={`page-${index}`}
                  src={src}
                  pageNum={index + 1}
                />
              ))}
            </HTMLFlipBook>
          </div>

          {/* Navigation Arrows */}
          <button
            className="nav-arrow nav-arrow-left"
            onClick={flipPrev}
            disabled={currentPage <= 1}
            aria-label="Previous page"
          >
            <ChevronLeft size={32} />
          </button>
          <button
            className="nav-arrow nav-arrow-right"
            onClick={flipNext}
            disabled={currentPage >= numPages}
            aria-label="Next page"
          >
            <ChevronRight size={32} />
          </button>

          {/* Bottom Toolbar */}
          <div className="controls-toolbar">
            <div className="controls-group">
              <span className="page-indicator">
                Page {currentPage} of {numPages}
              </span>
            </div>

            <div className="controls-separator"></div>

            <div className="controls-group">
              <button className="control-btn" onClick={handleZoomOut} title="Zoom Out">
                <ZoomOut size={18} />
              </button>
              <span className="zoom-indicator">{Math.round(scale * 100)}%</span>
              <button className="control-btn" onClick={handleZoomIn} title="Zoom In">
                <ZoomIn size={18} />
              </button>
              <button className="control-btn" onClick={toggleFullscreen} title="Fullscreen">
                <Maximize size={18} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
