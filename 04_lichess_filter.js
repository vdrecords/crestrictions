// ==UserScript==
// @name         04_lichess_filter - Фильтр контента Lichess (только Блиц+Рапид)
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  Показ только Блиц и Рапид на Lichess, скрытие кнопок участия и досок для других типов игр
// @match        https://lichess.org/*
// @grant        GM_addStyle
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    // ==============================================
    // === Lichess – Only Blitz & Rapid (CSS) ===
    // ==============================================
    GM_addStyle(`
      .tour-chart__inner a.tsht:not(
        :has(> span.icon[title="Пуля"]),
        :has(> span.icon[title="Bullet"]),
        :has(> span.icon[title="Blitz"]),
        :has(> span.icon[title="Rapid"]),
        :has(> span.icon[title="Блиц"]),
        :has(> span.icon[title="Рапид"])
      ) {
        display: none !important;
      }

      /* Hide specific puzzle themes on /training/themes page */
      a[href="/training/openings"] { display: none !important; }
      a[href="/training/mate"] { display: none !important; }
      a[href="/training/mateIn1"] { display: none !important; }
      a[href="/training/mateIn2"] { display: none !important; }
      a[href="/training/mateIn3"] { display: none !important; }
      a[href="/training/mateIn4"] { display: none !important; }
      a[href="/training/anastasiaMate"] { display: none !important; }
      a[href="/training/arabianMate"] { display: none !important; }
      a[href="/training/backRankMate"] { display: none !important; }
      a[href="/training/bodenMate"] { display: none !important; }
      a[href="/training/doubleBishopMate"] { display: none !important; }
      a[href="/training/dovetailMate"] { display: none !important; }
      a[href="/training/hookMate"] { display: none !important; }
      a[href="/training/killBoxMate"] { display: none !important; }
      a[href="/training/vukovicMate"] { display: none !important; }
      a[href="/training/smotheredMate"] { display: none !important; }
      a[href="/training/castling"] { display: none !important; }
      a[href="/training/enPassant"] { display: none !important; }
      a[href="/training/promotion"] { display: none !important; }
      a[href="/training/underPromotion"] { display: none !important; }
      a[href="/training/oneMove"] { display: none !important; }
      a[href="/training/short"] { display: none !important; }
      a[href="/training/long"] { display: none !important; }
    `);
    console.log("[LichessFilter] GM_addStyle applied with training themes filtering");

    // ==============================================
    // === Training Themes URL Blocking ===
    // ==============================================
    
    // List of blocked training theme paths
    const blockedTrainingPaths = [
        '/training/openings',
        '/training/mate',
        '/training/mateIn1',
        '/training/mateIn2', 
        '/training/mateIn3',
        '/training/mateIn4',
        '/training/anastasiaMate',
        '/training/arabianMate',
        '/training/backRankMate',
        '/training/bodenMate',
        '/training/doubleBishopMate',
        '/training/dovetailMate',
        '/training/hookMate',
        '/training/killBoxMate',
        '/training/vukovicMate',
        '/training/smotheredMate',
        '/training/castling',
        '/training/enPassant',
        '/training/promotion',
        '/training/underPromotion',
        '/training/oneMove',
        '/training/short',
        '/training/long'
    ];
    
    // Check if current URL should be redirected
    function checkTrainingRedirect() {
        const currentPath = window.location.pathname;
        
        if (blockedTrainingPaths.includes(currentPath)) {
            console.log(`[LichessFilter] Redirecting blocked training theme: ${currentPath}`);
            window.location.replace('https://lichess.org/training');
            return true;
        }
        return false;
    }
    
    // Perform redirect check immediately
    if (checkTrainingRedirect()) {
        return; // Stop script execution if redirecting
    }

    // ==============================================
    // === Tournament Button & Board Hider ===
    // ==============================================
    
    // Allowed game types
    const allowedTypes = ['Блиц', 'Рапид', 'Blitz', 'Rapid'];

    // Utility: check if text contains any allowed type
    function isAllowedText(text) {
        if (!text) return false;
        return allowedTypes.some(type => text.includes(type));
    }

    // Get game type name on different pages with multiple fallback strategies
    function detectGameType() {
        // Strategy 1: Tournament page - general tournament meta block
        const tourMeta = document.querySelector('.tour__meta');
        if (tourMeta && tourMeta.textContent) {
            const type = tourMeta.textContent.trim();
            if (type) {
                console.log(`[LichessFilter] Detected game type from tour__meta: ${type}`);
                return type;
            }
        }

        // Strategy 2: Game page - meta info on the left
        const gameSetup = document.querySelector('.game__meta__infos .setup');
        if (gameSetup && gameSetup.textContent) {
            const type = gameSetup.textContent.trim();
            if (type) {
                console.log(`[LichessFilter] Detected game type from game__meta__infos: ${type}`);
                return type;
            }
        }

        // Strategy 3: Look for game type in page title
        const pageTitle = document.title;
        if (pageTitle) {
            for (const allowedType of allowedTypes) {
                if (pageTitle.includes(allowedType)) {
                    console.log(`[LichessFilter] Detected game type from page title: ${allowedType}`);
                    return allowedType;
                }
            }
        }

        // Strategy 4: Look for game type in URL
        const currentUrl = window.location.href;
        for (const allowedType of allowedTypes) {
            if (currentUrl.includes(allowedType.toLowerCase())) {
                console.log(`[LichessFilter] Detected game type from URL: ${allowedType}`);
                return allowedType;
            }
        }

        // Strategy 5: Look for game type in any visible text on the page
        const pageText = document.body.textContent;
        for (const allowedType of allowedTypes) {
            if (pageText.includes(allowedType)) {
                console.log(`[LichessFilter] Detected game type from page text: ${allowedType}`);
                return allowedType;
            }
        }

        console.log(`[LichessFilter] No game type detected, assuming blocked`);
        return '';
    }

    // Enhanced function to hide "Join" buttons with multiple strategies
    function hideJoinButtonsIfNeeded(isAllowed) {
        if (isAllowed) return;

        let changed = false;

        try {
            // Strategy 1: XPath for Russian text
            const xpath = "//button[contains(., 'Участвовать')]";
            const iterator = document.evaluate(xpath, document, null, XPathResult.ANY_TYPE, null);
            let btn = iterator.iterateNext();
            while (btn) {
                if (btn.style.display !== 'none') {
                    btn.style.display = 'none';
                    changed = true;
                    console.log(`[LichessFilter] Hidden join button via XPath`);
                }
                btn = iterator.iterateNext();
            }

            // Strategy 2: Look for any element with "Участвовать" text
            const allElements = Array.from(document.querySelectorAll('*'));
            for (const el of allElements) {
                if (el.textContent && el.textContent.includes('Участвовать')) {
                    if (el.style.display !== 'none') {
                        el.style.display = 'none';
                        changed = true;
                        console.log(`[LichessFilter] Hidden join element: ${el.tagName}`);
                    }
                }
            }

            // Strategy 3: Look for English equivalents
            const englishJoinTexts = ['Join', 'Join tournament', 'Participate'];
            for (const text of englishJoinTexts) {
                for (const el of allElements) {
                    if (el.textContent && el.textContent.includes(text)) {
                        if (el.style.display !== 'none') {
                            el.style.display = 'none';
                            changed = true;
                            console.log(`[LichessFilter] Hidden English join element: ${el.tagName} with text: ${text}`);
                        }
                    }
                }
            }

        } catch (e) {
            console.log(`[LichessFilter] Error in hideJoinButtonsIfNeeded: ${e.message}`);
        }

        return changed;
    }

    // Enhanced function to hide chess board
    function hideBoardIfNeeded(isAllowed) {
        // Only hide board on tournament pages (where game__tournament section exists)
        const tournamentSection = document.querySelector('section.game__tournament');
        if (!tournamentSection) {
            console.log(`[LichessFilter] No tournament section found, skipping board hiding`);
            return false;
        }

        // Multiple selectors for different board types
        const boardSelectors = [
            '.round__app__board.main-board',
            '.main-board',
            '.board',
            '.chess-board',
            '[data-board]'
        ];

        let boardFound = false;
        let boardHidden = false;

        for (const selector of boardSelectors) {
            const board = document.querySelector(selector);
            if (board) {
                boardFound = true;
                console.log(`[LichessFilter] Found board with selector: ${selector}`);

                if (!isAllowed) {
                    if (board.style.display !== 'none') {
                        board.style.display = 'none';
                        boardHidden = true;
                        console.log(`[LichessFilter] Hidden board with selector: ${selector}`);
                    }
                } else {
                    // If type is allowed — make sure board is shown
                    if (board.style.display === 'none') {
                        board.style.display = '';
                        console.log(`[LichessFilter] Showed board with selector: ${selector}`);
                    }
                }
            }
        }

        if (!boardFound) {
            console.log(`[LichessFilter] No board found with any selector`);
        }

        return boardHidden;
    }

    // Enhanced main procedure with better logging
    function applyRules() {
        console.log(`[LichessFilter] Applying rules...`);
        
        // Special case: Puzzle Racer page should always be allowed
        const currentPath = window.location.pathname;
        if (currentPath === '/racer') {
            console.log(`[LichessFilter] Puzzle Racer page detected - allowing access`);
            return { allowed: true, joinButtonsHidden: false, boardHidden: false, trainingClicksBlocked: 0 };
        }
        
        const typeText = detectGameType();
        const allowed = isAllowedText(typeText);

        console.log(`[LichessFilter] Game type: "${typeText}", Allowed: ${allowed}`);

        // 1) Tournaments: hide "Join" button if not allowed
        const joinButtonsHidden = hideJoinButtonsIfNeeded(allowed);

        // 2) Games/rounds: hide board if not allowed
        const boardHidden = hideBoardIfNeeded(allowed);
        
        // 3) Training themes: prevent clicks on blocked links
        const trainingClicksBlocked = preventBlockedTrainingClicks();

        console.log(`[LichessFilter] Rules applied - Join buttons hidden: ${joinButtonsHidden}, Board hidden: ${boardHidden}, Training clicks blocked: ${trainingClicksBlocked}`);

        return { allowed, joinButtonsHidden, boardHidden, trainingClicksBlocked };
    }
    
    // Enhanced function to prevent clicks on blocked training theme links
    function preventBlockedTrainingClicks() {
        let blocked = 0;
        
        blockedTrainingPaths.forEach(path => {
            const links = document.querySelectorAll(`a[href="${path}"]`);
            links.forEach(link => {
                if (!link.dataset.lichessFilterProcessed) {
                    link.addEventListener('click', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log(`[LichessFilter] Blocked click on training theme: ${path}`);
                        window.location.href = 'https://lichess.org/training';
                    }, true);
                    link.dataset.lichessFilterProcessed = 'true';
                    blocked++;
                }
            });
        });

        return blocked;
    }

    // Enhanced observer with better performance
    let observerActive = false;
    let lastApplyTime = 0;
    const MIN_APPLY_INTERVAL = 100; // Minimum 100ms between applies

    function setupObserver() {
        if (observerActive) return;

        const observer = new MutationObserver((mutations) => {
            const now = Date.now();
            if (now - lastApplyTime < MIN_APPLY_INTERVAL) return;

            // Only apply rules if there are significant DOM changes
            const hasSignificantChanges = mutations.some(mutation => {
                return mutation.type === 'childList' && 
                       (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0);
            });

            if (hasSignificantChanges) {
                lastApplyTime = now;
                applyRules();
            }
        });

        observer.observe(document.body, { 
            childList: true, 
            subtree: true,
            attributes: false, // Don't watch attribute changes for performance
            characterData: false
        });

        observerActive = true;
        console.log(`[LichessFilter] Observer setup complete`);
    }

    // Enhanced initialization with multiple strategies
    function initialize() {
        console.log(`[LichessFilter] Initializing...`);
        
        // First run
        const result = applyRules();
        
        // Setup observer for DOM changes
        setupObserver();
        
        // Enhanced backup: repeated pings with exponential backoff
        const kickers = [100, 300, 800, 2000, 5000];
        kickers.forEach((ms, index) => {
            setTimeout(() => {
                console.log(`[LichessFilter] Backup check #${index + 1} after ${ms}ms`);
                applyRules();
            }, ms);
        });

        // Additional safety: check every 10 seconds for the first minute
        for (let i = 1; i <= 6; i++) {
            setTimeout(() => {
                console.log(`[LichessFilter] Safety check #${i}`);
                applyRules();
            }, i * 10000);
        }

        // Long-term safety: check every 30 seconds
        setInterval(() => {
            applyRules();
        }, 30000);

        console.log(`[LichessFilter] Initialization complete`);
    }

    // Wait for DOM to be ready, then initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        // DOM is already ready
        initialize();
    }

    // Additional safety: also initialize when window loads
    window.addEventListener('load', () => {
        console.log(`[LichessFilter] Window loaded, applying rules again`);
        applyRules();
    });

    // Handle page visibility changes (for background tabs)
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            console.log(`[LichessFilter] Page became visible, applying rules`);
            setTimeout(applyRules, 100); // Small delay to ensure DOM is ready
        }
    });

})();