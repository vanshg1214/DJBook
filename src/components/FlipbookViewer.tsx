import React, { useState, useEffect, useRef, useCallback } from 'react';
import HTMLFlipBook from 'react-pageflip';
import * as pdfjsLib from 'pdfjs-dist';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize, ChevronDown } from 'lucide-react';
import './FlipbookViewer.css';

// Set up the pdf.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

const LANGUAGES = {
  en: { label: 'EN', name: 'English', file: '/GreatGalleries_v53.pdf', title: 'Great Galleries' },
  es: { label: 'ES', name: 'Español', file: '/GrandesGalerias_ES.pdf', title: 'Grandes Galerías' },
} as const;

type LanguageCode = keyof typeof LANGUAGES;

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

export default function FlipbookViewer() {
  const [language, setLanguage] = useState<LanguageCode>('en');
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const pdfFile = LANGUAGES[language].file;

  const [pageImages, setPageImages] = useState<string[]>([]);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [scale, setScale] = useState(1);
  const [dimensions, setDimensions] = useState({ width: 459, height: 594 });
  const bookRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const langMenuRef = useRef<HTMLDivElement>(null);

  // Capture initial page only once per mount so it doesn't disrupt react-pageflip state
  const initialPageRef = useRef(0);

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

  // Close the language dropdown when clicking outside of it
  useEffect(() => {
    if (!langMenuOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (langMenuRef.current && !langMenuRef.current.contains(e.target as Node)) {
        setLangMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [langMenuOpen]);

  const selectLanguage = useCallback((code: LanguageCode) => {
    setLanguage(code);
    setLangMenuOpen(false);
  }, []);

  // Render all PDF pages to images
  useEffect(() => {
    let cancelled = false;

    async function renderPDF() {
      try {
        setLoading(true);
        setLoadProgress(0);
        setCurrentPage(1);
        initialPageRef.current = 0;

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
    // Update page state after flip
    setTimeout(() => {
      const page = bookRef.current?.pageFlip()?.getCurrentPageIndex();
      if (page !== undefined) setCurrentPage(page + 1);
    }, 850);
  }, []);

  const flipPrev = useCallback(() => {
    bookRef.current?.pageFlip()?.flipPrev();
    // Update page state after flip
    setTimeout(() => {
      const page = bookRef.current?.pageFlip()?.getCurrentPageIndex();
      if (page !== undefined) setCurrentPage(page + 1);
    }, 850);
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

  // Use 1024 as breakpoint to ensure iPads and large phones get the single-page portrait mode
  const isMobile = windowWidth < 1024;
  const domWidth = isMobile ? bookWidth : bookWidth * 2;
  const domHeight = bookHeight;

  const paddingX = isMobile ? 16 : 120;
  const paddingY = isMobile ? 120 : 160;

  const availableWidth = windowWidth - paddingX;
  const availableHeight = windowHeight - paddingY;

  const scaleX = availableWidth / domWidth;
  const scaleY = availableHeight / domHeight;
  const baseScale = Math.min(scaleX, scaleY, 1);
  const finalScale = baseScale * scale;

  return (
    <div className="flipbook-container" ref={containerRef}>
      <div className="lang-switcher" ref={langMenuRef}>
        <button
          className="lang-switcher-btn"
          onClick={() => setLangMenuOpen(open => !open)}
          aria-label="Change language"
          aria-expanded={langMenuOpen}
        >
          <span>{LANGUAGES[language].label}</span>
          <ChevronDown size={14} className={`lang-switcher-chevron ${langMenuOpen ? 'is-open' : ''}`} />
        </button>
        {langMenuOpen && (
          <div className="lang-switcher-menu">
            {(Object.keys(LANGUAGES) as LanguageCode[]).map(code => (
              <button
                key={code}
                className={`lang-switcher-option ${code === language ? 'is-active' : ''}`}
                onClick={() => selectLanguage(code)}
              >
                {LANGUAGES[code].name}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="loading-state">
          <h2 className="loading-title">{LANGUAGES[language].title}</h2>
          <div className="progress-bar-track">
            <div className="progress-bar-fill" style={{ width: `${loadProgress}%` }}></div>
          </div>
          <span className="progress-text">Loading {loadProgress}%</span>
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
            <div style={{ width: domWidth, height: domHeight, maxWidth: '100%' }}>
              {/* @ts-ignore — react-pageflip types are incomplete */}
              <HTMLFlipBook
                key={`${isMobile ? 'mobile' : 'desktop'}-${language}`}
                width={bookWidth}
                height={bookHeight}
                size={isMobile ? "stretch" : "fixed"}
                minWidth={300}
                maxWidth={bookWidth}
                minHeight={400}
                maxHeight={bookHeight}
                maxShadowOpacity={0.5}
                showCover={!isMobile}
                mobileScrollSupport={true}
                onFlip={onFlip}
                onInit={() => {
                  const pf = bookRef.current?.pageFlip();
                  if (pf) {
                    // Work around a bug in the underlying page-flip library: flipNext()
                    // offsets its target point by the book's left position, but flipPrev()
                    // doesn't, so it registers as outside the page-corner hit zone and
                    // silently no-ops whenever the book isn't flush against the left edge
                    // of its container (which it never is, since it's centered).
                    const flipController = pf.getFlipController();
                    pf.flipPrev = (corner: string = 'top') => {
                      const rect = pf.getRender().getRect();
                      flipController.flip({
                        x: rect.left + 10,
                        y: corner === 'bottom' ? rect.height - 2 : 1,
                      });
                    };

                    const page = pf.getCurrentPageIndex();
                    if (page !== undefined) setCurrentPage(page + 1);
                  }
                }}
                className="flipbook-el"
                ref={bookRef}
                usePortrait={true}
                startPage={initialPageRef.current}
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
