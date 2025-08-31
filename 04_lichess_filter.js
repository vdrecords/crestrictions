// ==UserScript==
// @name         04_lichess_filter - Фильтр контента Lichess (только Блиц+Рапид)
// @namespace    http://tampermonkey.net/
// @version      1.0
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

    // Get game type name on different pages
    function detectGameType() {
        // 1) Tournament page: general tournament meta block
        const tourMeta = document.querySelector('.tour__meta');
        if (tourMeta && tourMeta.textContent) {
            return tourMeta.textContent.trim();
        }

        // 2) Game page: meta info on the left
        //    Example block: .game__meta__infos .setup ... <span title="...">Пуля</span>
        const gameSetup = document.querySelector('.game__meta__infos .setup');
        if (gameSetup && gameSetup.textContent) {
            return gameSetup.textContent.trim();
        }

        // If nothing found — empty string
        return '';
    }

    // Hide "Join" buttons on tournament pages (as in original script)
    function hideJoinButtonsIfNeeded(isAllowed) {
        if (isAllowed) return;

        try {
            const xpath = "//button[contains(., 'Участвовать')]";
            const iterator = document.evaluate(xpath, document, null, XPathResult.ANY_TYPE, null);
            let btn = iterator.iterateNext();
            let changed = false;
            while (btn) {
                if (btn.style.display !== 'none') {
                    btn.style.display = 'none';
                    changed = true;
                }
                btn = iterator.iterateNext();
            }

            // Sometimes on Lichess it might not be a button, but a link-button.
            // Additional safeguard:
            const links = Array.from(document.querySelectorAll('a, button'));
            for (const el of links) {
                if (el.textContent && el.textContent.includes('Участвовать')) {
                    if (el.style.display !== 'none') {
                        el.style.display = 'none';
                        changed = true;
                    }
                }
            }
            return changed;
        } catch (e) {
            // Silent — just not found
            return false;
        }
    }

    // Hide chess board on game/round pages
    function hideBoardIfNeeded(isAllowed) {
        const board = document.querySelector('.round__app__board.main-board');
        if (!board) return false;

        // Hide only if NOT allowed
        if (!isAllowed) {
            if (board.style.display !== 'none') {
                board.style.display = 'none';
                return true;
            }
            return false;
        } else {
            // If type is allowed — make sure board is shown
            if (board.style.display === 'none') {
                board.style.display = '';
                return true;
            }
            return false;
        }
    }

    // Main procedure
    function applyRules() {
        const typeText = detectGameType();
        const allowed = isAllowedText(typeText);

        // 1) Tournaments: hide "Join" button if not allowed
        hideJoinButtonsIfNeeded(allowed);

        // 2) Games/rounds: hide board if not allowed
        hideBoardIfNeeded(allowed);
        
        // 3) Training themes: prevent clicks on blocked links
        preventBlockedTrainingClicks();
    }
    
    // Prevent clicks on blocked training theme links
    function preventBlockedTrainingClicks() {
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
                }
            });
        });
    }

    // First run
    applyRules();

    // Observer for DOM changes (Lichess actively redraws content)
    const observer = new MutationObserver(() => {
        applyRules();
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Backup: repeated pings by timer (sometimes useful for lazy mounts)
    const kickers = [500, 1200, 2500];
    kickers.forEach(ms => setTimeout(applyRules, ms));

})();