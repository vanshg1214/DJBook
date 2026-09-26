import React, { useState, useEffect, useRef, useCallback } from 'react';
import HTMLFlipBook from 'react-pageflip';
import * as pdfjsLib from 'pdfjs-dist';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import './FlipbookViewer.css';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

interface FlipbookViewerProps {
  pdfFile: string;
}

const PageImage = React.forwardRef<HTMLDivElement, { src: string; pageNum: number }>(
  ({ src, pageNum }, ref) => (
    <div className="page-wrapper" ref={ref} data-page={pageNum}>
      <img src={src} alt={`Page ${pageNum}`} className="page-img" draggable={false} />
    </div>
  )
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

        const firstPage = await pdf.getPage(1);
        const viewport = firstPage.getViewport({ scale: 1.5 });
        if (cancelled) return;
        setDimensions({ width: Math.round(viewport.width), height: Math.round(viewport.height) });

        const images: string[] = [];
        for (let i = 1; i <= total; i++) {
          if (cancelled) return;
          const page = await pdf.getPage(i);
          const vp = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement('canvas');
          canvas.width = vp.width;
          canvas.height = vp.height;
          const ctx = canvas.getContext('2d')!;
          // @ts-ignore
          await page.render({ canvasContext: ctx, viewport: vp }).promise;
          images.push(canvas.toDataURL('image/jpeg', 0.92));
          setLoadProgress(Math.round((i / total) * 100));
          page.cleanup();
        }
        if (!cancelled) { setPageImages(images); setLoading(false); }
      } catch (err) {
        console.error('Failed to load PDF:', err);
        setLoading(false);
      }
    }
    renderPDF();
    return () => { cancelled = true; };
  }, [pdfFile]);

  const flipNext = useCallback(() => bookRef.current?.pageFlip()?.flipNext(), []);
  const flipPrev = useCallback(() => bookRef.current?.pageFlip()?.flipPrev(), []);
  const onFlip = useCallback((e: any) => setCurrentPage(e.data + 1), []);
  const handleZoomIn = () => setScale(s => Math.min(s + 0.15, 2));
  const handleZoomOut = () => setScale(s => Math.max(s - 0.15, 0.5));
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) containerRef.current?.requestFullscreen();
    else document.exitFullscreen();
  };

  // ─── Layout calculations ───────────────────────────────────────────────────
  const isMobile = windowWidth < 1024;

  // Native page aspect ratio from PDF
  const aspect = dimensions.height / dimensions.width;

  // Toolbar + header space reserved
  const reservedY = isMobile ? 120 : 140;
  const reservedX = isMobile ? 80 : 180; // room for side arrows

  const availW = windowWidth  - reservedX;
  const availH = windowHeight - reservedY;

  let pageW: number, pageH: number;

  if (isMobile) {
    // Single page — fill available space maintaining aspect ratio
    pageW = Math.min(availW, availH / aspect);
    pageH = Math.round(pageW * aspect);
    if (pageH > availH) { pageH = availH; pageW = Math.round(pageH / aspect); }
  } else {
    // Two pages — each page fills half the available width
    pageW = Math.min(Math.floor(availW / 2), dimensions.width);
    pageH = Math.round(pageW * aspect);
    if (pageH > availH) { pageH = availH; pageW = Math.round(pageH / aspect); }
  }

  // Apply user zoom on top
  const displayPageW = Math.round(pageW * scale);
  const displayPageH = Math.round(pageH * scale);

  // translateX to center single pages (cover / back cover in desktop two-page mode)
  const coverOffset = (!isMobile && currentPage === 1) ? -(displayPageW / 2)
    : (!isMobile && currentPage === numPages && numPages % 2 === 0) ? (displayPageW / 2) : 0;

  return (
    <div className="flipbook-container" ref={containerRef}>
      {loading ? (
        <div className="loading-state">
          <h2 className="loading-title">Great Galleries</h2>
          <div className="progress-bar-track">
            <div className="progress-bar-fill" style={{ width: `${loadProgress}%` }} />
          </div>
          <span className="progress-text">Loading {loadProgress}%</span>
        </div>
      ) : (
        <>
          {/* Title above the book */}
          <div className="book-header">
            <span className="book-title">Great Galleries</span>
          </div>

          {/* Book + Side Arrows row */}
          <div className="book-row">
            <button
              className="nav-arrow"
              onClick={flipPrev}
              disabled={currentPage <= 1}
              aria-label="Previous page"
            >
              <ChevronLeft size={24} />
            </button>

            <div
              className="book-area"
              style={{ transform: `translateX(${coverOffset}px)` }}
            >
              {/* @ts-ignore */}
              <HTMLFlipBook
                key={isMobile ? 'mobile' : 'desktop'}
                width={displayPageW}
                height={displayPageH}
                size="fixed"
                minWidth={displayPageW}
                maxWidth={displayPageW}
                minHeight={displayPageH}
                maxHeight={displayPageH}
                maxShadowOpacity={0.4}
                showCover={true}
                mobileScrollSupport={true}
                onFlip={onFlip}
                className="flipbook-el"
                ref={bookRef}
                usePortrait={isMobile}
                startPage={0}
                drawShadow={true}
                flippingTime={750}
                useMouseEvents={true}
                swipeDistance={20}
                clickEventForward={false}
                showPageCorners={!isMobile}
                disableFlipByClick={true}
                style={{}}
              >
                {pageImages.map((src, index) => (
                  <PageImage key={`page-${index}`} src={src} pageNum={index + 1} />
                ))}
              </HTMLFlipBook>
            </div>

            <button
              className="nav-arrow"
              onClick={flipNext}
              disabled={currentPage >= numPages}
              aria-label="Next page"
            >
              <ChevronRight size={24} />
            </button>
          </div>

          {/* Bottom Toolbar */}
          <div className="controls-toolbar">
            <div className="controls-group">
              <span className="page-indicator">Page {currentPage} of {numPages}</span>
            </div>
            <div className="controls-separator" />
            <div className="controls-group">
              <button className="control-btn" onClick={handleZoomOut} title="Zoom Out">
                <ZoomOut size={16} />
              </button>
              <span className="zoom-indicator">{Math.round(scale * 100)}%</span>
              <button className="control-btn" onClick={handleZoomIn} title="Zoom In">
                <ZoomIn size={16} />
              </button>
              <button className="control-btn" onClick={toggleFullscreen} title="Fullscreen">
                <Maximize size={16} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
