import React, { useState, useEffect, useRef, useCallback } from 'react';
import HTMLFlipBook from 'react-pageflip';
import * as pdfjsLib from 'pdfjs-dist';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize, ChevronDown, Loader2 } from 'lucide-react';
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

interface PdfData {
  images: string[];
  numPages: number;
  dimensions: { width: number; height: number };
}

// Renders every page of a PDF to a JPEG data URL
async function loadPdfData(url: string, onProgress?: (percent: number) => void): Promise<PdfData> {
  const loadingTask = pdfjsLib.getDocument({ url });
  const pdf = await loadingTask.promise;
  const total = pdf.numPages;

  const firstPage = await pdf.getPage(1);
  const firstViewport = firstPage.getViewport({ scale: 1.5 });
  const dimensions = {
    width: Math.round(firstViewport.width),
    height: Math.round(firstViewport.height),
  };

  const images: string[] = [];

  for (let i = 1; i <= total; i++) {
    const page = await pdf.getPage(i);
    const vp = page.getViewport({ scale: 1.5 });

    const canvas = document.createElement('canvas');
    canvas.width = vp.width;
    canvas.height = vp.height;
    const ctx = canvas.getContext('2d')!;

    // @ts-ignore - Type definitions for pdfjs-dist are sometimes out of sync with runtime requirements
    await page.render({ canvasContext: ctx, viewport: vp }).promise;

    images.push(canvas.toDataURL('image/jpeg', 0.92));
    onProgress?.(Math.round((i / total) * 100));

    page.cleanup();
  }

  return { images, numPages: total, dimensions };
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

export default function FlipbookViewer() {
  const [language, setLanguage] = useState<LanguageCode>('en');
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  // Cache of fully-rendered PDFs, keyed by language, so switching is instant
  const [cache, setCache] = useState<Partial<Record<LanguageCode, PdfData>>>({});
  const cacheRef = useRef(cache);
  cacheRef.current = cache;
  const loadPromisesRef = useRef<Partial<Record<LanguageCode, Promise<PdfData>>>>({});

  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [scale, setScale] = useState(1);
  const bookRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const langMenuRef = useRef<HTMLDivElement>(null);

  // Which page the flipbook should mount showing; updated right before a language switch
  const initialPageRef = useRef(0);

  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [windowHeight, setWindowHeight] = useState(window.innerHeight);

  const current = cache[language];
  const pageImages = current?.images ?? [];
  const numPages = current?.numPages ?? 0;
  const dimensions = current?.dimensions ?? { width: 459, height: 594 };

  const ensureLoaded = useCallback((code: LanguageCode, onProgress?: (percent: number) => void) => {
    const cached = cacheRef.current[code];
    if (cached) return Promise.resolve(cached);

    if (!loadPromisesRef.current[code]) {
      loadPromisesRef.current[code] = loadPdfData(LANGUAGES[code].file, onProgress)
        .then(data => {
          cacheRef.current = { ...cacheRef.current, [code]: data };
          setCache(cacheRef.current);
          return data;
        })
        .catch(err => {
          delete loadPromisesRef.current[code];
          throw err;
        });
    }

    return loadPromisesRef.current[code]!;
  }, []);

  // Load the default language up front, then silently preload the other one in
  // the background so switching later is instant with no loading screen.
  useEffect(() => {
    let cancelled = false;

    ensureLoaded(language, percent => {
      if (!cancelled) setLoadProgress(percent);
    }).then(() => {
      if (cancelled) return;
      setLoading(false);

      const otherLanguages = (Object.keys(LANGUAGES) as LanguageCode[]).filter(code => code !== language);
      otherLanguages.forEach(code => {
        ensureLoaded(code).catch(err => console.error(`Failed to preload ${code} edition:`, err));
      });
    }).catch(err => {
      console.error('Failed to load PDF:', err);
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const selectLanguage = useCallback(async (code: LanguageCode) => {
    setLangMenuOpen(false);
    if (code === language) return;

    let data = cacheRef.current[code];
    if (!data) {
      // Rare: user switched before the background preload finished. Wait for
      // it, with a small inline spinner instead of the full loading screen.
      setSwitching(true);
      try {
        data = await ensureLoaded(code);
      } catch (err) {
        console.error(`Failed to load ${code} edition:`, err);
        setSwitching(false);
        return;
      }
      setSwitching(false);
    }

    // Keep the reader on the same page number, clamped to the new edition's length
    const clampedIndex = Math.min(Math.max(currentPage - 1, 0), data.numPages - 1);
    initialPageRef.current = clampedIndex;
    setCurrentPage(clampedIndex + 1);
    setLanguage(code);
  }, [language, currentPage, ensureLoaded]);

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
          disabled={switching}
        >
          <span>{LANGUAGES[language].label}</span>
          {switching ? (
            <Loader2 size={14} className="lang-switcher-spinner" />
          ) : (
            <ChevronDown size={14} className={`lang-switcher-chevron ${langMenuOpen ? 'is-open' : ''}`} />
          )}
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
