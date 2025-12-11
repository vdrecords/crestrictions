// ==UserScript==
// @name         09_2_lichess_racer_tracker - Раcer-only трекер Lichess
// @namespace    http://tampermonkey.net/
// @version      1.27
// @description  Трекер задач Lichess Racer + ChessTempo, редиректы и мониторинг прогресса по разрешенным источникам
// @include      *
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // ==============================
    // === Core Settings ===
    const SCRIPT_VERSION = '1.27';
    const SPECIAL_TARGET_DATE = '2025-11-18';
    const SPECIAL_TARGET_VALUE = 3;

    // Chess.com puzzles access: allow puzzles pages when enabled
    const ENABLE_CHESS_COM_PUZZLES_MODE = true; // Toggle to allow Chess.com puzzles pages
    const CHESS_COM_PUZZLES_ALLOWED_HOSTS = ['www.chess.com', 'chess.com'];
    const CHESS_COM_PUZZLES_ALLOWED_ROOT = '/puzzles';

    // Puzzle source toggles (set list to ['lichess'], ['chesstempo'] or ['lichess','chesstempo'])
    const ACTIVE_PUZZLE_SOURCES = ['lichess', 'chesstempo'];
    const ENABLE_LICHESS_RACER = ACTIVE_PUZZLE_SOURCES.includes('lichess');
    const ENABLE_CHESSTEMPO_TACTICS = ACTIVE_PUZZLE_SOURCES.includes('chesstempo');
    const PREFERRED_PUZZLE_SOURCE = ACTIVE_PUZZLE_SOURCES[0] || 'lichess';
    const DEBUG_SUPPRESS_GENERAL_LOGS = true;       // hide noisy logs while debugging ChessTempo next click
    const DEBUG_CHESSTEMPO_NEXT_LOGS = true;        // show only targeted ChessTempo next-click debug

    // ==============================
    // Explicit daily targets (Mon-Sun)
    const WEEKLY_TASK_TARGETS = [
        20,  // Monday
        400,  // Tuesday
        20,  // Wednesday
        400,  // Thursday
        200,  // Friday
        1000, // Saturday
        1000  // Sunday
    ];

    // Dynamic target: override on SPECIAL_TARGET_DATE
    function getMinTasksPerDay(date = new Date()) {
        const dateKey = formatDateKey(date);
        if (dateKey === SPECIAL_TARGET_DATE) return SPECIAL_TARGET_VALUE;
        const jsDay = date.getDay(); // 0=Sun, ..., 6=Sat
        const mondayBasedIndex = (jsDay + 6) % 7; // convert to Monday=0 ... Sunday=6
        return WEEKLY_TASK_TARGETS[mondayBasedIndex] || WEEKLY_TASK_TARGETS[0];
    }

    let minTasksPerDay = getMinTasksPerDay();
    console.log(`[RacerTracker] Daily target set: ${minTasksPerDay}`);
    
    // Logging controls
    const __origLog   = console.log.bind(console);
    const __origWarn  = console.warn.bind(console);
    const __origError = console.error.bind(console);
    if (DEBUG_SUPPRESS_GENERAL_LOGS) {
        console.log = () => {};
        console.debug = () => {};
        console.info = () => {};
    }
    function nextLog(...args) {
        if (!DEBUG_CHESSTEMPO_NEXT_LOGS) return;
        __origLog('[NextDebug]', ...args);
    }
    function nextWarn(...args) {
        if (!DEBUG_CHESSTEMPO_NEXT_LOGS) return;
        __origWarn('[NextDebug]', ...args);
    }
    function descEl(el) {
        if (!el) return 'null';
        const tag = el.tagName ? el.tagName.toLowerCase() : 'node';
        const id = el.id ? `#${el.id}` : '';
        const cls = el.className ? `.${String(el.className).replace(/\s+/g, '.')}` : '';
        const text = (el.textContent || '').trim().slice(0, 50);
        return `${tag}${id}${cls} "${text}"`;
    }
    
    // For compatibility with message control script (uses same GM key format)
    const COMPATIBILITY_ID   = 72;         // Fixed ID for GM key compatibility
    const DAILY_UNLOCK_FLAG_PREFIX = 'daily_unlock_flag';
    const UNLOCK_FLAG_STORAGE_KEY = 'lichess_racer_unlock_flag';

    // =================================
    // === Helper Functions ===
    // =================================
    function getTodayDateString(date = new Date()) {
        const result = formatDateKey(date);
        console.log(`[RacerTracker] getTodayDateString() calculated: ${result} (raw Date: ${date})`);
        return result;
    }

    function formatDateKey(date) {
        const y   = date.getFullYear();
        const m   = String(date.getMonth() + 1).padStart(2, '0');
        const d   = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    function readGMNumber(key) {
        const v = GM_getValue(key, null);
        const result = v === null ? null : (isNaN(parseInt(v, 10)) ? null : parseInt(v, 10));
        console.log(`[RacerTracker] GM_READ: '${key}' = '${v}' -> ${result}`);
        return result;
    }

    function writeGMNumber(key, num) {
        const oldValue = GM_getValue(key, null);
        GM_setValue(key, String(num));
        
        // Verify the write was successful
        const verifyValue = GM_getValue(key, null);
        console.log(`[RacerTracker] GM_WRITE: '${key}' = '${oldValue}' -> '${num}' (verified: '${verifyValue}')`);
        
        if (verifyValue !== String(num)) {
            console.error(`[RacerTracker] GM_WRITE FAILED! Expected '${num}', got '${verifyValue}'`);
        } else {
            // Also set a signal that message control can detect
            const signalKey = `data_updated_signal_${Date.now()}`;
            GM_setValue(signalKey, `${key}:${num}`);
            console.log(`[RacerTracker] Set update signal '${signalKey}' = '${key}:${num}'`);
        }
    }

    function getDailyUnlockFlagKey(dateKey, courseId = COMPATIBILITY_ID) {
        return `${DAILY_UNLOCK_FLAG_PREFIX}_${courseId}_${dateKey}`;
    }

    function isDailyUnlockGrantedForDate(dateKey) {
        return GM_getValue(getDailyUnlockFlagKey(dateKey), '0') === '1';
    }

    function persistUnlockFlagState(dateKey, granted) {
        const payload = {
            courseId: COMPATIBILITY_ID,
            date: dateKey,
            granted,
            key: getDailyUnlockFlagKey(dateKey),
            timestamp: Date.now()
        };
        try {
            window.lichessRacerUnlockData = payload;
        } catch (e) {
            console.log('[RacerTracker] Failed to expose unlock state on window', e);
        }
        try {
            localStorage.setItem(UNLOCK_FLAG_STORAGE_KEY, JSON.stringify(payload));
        } catch (e) {
            console.log('[RacerTracker] Failed to persist unlock flag to localStorage', e);
        }
    }

    function setDailyUnlockFlag(dateKey, granted) {
        const key = getDailyUnlockFlagKey(dateKey);
        const newValue = granted ? '1' : '0';
        const previousValue = GM_getValue(key, null);
        if (previousValue === newValue) {
            persistUnlockFlagState(dateKey, granted);
            return;
        }
        GM_setValue(key, newValue);
        console.log(`[RacerTracker] Daily unlock flag for ${dateKey} set to ${newValue}`);
        persistUnlockFlagState(dateKey, granted);
        try {
            window.dispatchEvent(new CustomEvent('lichessRacerUnlockFlag', {
                detail: { date: dateKey, granted, key, courseId: COMPATIBILITY_ID }
            }));
        } catch (e) {
            console.log('[RacerTracker] Failed to dispatch unlock flag event', e);
        }
    }

    function ensureDailyUnlockFlag(dateKey) {
        const key = getDailyUnlockFlagKey(dateKey);
        if (GM_getValue(key, null) === null) {
            GM_setValue(key, '0');
            console.log(`[RacerTracker] Initialized daily unlock flag for ${dateKey}`);
        }
        persistUnlockFlagState(dateKey, isDailyUnlockGrantedForDate(dateKey));
    }

    function syncDailyUnlockFlag(currentSolved, dateKey) {
        const shouldGrant = currentSolved >= minTasksPerDay;
        const currentlyGranted = isDailyUnlockGrantedForDate(dateKey);
        if (shouldGrant && !currentlyGranted) {
            setDailyUnlockFlag(dateKey, true);
        } else if (!shouldGrant && currentlyGranted) {
            setDailyUnlockFlag(dateKey, false);
        }
    }

    // ===============================
    // === RACER TRACKER LOGIC ===
    // ===============================
    (function() {
        console.log(`[RacerTracker] Script version: ${SCRIPT_VERSION}`);
        const racerPageURL = 'https://lichess.org/racer';
        const chessTempoTacticsURL = 'https://chesstempo.com/chess-tactics/';
        const dateKey = getTodayDateString();
        ensureDailyUnlockFlag(dateKey);

        // GM keys for compatibility with message control script
        const keyDailyCount   = `daily_solved_${COMPATIBILITY_ID}_${dateKey}`;
        const keyCachedSolved = `cached_solved_${COMPATIBILITY_ID}_${dateKey}`;
        const keyCachedUnlock = `cached_unlock_${COMPATIBILITY_ID}_${dateKey}`;
        const keyRacerPuzzles = `racer_puzzles_${COMPATIBILITY_ID}_${dateKey}`;

        function publishSharedProgress(solvedValue) {
            const payload = {
                solved: solvedValue,
                courseId: COMPATIBILITY_ID,
                date: dateKey,
                key: keyDailyCount,
                source: 'racer',
                timestamp: Date.now()
            };
            try {
                window.lichessTrackerData = payload;
            } catch (e) {
                console.log('[RacerTracker] Failed to expose payload on window', e);
            }
            try {
                localStorage.setItem('lichess_tracker_data', JSON.stringify(payload));
            } catch (e) {
                console.log('[RacerTracker] Failed to write payload to localStorage', e);
            }
        }

        function getTrainingRedirectTarget() {
            if (PREFERRED_PUZZLE_SOURCE === 'chesstempo' && ENABLE_CHESSTEMPO_TACTICS) return chessTempoTacticsURL;
            if (ENABLE_LICHESS_RACER) return racerPageURL;
            if (ENABLE_CHESSTEMPO_TACTICS) return chessTempoTacticsURL;
            return racerPageURL;
        }

        const trainingRedirectURL = getTrainingRedirectTarget();

        const hostname = window.location.hostname;
        const pathname = window.location.pathname;

        const isChessComHost = CHESS_COM_PUZZLES_ALLOWED_HOSTS.includes(hostname);
        const chessRootWithSlash = `${CHESS_COM_PUZZLES_ALLOWED_ROOT}/`;
        const isWithinChessPuzzles = isChessComHost && (
            pathname === CHESS_COM_PUZZLES_ALLOWED_ROOT ||
            pathname.startsWith(chessRootWithSlash)
        );
        const isChessPuzzlesAllowedPage = ENABLE_CHESS_COM_PUZZLES_MODE && isWithinChessPuzzles;
        
        const isLichessHost = hostname === 'lichess.org';
        const isChessTempoHost = hostname === 'chesstempo.com';

        // Check if current page is racer-related (allowed when goal not met)
        const isRacerRelated = isLichessHost && (
            pathname === '/racer' ||
            pathname.startsWith('/racer/')
        );
        
        // Check if this is a Lichess page that should be allowed (forums, teams, study, analysis)
        const isLichessUtilityPage = isLichessHost && (
            pathname.startsWith('/forum/') ||
            pathname.startsWith('/team/') ||
            pathname.startsWith('/study/') ||
            pathname.startsWith('/analysis/')
        );
        
        const isAllowedRacerPage = ENABLE_LICHESS_RACER && isRacerRelated;
        const isAllowedLichessUtilityPage = ENABLE_LICHESS_RACER && isLichessUtilityPage;

        const isChessTempoTacticsPage = isChessTempoHost && (
            pathname === '/chess-tactics' ||
            pathname.startsWith('/chess-tactics/')
        );
        const isChessTempoAllowedPage = ENABLE_CHESSTEMPO_TACTICS && isChessTempoTacticsPage;
        
        // Any non-whitelisted page should be redirected if goal not met
        const isTrainingOrAllowedPage = isAllowedRacerPage || isChessTempoAllowedPage || isChessPuzzlesAllowedPage;
        const isOtherPage = !isTrainingOrAllowedPage && !isAllowedLichessUtilityPage;
        
        // Check if this is a racer page (including active races)
        const isRacerPage = isLichessHost && (
            pathname.startsWith('/racer/') || 
            pathname === '/racer' ||
            pathname.includes('/racer')
        );
        const isRacerLobby = isLichessHost && pathname === '/racer';


        // Reset keys at midnight (only if it's actually a new day)
        const savedDate = GM_getValue('racer_tracker_date', null);
        console.log(`[RacerTracker] Date check - Saved: '${savedDate}', Current: '${dateKey}'`);
        
        if (savedDate !== dateKey) {
            minTasksPerDay = getMinTasksPerDay();
            console.log(`[RacerTracker] (Midnight reset) Daily target set: ${minTasksPerDay}`);
            if (savedDate === null) {
                console.log(`[RacerTracker] First run - initializing date tracking for ${dateKey}`);
                GM_setValue('racer_tracker_date', dateKey);
            } else {
                // Parse dates to compare properly
                const savedDateObj = new Date(savedDate + 'T00:00:00');
                const currentDateObj = new Date(dateKey + 'T00:00:00');
                
                if (currentDateObj > savedDateObj) {
                    console.log(`[RacerTracker] New day detected (${savedDate} -> ${dateKey}) — resetting GM keys`);
                    GM_setValue('racer_tracker_date', dateKey);
                    // Reset all keys for new day
                    writeGMNumber(keyDailyCount, 0);
                    writeGMNumber(keyCachedSolved, 0);
                    writeGMNumber(keyCachedUnlock, minTasksPerDay);
                    writeGMNumber(keyRacerPuzzles, 0);
                    publishSharedProgress(0);
                    setDailyUnlockFlag(dateKey, false);
                    if (savedDate) {
                        const prevFlagKey = getDailyUnlockFlagKey(savedDate);
                        GM_deleteValue(prevFlagKey);
                        console.log(`[RacerTracker] Cleared previous unlock flag ${prevFlagKey}`);
                    }
                    
                    // Clean up old processed race data (keep only last 7 days)
                    const allKeys = [];
                    for (let i = 0; i < 1000; i++) {
                        try {
                            const key = GM_listValues()[i];
                            if (!key) break;
                            if (key.startsWith('processed_race_')) {
                                allKeys.push(key);
                            }
                        } catch (e) {
                            break;
                        }
                    }
                    const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
                    allKeys.forEach(key => {
                        const timestamp = GM_getValue(key, '0');
                        if (parseInt(timestamp) < weekAgo) {
                            GM_deleteValue(key);
                            console.log(`[RacerTracker] Cleaned up old race data: ${key}`);
                        }
                    });
                } else {
                    console.log(`[RacerTracker] Date appears to be same or earlier (${savedDate} -> ${dateKey}) — NOT resetting keys`);
                    GM_setValue('racer_tracker_date', dateKey);
                    ensureDailyUnlockFlag(dateKey);
                }
            }
        }

        const initialSolvedCount = readGMNumber(keyRacerPuzzles) || 0;
        syncDailyUnlockFlag(initialSolvedCount, dateKey);

        // If NOT racer-related, hide body until check
        if (isOtherPage && document.body) {
            document.documentElement.style.backgroundColor = '#fff';
            document.body.style.visibility = 'hidden';
            console.log("[RacerTracker] Hiding body until puzzle count check");
        }

        console.log(`[RacerTracker] Script started on: ${window.location.href}`);
        console.log(`[RacerTracker] Page classification:`);
        console.log(`[RacerTracker]   - isRacerRelated: ${isRacerRelated}`);
        console.log(`[RacerTracker]   - isAllowedRacerPage: ${isAllowedRacerPage}`);
        console.log(`[RacerTracker]   - isLichessUtilityPage: ${isLichessUtilityPage}`);
        console.log(`[RacerTracker]   - isAllowedLichessUtilityPage: ${isAllowedLichessUtilityPage}`);
        console.log(`[RacerTracker]   - isChessTempoAllowedPage: ${isChessTempoAllowedPage}`);
        console.log(`[RacerTracker]   - isChessPuzzlesAllowedPage: ${isChessPuzzlesAllowedPage}`);
        console.log(`[RacerTracker]   - isOtherPage: ${isOtherPage}`);
        console.log(`[RacerTracker]   - isRacerPage: ${isRacerPage}`);
        console.log(`[RacerTracker]   - trainingRedirectURL: ${trainingRedirectURL}`);
        console.log(`[RacerTracker]   - hostname: ${hostname}`);
        console.log(`[RacerTracker]   - pathname: ${pathname}`);

        // Create persistent progress window for racer pages
        function createPersistentProgressWindow() {
            if (document.getElementById('racer-progress-window')) return;
            
            const progressWindow = document.createElement('div');
            progressWindow.id = 'racer-progress-window';
            progressWindow.className = 'racer-progress-persistent';
            
            progressWindow.style.cssText = `
                position: fixed !important;
                top: 80px !important;
                right: 20px !important;
                background: rgba(51, 154, 240, 0.95) !important;
                color: white !important;
                padding: 15px 20px !important;
                border-radius: 8px !important;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3) !important;
                z-index: 2147483647 !important;
                font-family: Arial, sans-serif !important;
                font-size: 14px !important;
                min-width: 250px !important;
                border: 2px solid #1971c2 !important;
                display: block !important;
                visibility: visible !important;
                opacity: 1 !important;
                pointer-events: auto !important;
                transition: all 0.3s ease !important;
            `;
            
            progressWindow.innerHTML = `
                <div style="font-weight: bold; margin-bottom: 8px; color: white !important; border-bottom: 1px solid rgba(255,255,255,0.3); padding-bottom: 5px;">📊 Прогресс задач</div>
                <div id="progress-stats" style="color: white !important;">
                    <div>Решено: <strong id="solved-count">0</strong></div>
                    <div>Осталось: <strong id="remaining-count">${minTasksPerDay}</strong></div>
                    <div style="margin-top: 5px; font-size: 12px; opacity: 0.8;">Учитываются разрешенные сайты</div>
                </div>
            `;
            
            // Add close button (but it will be recreated on page load)
            const closeBtn = document.createElement('span');
            closeBtn.innerHTML = '×';
            closeBtn.style.cssText = `
                position: absolute !important;
                top: 5px !important;
                right: 10px !important;
                cursor: pointer !important;
                font-size: 18px !important;
                font-weight: bold !important;
                color: white !important;
            `;
            closeBtn.onclick = () => {
                progressWindow.style.opacity = '0';
                setTimeout(() => {
                    if (progressWindow.parentNode) {
                        progressWindow.parentNode.removeChild(progressWindow);
                    }
                }, 300);
            };
            progressWindow.appendChild(closeBtn);
            
            // Insert into DOM
            if (document.body) {
                document.body.appendChild(progressWindow);
                console.log('[RacerTracker] Persistent progress window created');
            } else {
                // If body not ready, wait for it
                setTimeout(() => {
                    if (document.body) {
                        document.body.appendChild(progressWindow);
                        console.log('[RacerTracker] Persistent progress window created (delayed)');
                    }
                }, 500);
            }
            
            return progressWindow;
        }

        // Update progress window with current counts
        function updateProgressWindow() {
            const progressWindow = document.getElementById('racer-progress-window');
            if (!progressWindow) {
                createPersistentProgressWindow();
                return;
            }
            
            const totalSolved = readGMNumber(keyRacerPuzzles) || 0;
            const remaining = Math.max(minTasksPerDay - totalSolved, 0);
            
            const solvedEl = progressWindow.querySelector('#solved-count');
            const remainingEl = progressWindow.querySelector('#remaining-count');
            
            if (solvedEl) solvedEl.textContent = totalSolved;
            if (remainingEl) {
                remainingEl.textContent = remaining;
                remainingEl.style.color = remaining > 0 ? '#ffeb3b' : '#4caf50';
            }
            
            // Update header based on goal completion
            const headerEl = progressWindow.querySelector('div');
            if (headerEl && remaining === 0) {
                headerEl.innerHTML = '🏆 Цель достигнута!';
                headerEl.style.background = '#4caf50';
                headerEl.style.padding = '5px';
                headerEl.style.borderRadius = '4px';
            }
            
            console.log(`[RacerTracker] Progress updated: ${totalSolved} solved, ${remaining} remaining`);
        }

        let progressWindowHeartbeatStarted = false;
        function ensureProgressWindowHeartbeat() {
            if (progressWindowHeartbeatStarted) return;
            progressWindowHeartbeatStarted = true;
            setInterval(updateProgressWindow, 2000);
        }

        // Check if we're in an actual race or viewing race results (not lobby)
        function isInActiveRace() {
            const isSpecificRaceUrl = window.location.pathname.startsWith('/racer/') && window.location.pathname !== '/racer/';
            const hasRaceUI = document.querySelector('.puz-side__solved, .puz-board, .racer__race__tracks');
            const hasLobbyButton = document.querySelector('[href="/racer"], .button[data-href="/racer"]');
            const hasPuzzleHistory = document.querySelector('.puz-history__rounds');
            
            // Consider it a race if we have race UI OR puzzle history (completed race)
            const inRace = isSpecificRaceUrl && (hasRaceUI || hasPuzzleHistory);
            console.log(`[RacerTracker] Race status check - URL: ${window.location.pathname}, hasRaceUI: ${!!hasRaceUI}, hasLobbyButton: ${!!hasLobbyButton}, hasPuzzleHistory: ${!!hasPuzzleHistory}, inRace: ${inRace}`);
            
            return inRace;
        }

        // Extract race puzzle results and add to daily count
        function extractRacePuzzleResults() {
            console.log("[RacerTracker] Extracting race puzzle results");
            
            // Check if this race has already been processed
            const raceId = window.location.pathname;
            const processedTime = GM_getValue(`processed_race_${raceId}`, null);
            if (processedTime) {
                console.log(`[RacerTracker] Race ${raceId} already processed at ${new Date(parseInt(processedTime))}`);
                return;
            }
            
            // Mark race as being processed IMMEDIATELY to prevent duplicate processing
            GM_setValue(`processed_race_${raceId}`, Date.now().toString());
            console.log(`[RacerTracker] Marked race ${raceId} as being processed`);
            
            const puzzleHistory = document.querySelector('.puz-history__rounds');
            if (!puzzleHistory) {
                console.log("[RacerTracker] No puzzle history found, checking for race completion indicators");
                // Check if we're on a completed race page with indicators
                const raceCompleted = document.querySelector('.racer__post') || 
                                    document.body.textContent.includes('Гонка завершена') ||
                                    document.body.textContent.includes('Race finished');
                if (raceCompleted) {
                    console.log("[RacerTracker] Race completed but no history found, assuming 1 puzzle completed");
                    addRacePuzzlesToDaily(1, raceId);
                }
                return;
            }
            
            const rounds = puzzleHistory.querySelectorAll('.puz-history__round');
            let correctlySolved = 0;
            
            console.log(`[RacerTracker] Found ${rounds.length} total puzzle rounds`);
            
            rounds.forEach((round, index) => {
                const goodElement = round.querySelector('good');
                if (goodElement) {
                    correctlySolved++;
                    const timeText = goodElement.textContent || '';
                    console.log(`[RacerTracker] Round ${index + 1}: Correctly solved (time: ${timeText})`);
                } else {
                    const badElement = round.querySelector('bad');
                    if (badElement) {
                        const timeText = badElement.textContent || '';
                        console.log(`[RacerTracker] Round ${index + 1}: Incorrectly solved (time: ${timeText})`);
                    }
                }
            });
            
            console.log(`[RacerTracker] Race results: ${correctlySolved} correctly solved out of ${rounds.length} total puzzles`);
            
            if (correctlySolved > 0) {
                addRacePuzzlesToDaily(correctlySolved, raceId);
            } else {
                console.log("[RacerTracker] No correctly solved puzzles in this race");
            }
        }

        function addSolvedPuzzlesToDaily(count, source = 'racer', context = {}) {
            console.log(`[RacerTracker] Adding ${count} puzzles from '${source}' to daily count`, context);
            
            const currentSolved = readGMNumber(keyRacerPuzzles) || 0;
            const newSolved = currentSolved + count;
            
            // Update aggregated puzzles count (shared key for compatibility)
            writeGMNumber(keyRacerPuzzles, newSolved);
            
            // Update daily count
            writeGMNumber(keyDailyCount, newSolved);
            
            // Update cache
            const newUnlockRemaining = Math.max(minTasksPerDay - newSolved, 0);
            writeGMNumber(keyCachedSolved, newSolved);
            writeGMNumber(keyCachedUnlock, newUnlockRemaining);
            
            console.log(`[RacerTracker] Updated counts - Daily: ${newSolved}, Remaining: ${newUnlockRemaining}`);
            
            publishSharedProgress(newSolved);
            syncDailyUnlockFlag(newSolved, dateKey);
            
            // Enhanced cross-script communication
            try {
                const event = new CustomEvent('lichessTrackerUpdate', {
                    detail: {
                        solved: newSolved,
                        courseId: COMPATIBILITY_ID,
                        date: dateKey,
                        key: keyDailyCount,
                        timestamp: Date.now(),
                        source
                    }
                });
                window.dispatchEvent(event);
                console.log(`[RacerTracker] Dispatched custom event with solved=${newSolved}`);
            } catch (e) {
                console.error(`[RacerTracker] Failed to dispatch custom event:`, e);
            }
            
            // Update progress window
            updateProgressWindow();
        }

        // Add race puzzles to daily count
        function addRacePuzzlesToDaily(racePuzzleCount, raceId = null) {
            addSolvedPuzzlesToDaily(racePuzzleCount, 'racer', { raceId });
        }

        // Setup race monitoring for active races
        function setupRaceMonitoring() {
            // Check if this race has already been processed
            const raceId = window.location.pathname;
            const processedTime = GM_getValue(`processed_race_${raceId}`, null);
            if (processedTime) {
                console.log(`[RacerTracker] Race ${raceId} already processed, skipping monitoring`);
                return;
            }
            
            // Add a processing lock to prevent multiple simultaneous processing
            const processingLockKey = `processing_lock_${raceId}`;
            if (GM_getValue(processingLockKey, null)) {
                console.log(`[RacerTracker] Race ${raceId} is currently being processed, skipping`);
                return;
            }
            
            let raceCompleted = false;
            let raceCheckInterval = null;
            let resultsProcessed = false;
            
            function checkForRaceCompletion() {
                if (raceCompleted && resultsProcessed) return;
                if (!isInActiveRace()) return;
                
                // Double-check if race was processed while this function was running
                const processedTime = GM_getValue(`processed_race_${raceId}`, null);
                if (processedTime) {
                    console.log(`[RacerTracker] Race ${raceId} was processed by another instance, stopping`);
                    resultsProcessed = true;
                    if (raceCheckInterval) {
                        clearInterval(raceCheckInterval);
                        raceCheckInterval = null;
                    }
                    return;
                }
                
                // Check if we already have puzzle history visible (completed race)
                const puzzleHistory = document.querySelector('.puz-history__rounds');
                if (puzzleHistory && !resultsProcessed) {
                    console.log("[RacerTracker] Puzzle history found, processing results immediately");
                    resultsProcessed = true;
                    
                    // Set processing lock
                    GM_setValue(processingLockKey, Date.now().toString());
                    
                    extractRacePuzzleResults();
                    
                    // Clear processing lock
                    GM_deleteValue(processingLockKey);
                    
                    if (raceCheckInterval) {
                        clearInterval(raceCheckInterval);
                        raceCheckInterval = null;
                    }
                    return;
                }
                
                // Check for race completion indicators
                const h2Elements = document.querySelectorAll('h2');
                let foundRaceEnd = false;
                
                for (const h2 of h2Elements) {
                    if (h2.textContent && (h2.textContent.includes('Гонка завершена') || h2.textContent.includes('Сыгранные задачи'))) {
                        foundRaceEnd = true;
                        console.log("[RacerTracker] Race completion detected via h2 text!");
                        break;
                    }
                }
                
                if (!foundRaceEnd) {
                    const bodyText = document.body.textContent || '';
                    if (bodyText.includes('Гонка завершена') || 
                        bodyText.includes('Race finished') ||
                        bodyText.includes('Следующая гонка') ||
                        bodyText.includes('Сыгранные задачи')) {
                        foundRaceEnd = true;
                        console.log("[RacerTracker] Race completion detected via general text search!");
                    }
                }
                
                if (!foundRaceEnd) {
                    const racerPost = document.querySelector('.racer__post');
                    if (racerPost) {
                        foundRaceEnd = true;
                        console.log("[RacerTracker] Race completion detected via racer post section!");
                    }
                }
                
                if (foundRaceEnd && !raceCompleted) {
                    raceCompleted = true;
                    console.log("[RacerTracker] Processing race completion...");
                    
                    setTimeout(() => {
                        if (!resultsProcessed) {
                            // Set processing lock
                            GM_setValue(processingLockKey, Date.now().toString());
                            
                            extractRacePuzzleResults();
                            resultsProcessed = true;
                            
                            // Clear processing lock
                            GM_deleteValue(processingLockKey);
                        }
                    }, 1000);
                    
                    if (raceCheckInterval) {
                        clearInterval(raceCheckInterval);
                        raceCheckInterval = null;
                    }
                }
            }
            
            // Check immediately in case we're already on a completed race page
            checkForRaceCompletion();
            
            // Start monitoring
            raceCheckInterval = setInterval(checkForRaceCompletion, 1000);
            
            const observer = new MutationObserver((mutations) => {
                if (resultsProcessed) return; // Don't continue monitoring if already processed
                mutations.forEach((mutation) => {
                    if (mutation.type === 'childList') {
                        checkForRaceCompletion();
                    }
                });
            });
            
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
            
            console.log("[RacerTracker] Race monitoring active");
        }

        // ===============================
        // === ChessTempo Tracking ===
        // ===============================
        let chessTempoPuzzleKey = null;
        let chessTempoPuzzleCounted = false;
        let chessTempoKeyInterval = null;
        let chessTempoSolveObserver = null;
        let chessTempoTrackingStarted = false;
        let chessTempoNextInterval = null;
        let chessTempoNextAttempts = 0;
        let chessTempoNextKey = null;
        let chessTempoLastClickTs = 0;
        let chessTempoAutoStartInterval = null;

        function applyChessTempoTopMenuHiding() {
            GM_addStyle(`
                body > header, body > nav, .ct-appbar, .ct-top-nav, .ct-top-menu, .ct-main-toolbar, .ct-nav-bar, .ct-navbar, body > .ct-toolbar, body > .mat-toolbar {
                    display: none !important;
                }
                body {
                    padding-top: 0 !important;
                }
            `);
        }

        function getChessTempoPuzzleKey() {
            const dataEl = document.querySelector('[data-problem-id], [data-puzzle-id], [data-problemid]');
            if (dataEl) {
                const candidate = dataEl.getAttribute('data-problem-id') || dataEl.getAttribute('data-puzzle-id') || dataEl.getAttribute('data-problemid');
                if (candidate) return `id:${candidate}`;
            }
            const idFromUrl = window.location.pathname + window.location.search + window.location.hash;
            return `url:${idFromUrl}`;
        }

        function refreshChessTempoPuzzleKey() {
            const newKey = getChessTempoPuzzleKey();
            if (newKey !== chessTempoPuzzleKey) {
                chessTempoPuzzleKey = newKey;
                chessTempoPuzzleCounted = false;
                console.log(`[RacerTracker] ChessTempo puzzle context updated: ${chessTempoPuzzleKey}`);
            }
        }

        function checkChessTempoSolved() {
            refreshChessTempoPuzzleKey();
            const solvedElement = document.querySelector('.ct-problem-result-output.ct-correct, .ct-problem-result.ct-correct, .ct-problem-result .ct-correct, problem-result .ct-correct');
            if (solvedElement && !chessTempoPuzzleCounted) {
                chessTempoPuzzleCounted = true;
                addSolvedPuzzlesToDaily(1, 'chesstempo', { puzzleKey: chessTempoPuzzleKey });
                console.log('[RacerTracker] ChessTempo puzzle marked as solved');
                // Try to advance in-place via Next button flow
                startChessTempoNextLoop();
            } else if (!solvedElement && chessTempoPuzzleCounted) {
                // New puzzle likely loaded, allow next detection
                chessTempoPuzzleCounted = false;
            }
        }

        function setupChessTempoTracking() {
            if (chessTempoTrackingStarted) return;
            chessTempoTrackingStarted = true;

            refreshChessTempoPuzzleKey();
            checkChessTempoSolved();

            chessTempoSolveObserver = new MutationObserver(() => checkChessTempoSolved());
            chessTempoSolveObserver.observe(document.body, { childList: true, subtree: true });
            chessTempoKeyInterval = setInterval(refreshChessTempoPuzzleKey, 1000);
            ensureChessTempoAutoStartLoop();

            console.log('[RacerTracker] ChessTempo tracking active');
        }

        function clickWithEvents(el) {
            if (!el) return false;
            try {
                const rect = el.getBoundingClientRect();
                const cx = rect.left + rect.width / 2;
                const cy = rect.top + rect.height / 2;
                const pointerOpts = { bubbles: true, cancelable: true, composed: true, view: window, clientX: cx, clientY: cy, pointerId: 1, pointerType: 'mouse', buttons: 1 };
                const mouseOpts = { bubbles: true, cancelable: true, composed: true, view: window, clientX: cx, clientY: cy, button: 0, buttons: 1 };
                try {
                    if (el.scrollIntoView) el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
                } catch (_) {}
                try {
                    const touchObj = new Touch({
                        identifier: Date.now(),
                        target: el,
                        clientX: cx,
                        clientY: cy,
                        radiusX: 2,
                        radiusY: 2,
                        rotationAngle: 0,
                        force: 0.5
                    });
                    const touchEvent = (type) => el.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, composed: true, touches: [touchObj], targetTouches: [touchObj], changedTouches: [touchObj] }));
                    touchEvent('touchstart');
                    touchEvent('touchend');
                } catch (_) {}
                if (el.focus) {
                    try { el.focus({ preventScroll: true }); } catch (_) { el.focus(); }
                }
                ['pointerdown', 'mousedown'].forEach(type => {
                    el.dispatchEvent(new PointerEvent(type, pointerOpts));
                    el.dispatchEvent(new MouseEvent(type, mouseOpts));
                });
                ['pointerup', 'mouseup', 'click'].forEach(type => {
                    el.dispatchEvent(new PointerEvent(type, pointerOpts));
                    el.dispatchEvent(new MouseEvent(type, mouseOpts));
                });
                el.dispatchEvent(new MouseEvent('dblclick', mouseOpts));
                ['keydown', 'keypress', 'keyup'].forEach(type => {
                    el.dispatchEvent(new KeyboardEvent(type, { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter' }));
                    el.dispatchEvent(new KeyboardEvent(type, { bubbles: true, cancelable: true, key: ' ', code: 'Space' }));
                });
                el.dispatchEvent(new Event('tap', { bubbles: true, cancelable: true }));
                el.dispatchEvent(new Event('action', { bubbles: true, cancelable: true }));
                if (typeof el.click === 'function') el.click();
                return true;
            } catch (e) {
                try {
                    el.click();
                    return true;
                } catch (err) {
                    console.log('[RacerTracker] Failed to click element', err);
                    return false;
                }
            }
        }

        function forceEnableElement(el) {
            if (!el) return;
            try { el.removeAttribute('disabled'); } catch (_) {}
            try { el.removeAttribute('aria-disabled'); } catch (_) {}
            try { el.classList && el.classList.remove('ct-hidden'); } catch (_) {}
            try { el.style && (el.style.pointerEvents = 'auto'); } catch (_) {}
            try { el.style && (el.style.visibility = ''); } catch (_) {}
            try { el.style && (el.style.display = ''); } catch (_) {}
        }

        // Minimal click helper for CT "Next" buttons to avoid double-actions like opening dropdowns
        function clickSimple(el) {
            if (!el) return false;
            try {
                forceEnableElement(el);
                try { el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }); } catch (_) {}
                try { el.focus({ preventScroll: true }); } catch (_) {}
                el.click();
                return true;
            } catch (_) {}
            try {
                const rect = el.getBoundingClientRect();
                const cx = rect.left + rect.width / 2;
                const cy = rect.top + rect.height / 2;
                try { el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }); } catch (_) {}
                el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: cx, clientY: cy, button: 0 }));
                return true;
            } catch (_) {}
            return false;
        }

        function clickAtCenter(el) {
            if (!el) return false;
            try {
                const rect = el.getBoundingClientRect();
                if (!rect || !rect.width || !rect.height) return false;
                const cx = rect.left + rect.width / 2;
                const cy = rect.top + rect.height / 2;
                const target = document.elementFromPoint(cx, cy) || el;
                try { el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }); } catch (_) {}
                try { el.focus({ preventScroll: true }); } catch (_) {}
                return clickWithEvents(target);
            } catch (_) {
                return false;
            }
        }

        function isVisibleButton(el) {
            if (!el) return false;
            const style = window.getComputedStyle(el);
            const opacity = parseFloat(style.opacity || '1');
            if (style.display === 'none' || style.visibility === 'hidden' || opacity < 0.05) return false;
            if (el.classList && el.classList.contains('ct-hidden')) return false;
            const hasBox = el.offsetParent !== null || style.position === 'fixed' || style.display === 'contents';
            if (!hasBox) return false;
            if ((style.pointerEvents || '').toLowerCase() === 'none') return false;
            return true;
        }

        function collectShadowCandidates(root = document, acc = []) {
            if (!root) return acc;
            const nodes = root.querySelectorAll('*');
            nodes.forEach(node => {
                acc.push(node);
                if (node.shadowRoot) collectShadowCandidates(node.shadowRoot, acc);
            });
            return acc;
        }

        function textLooksLikeNext(rawText) {
            if (!rawText) return false;
            const text = rawText.trim().toLowerCase().replace(/\s+/g, ' ');
            if (!text) return false;
            const patterns = [
                /следующ/,         // Russian: следующий/следующая
                /\bдалее\b/,       // Russian: далее
                /\bnext\b/,        // English: next
                /\bnext (problem|puzzle|task|exercise)\b/,
                /\bcontinue\b/,    // fallback wording some UIs use
            ];
            return patterns.some(re => re.test(text));
        }

        function attrsLookLikeNext(node) {
            if (!node || !node.getAttribute) return false;
            const attrNames = ['data-cy', 'data-qa', 'aria-label', 'title', 'data-testid', 'data-id', 'data-action'];
            for (const name of attrNames) {
                const val = node.getAttribute(name);
                if (val && textLooksLikeNext(val)) return true;
            }
            return false;
        }

        function isChessTempoModalOpen() {
            return !!document.querySelector('.mdc-dialog--open, .cdk-overlay-container, .ct-dialog, .mat-dialog-container');
        }

        function textLooksLikeStart(rawText) {
            if (!rawText) return false;
            const text = rawText.trim().toLowerCase().replace(/\s+/g, ' ');
            if (!text) return false;
            const patterns = [
                /начать/,
                /старт/,
                /продолж/,
                /трениров/,
                /решать/,
                /решение/,
                /реши зада/,
                /новую зада/,
                /\bstart\b/,
                /\bbegin\b/,
                /\bresume\b/,
                /\bcontinue\b/,
                /\bplay\b/,
                /\bsolve\b/,
                /\btrain\b/,
                /\bgo\b/
            ];
            return patterns.some(re => re.test(text));
        }

        function attrsLookLikeStart(node) {
            if (!node || !node.getAttribute) return false;
            const attrNames = ['aria-label', 'title', 'data-qa', 'data-cy', 'data-testid'];
            return attrNames.some(name => textLooksLikeStart(node.getAttribute(name)));
        }

        function findStartButtons(root = document) {
            const nodes = collectShadowCandidates(root);
            const matches = [];
            nodes.forEach(node => {
                if (!node || !node.tagName) return;
                const tag = node.tagName.toLowerCase();
                const role = node.getAttribute && node.getAttribute('role');
                const isButtonLike = tag === 'button' || tag === 'ct-button' || tag === 'a' || role === 'button';
                if (!isButtonLike) return;
                const textMatch = textLooksLikeStart(node.textContent || '');
                const attrMatch = attrsLookLikeStart(node);
                if ((textMatch || attrMatch) && isVisibleButton(node)) {
                    matches.push(node);
                }
            });
            return matches;
        }

        function clickChessTempoStartButton(reason = 'auto-start') {
            const containers = [];
            const modal = document.querySelector('.mdc-dialog--open, .ct-dialog, .mat-dialog-container, .cdk-overlay-container .ct-dialog');
            if (modal) containers.push(modal);
            containers.push(document);

            for (const container of containers) {
                const candidates = findStartButtons(container);
                if (!candidates.length) continue;

                if (DEBUG_CHESSTEMPO_NEXT_LOGS) {
                    nextLog(`Start/resume candidates (${reason}):`, candidates.map(descEl));
                }

                for (const target of candidates) {
                    if (!target) continue;
                    let clicked = false;
                    if (!clicked) clicked = clickSimple(target);
                    if (!clicked) clicked = clickAtCenter(target);
                    if (!clicked) clicked = clickWithEvents(target);
                    if (clicked) {
                        nextLog(`Start/resume click (${reason}) on`, descEl(target));
                        return true;
                    }
                }
            }
            return false;
        }

        function findLabelBasedCandidates(root = document) {
            const nodes = collectShadowCandidates(root);
            const matches = [];
            nodes.forEach(node => {
                const text = (node.textContent || '').trim().toLowerCase();
                if (!text) return;
                if (textLooksLikeNext(text)) {
                    matches.push(node);
                }
            });
            return matches;
        }

        function findTextNextButtons(root = document) {
            const nodes = collectShadowCandidates(root);
            return nodes.filter(node => {
                if (!node.tagName) return false;
                const tag = node.tagName.toLowerCase();
                if (!['button', 'ct-button', 'a', 'div', 'span'].includes(tag)) return false;
                const text = (node.textContent || '').toLowerCase();
                if (!text) return false;
                return textLooksLikeNext(text);
            });
        }

        function getClickableAncestors(node) {
            const chain = [];
            let current = node;
            while (current && current !== document && chain.length < 10) {
                chain.push(current);
                if (current.shadowRoot && current.shadowRoot.host) chain.push(current.shadowRoot.host);
                current = current.parentNode || current.host;
            }
            return chain;
        }

        function hasNextButtonAncestor(node) {
            let current = node;
            for (let depth = 0; depth < 15 && current; depth++) {
                if (current.classList && current.classList.contains('ct-tactics-next-button')) return true;
                current = current.parentNode || current.host;
            }
            return false;
        }

        function getActionsContainer() {
            return document.querySelector('.ct-problems-actions-buttons') || document.body || document;
        }

        function isVisibleCandidate(node) {
            if (!node) return false;
            const style = window.getComputedStyle(node);
            if (!style) return false;
            const visible = style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity || '1') > 0.05;
            const hiddenClass = node.classList && node.classList.contains('ct-hidden');
            return visible && !hiddenClass;
        }

        function findDeepNextButtons(container) {
            const result = [];
            if (!container) return result;
            const nodes = collectShadowCandidates(container);
            nodes.forEach(node => {
                if (!node.tagName) return;
                const tag = node.tagName.toLowerCase();
                if (tag !== 'button' && tag !== 'ct-button') return;
                const text = (node.textContent || '').trim().toLowerCase();
                if (!text.includes('следующий')) return;
                if (!isVisibleCandidate(node)) return;
                result.push(node);
            });
            return result;
        }

        function getActionableNextTargets() {
            const container = getActionsContainer();
            if (!container) return [];
            // prioritize explicit IDs first
            const explicitNodes = [
                container.querySelector('#ct-69'),
                container.querySelector('#ct-68')
            ].filter(Boolean);

            const nodes = Array.from(container.querySelectorAll(`
                ct-button.ct-tactics-next-button:not(.ct-hidden),
                ct-button.ct-tactics-next-button:not(.ct-hidden) button,
                .ct-tactics-next-button:not(.ct-hidden),
                .ct-tactics-next-button:not(.ct-hidden) button
            `.replace(/\s+/g, ' ')));

            // also traverse shadow DOM for buttons marked as next
            const shadowCandidates = collectShadowCandidates(container).filter(node => {
                if (!node.tagName) return false;
                const tag = node.tagName.toLowerCase();
                const cls = node.classList ? Array.from(node.classList) : [];
                const id = node.id || '';
                if (cls.some(c => c.includes('ct-tactics-next-button'))) return true;
                if (id === 'ct-68' || id === 'ct-69') return true;
                const text = (node.textContent || '').toLowerCase();
                return text && textLooksLikeNext(text);
            });

            const targets = [];
            const considerNode = (node) => {
                if (!node) return;
                const style = window.getComputedStyle(node);
                const visible = style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity || '1') > 0.05;
                if (!visible) return;
                const innerButton = node.tagName.toLowerCase() === 'button' ? node : (node.querySelector && node.querySelector('button')) || null;
                const outer = node.tagName.toLowerCase() === 'ct-button' ? node : null;
                // Click outer custom element first, then inner <button>
                [outer || null, innerButton].forEach(candidate => {
                    if (!candidate) return;
                    forceEnableElement(candidate);
                    targets.push(candidate);
                });
            };

            explicitNodes.forEach(considerNode);
            nodes.forEach(considerNode);
            shadowCandidates.forEach(considerNode);

            // As a fallback, try buttons that literally have label "Следующий"
            if (!targets.length) {
                findDeepNextButtons(container).forEach(btn => targets.push(btn));
            }

            if (DEBUG_CHESSTEMPO_NEXT_LOGS) {
                nextLog('CT next buttons found:', {
                    rawCandidates: nodes.length + explicitNodes.length,
                    filtered: targets.map(descEl)
                });
            }

            // Prefer the first visible candidate only to avoid hitting hidden duplicates
            if (targets.length > 1) {
                return [targets[0]];
            }

            return targets;
        }

        function dispatchKeyboardNext() {
            const keys = ['ArrowRight', 'Enter', ' '];
            keys.forEach(key => {
                try {
                    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, code: key }));
                    window.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key, code: key }));
                } catch (_) {}
                try {
                    document.body && document.body.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, code: key }));
                    document.body && document.body.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key, code: key }));
                } catch (_) {}
            });
        }

        function getChessTempoNextUrl() {
            const container = getActionsContainer();
            const btn = container && (
                container.querySelector('.ct-problem-action-button.ct-tactics-next-button') ||
                container.querySelector('button[data-cy*="next"]') ||
                container.querySelector('button[data-qa*="next"]') ||
                container.querySelector('button[aria-label*="Next"]') ||
                container.querySelector('button[aria-label*="След"]') ||
                getActionableNextTargets()[0]
            );
            if (!btn) return null;

            // Direct links inside the button (if any)
            const linkEl = btn.querySelector('a[href]');
            if (linkEl && linkEl.href) return linkEl.href;

            // Attributes sometimes used by routers/frameworks
            const attrNames = ['href', 'data-href', 'routerlink', 'routerLink', 'ng-reflect-router-link', 'ng-reflect-href'];
            for (const name of attrNames) {
                const val = btn.getAttribute && btn.getAttribute(name);
                if (val) {
                    try {
                        return new URL(val, window.location.href).href;
                    } catch (_) {
                        // ignore malformed
                    }
                }
            }
            return null;
        }

        let chessTempoNavigationForced = false;
        function forceNavigateToNextPuzzle(reason = 'fallback') {
            if (chessTempoNavigationForced) return;
            chessTempoNavigationForced = true;
            try {
                const target = `${chessTempoTacticsURL}?auto=1&reason=${encodeURIComponent(reason)}&ts=${Date.now()}`;
                console.warn(`[RacerTracker] ChessTempo force navigation: ${target}`);
                window.location.href = target;
            } catch (e) {
                console.log('[RacerTracker] Failed to force navigation', e);
            }
        }

        function navigateToChessTempoLobby(reason = 'solved') {
            if (chessTempoNavigationForced) return;
            chessTempoNavigationForced = true;
            const target = `${chessTempoTacticsURL}?auto=1&reason=${encodeURIComponent(reason)}&ts=${Date.now()}`;
            nextLog('Navigating to lobby', target);
            try {
                window.location.href = target;
            } catch (e) {
                forceNavigateToNextPuzzle(`${reason}-fallback`);
            }
        }

        function clickChessTempoNextButton() {
            if (isChessTempoModalOpen()) {
                if (clickChessTempoStartButton('modal-open')) {
                    return true;
                }
                nextLog('Modal open - skip auto-next');
                return false;
            }

            const container = getActionsContainer();
            const selectors = [
                '.ct-problem-action-button.ct-tactics-next-button:not(.ct-hidden) button',
                '.ct-problem-action-button.ct-tactics-next-button:not(.ct-hidden)',
                'button.ct-tactics-next-button:not(.ct-hidden)'
            ];

            const candidates = new Set();
            getActionableNextTargets().forEach(n => candidates.add(n));
            selectors.forEach(sel => {
                Array.from(container.querySelectorAll(sel)).forEach(n => candidates.add(n));
            });
            // include shadow DOM traversal results explicitly
            collectShadowCandidates(container).forEach(n => {
                if (!n || !n.tagName) return;
                const tag = n.tagName.toLowerCase();
                const cls = n.classList ? Array.from(n.classList) : [];
                if (cls.some(c => c.includes('ct-tactics-next-button'))) candidates.add(n);
                if (tag === 'button' && textLooksLikeNext(n.textContent || '')) candidates.add(n);
                if (n.id === 'ct-68' || n.id === 'ct-69') candidates.add(n);
            });

            if (!candidates.size) {
                const startClicked = clickChessTempoStartButton('no-next-button');
                if (startClicked) return true;
            }

            if (DEBUG_CHESSTEMPO_NEXT_LOGS) {
                nextLog('Candidate set:', Array.from(candidates).map(descEl));
            }

            let clickedAny = false;
            const clickHostAndInner = (node) => {
                if (!node) return false;
                const inner = node.querySelector ? node.querySelector('button') : null;
                let local = false;
                // Click host first
                [node, inner].forEach(target => {
                    if (!target) return;
                    if (clickWithEvents(target)) { local = true; return; }
                    if (clickSimple(target)) { local = true; return; }
                    if (clickAtCenter(target)) { local = true; return; }
                });
                if (!local) {
                    dispatchKeyboardNext();
                    local = true;
                }
                return local;
            };

            const tryAllClickVariants = (target) => {
                let localClicked = false;
                // Fire the richest event set first (covers touch/mouse)
                if (!localClicked) localClicked = clickWithEvents(target);
                // Then a simple click
                if (!localClicked) localClicked = clickSimple(target);
                // Then a center-based click
                if (!localClicked) localClicked = clickAtCenter(target);
                // Finally keyboard-based next
                if (!localClicked) {
                    dispatchKeyboardNext();
                    localClicked = true; // we did dispatch something meaningful
                }
                return localClicked;
            };

            for (const target of candidates) {
                if (!target) continue;
                const clicked = clickHostAndInner(target) || tryAllClickVariants(target);
                if (clicked) {
                    clickedAny = true;
                    nextLog('Click dispatched on', descEl(target));
                }
            }

            if (clickedAny) return true;
            if (clickChessTempoStartButton('fallback')) return true;

            nextWarn('No next button clicked');
            return false;
        }

        function waitAndClickChessTempoNext(maxWaitMs = 6000) {
            const container = getActionsContainer();
            if (!container) return;

            let done = false;
            const stopAll = () => {
                done = true;
                if (observer) observer.disconnect();
                if (timer) clearInterval(timer);
                if (timeout) clearTimeout(timeout);
            };

            const tryClick = () => {
                if (done) return;
                if (clickChessTempoNextButton()) {
                    stopAll();
                }
            };

            const observer = new MutationObserver(() => tryClick());
            observer.observe(container, { childList: true, subtree: true, attributes: true });

            const timer = setInterval(tryClick, 300);
            const timeout = setTimeout(stopAll, maxWaitMs);

            tryClick();
        }

        function stopChessTempoNextLoop() {
            if (chessTempoNextInterval) {
                clearInterval(chessTempoNextInterval);
                chessTempoNextInterval = null;
            }
            chessTempoNextAttempts = 0;
            chessTempoNextKey = null;
        }

        function startChessTempoNextLoop(delayMs = 800) {
            stopChessTempoNextLoop();
            chessTempoNextKey = chessTempoPuzzleKey;

            const hasAdvancedToNextPuzzle = () => chessTempoPuzzleKey !== chessTempoNextKey;

            setTimeout(() => {
                if (hasAdvancedToNextPuzzle()) {
                    stopChessTempoNextLoop();
                    return;
                }

                chessTempoNextAttempts = 0;
                const maxAttempts = 10;

                chessTempoNextInterval = setInterval(() => {
                    chessTempoNextAttempts++;

                    // refresh key to detect navigation
                    refreshChessTempoPuzzleKey();

                    if (hasAdvancedToNextPuzzle()) {
                        stopChessTempoNextLoop();
                        return;
                    }

                    if (Date.now() - chessTempoLastClickTs < 400) {
                        return;
                    }

                    const clicked = clickChessTempoNextButton();
                    if (clicked) {
                        stopChessTempoNextLoop();
                        chessTempoLastClickTs = Date.now();
                        // If click didn't change puzzle shortly, force navigation
                        setTimeout(() => {
                            refreshChessTempoPuzzleKey();
                            if (!hasAdvancedToNextPuzzle()) {
                                const directUrl = getChessTempoNextUrl();
                                if (directUrl && !chessTempoNavigationForced) {
                                    nextLog('Post-click direct href navigation to', directUrl);
                                    try {
                                        window.location.href = directUrl;
                                        chessTempoNavigationForced = true;
                                    } catch (e) {
                                        forceNavigateToNextPuzzle('post-click-href');
                                    }
                                } else {
                                    forceNavigateToNextPuzzle('post-click');
                                }
                            }
                        }, 600);
                        if (chessTempoNextAttempts === 1 || chessTempoNextAttempts % 3 === 0) {
                            console.log(`[RacerTracker] ChessTempo next attempt #${chessTempoNextAttempts} dispatched for ${chessTempoNextKey}`);
                        }
                        return;
                    }

                    // Try direct href navigation after a few failed attempts
                    if (chessTempoNextAttempts >= 3) {
                        const directUrl = getChessTempoNextUrl();
                        if (directUrl) {
                            nextLog('Direct href navigation to', directUrl);
                            stopChessTempoNextLoop();
                            try {
                                window.location.href = directUrl;
                                chessTempoNavigationForced = true;
                            } catch (e) {
                                forceNavigateToNextPuzzle('href-fallback');
                            }
                            return;
                        }
                    }

                    if (chessTempoNextAttempts >= maxAttempts) {
                        console.warn('[RacerTracker] ChessTempo next attempts exhausted without navigation; forcing lobby navigation');
                        forceNavigateToNextPuzzle('exhausted');
                        stopChessTempoNextLoop();
                    }
                }, 350);
            }, delayMs);
        }

        function ensureChessTempoAutoStartLoop() {
            if (chessTempoAutoStartInterval) return;
            chessTempoAutoStartInterval = setInterval(() => {
                const hasProblemId = !!document.querySelector('[data-problem-id], [data-puzzle-id], [data-problemid]');
                const hasBoard = !!document.querySelector('.ct-problem-board, .ct-board, chess-board, .ct-problem');
                if (hasProblemId || hasBoard) return;
                clickChessTempoStartButton('auto-start-loop');
            }, 1200);
        }

        // Main logic
        
        // For non-whitelisted pages: check puzzle count and redirect if needed
        if (isOtherPage) {
            console.log("[RacerTracker] Processing non-training page");
            
            const totalPuzzles = readGMNumber(keyRacerPuzzles) || 0;
            const unlockRemaining = Math.max(minTasksPerDay - totalPuzzles, 0);
            syncDailyUnlockFlag(totalPuzzles, dateKey);
            const unlockGranted = isDailyUnlockGrantedForDate(dateKey);
            
            // Update GM storage
            writeGMNumber(keyDailyCount, totalPuzzles);
            writeGMNumber(keyCachedSolved, totalPuzzles);
            writeGMNumber(keyCachedUnlock, unlockRemaining);
            publishSharedProgress(totalPuzzles);
            
            console.log(`[RacerTracker] Current progress - Puzzles solved: ${totalPuzzles}, Remaining: ${unlockRemaining}`);
            
            if (!unlockGranted) {
                console.log(`[RacerTracker] Unlock flag inactive (remaining ${unlockRemaining}) - Redirecting to training page`);
                window.location.replace(trainingRedirectURL);
            } else {
                if (unlockRemaining > 0) {
                    console.warn(`[RacerTracker] Unlock flag active but ${unlockRemaining} puzzles still recorded - allowing page but please verify counts`);
                }
                console.log("[RacerTracker] Daily puzzle goal met (unlock flag active), showing page");
                if (document.body) document.body.style.visibility = '';
            }
            return;
        }
        
        // For racer-related pages: allow access and setup features
        if (isAllowedRacerPage) {
            console.log("[RacerTracker] On racer-related page, allowing access");
            
            // Always show racer-related pages
            if (document.body) document.body.style.visibility = '';

            publishSharedProgress(readGMNumber(keyRacerPuzzles) || 0);
            
            // Create persistent progress window
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => {
                    createPersistentProgressWindow();
                    updateProgressWindow();
                    ensureProgressWindowHeartbeat();
                });
            } else {
                createPersistentProgressWindow();
                updateProgressWindow();
                ensureProgressWindowHeartbeat();
            }
            
            // Setup race monitoring if on specific race page
            if (isRacerPage && !isRacerLobby) {
                console.log(`[RacerTracker] Setting up race monitoring on URL: ${window.location.href}`);
                
                setTimeout(() => {
                    setupRaceMonitoring();
                }, 1000);
            }
        }

        if (isChessTempoAllowedPage) {
            console.log('[RacerTracker] On ChessTempo tactics page, allowing access');
            if (document.body) document.body.style.visibility = '';

            applyChessTempoTopMenuHiding();

            const totalPuzzles = readGMNumber(keyRacerPuzzles) || 0;
            const unlockRemaining = Math.max(minTasksPerDay - totalPuzzles, 0);
            writeGMNumber(keyDailyCount, totalPuzzles);
            writeGMNumber(keyCachedSolved, totalPuzzles);
            writeGMNumber(keyCachedUnlock, unlockRemaining);
            publishSharedProgress(totalPuzzles);

            const ensureUI = () => {
                createPersistentProgressWindow();
                updateProgressWindow();
                ensureProgressWindowHeartbeat();
                setupChessTempoTracking();
            };
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', ensureUI);
            } else {
                ensureUI();
            }
        }

        // For Lichess utility pages: allow access and update GM storage
        if (isAllowedLichessUtilityPage) {
            console.log("[RacerTracker] On Lichess utility page, allowing access");
            const unlockGranted = isDailyUnlockGrantedForDate(dateKey);
            if (!unlockGranted) {
                console.log('[RacerTracker] Utility page blocked - unlock flag inactive');
                window.location.replace(trainingRedirectURL);
                return;
            }

            if (document.body) document.body.style.visibility = '';

            const racerPuzzles = readGMNumber(keyRacerPuzzles) || 0;
            writeGMNumber(keyDailyCount, racerPuzzles);
            publishSharedProgress(racerPuzzles);
            
            console.log(`[RacerTracker] Updated GM storage for utility page: ${racerPuzzles} puzzles`);
        }

        if (isChessPuzzlesAllowedPage) {
            console.log("[RacerTracker] Chess.com puzzles mode enabled — allowing puzzles section");
            
            if (document.body) document.body.style.visibility = '';
            
            const racerPuzzles = readGMNumber(keyRacerPuzzles) || 0;
            const unlockRemaining = Math.max(minTasksPerDay - racerPuzzles, 0);
            writeGMNumber(keyDailyCount, racerPuzzles);
            writeGMNumber(keyCachedSolved, racerPuzzles);
            writeGMNumber(keyCachedUnlock, unlockRemaining);
            publishSharedProgress(racerPuzzles);
            
            console.log(`[RacerTracker] Synced GM storage for Chess.com puzzles page: ${racerPuzzles} puzzles`);
        }

        // Make global debug functions available
        window.racerDebugTracker = {
            addTestPuzzles: (count = 1) => {
                console.log(`[RacerTracker] Adding ${count} test puzzles`);
                addRacePuzzlesToDaily(count);
            },
            getRacerData: () => {
                const racer = readGMNumber(keyRacerPuzzles) || 0;
                const daily = readGMNumber(keyDailyCount) || 0;
                const remaining = readGMNumber(keyCachedUnlock) || minTasksPerDay;
                console.log(`Racer Data - Racer: ${racer}, Daily: ${daily}, Remaining: ${remaining}`);
                return { racer, daily, remaining };
            },
            updateProgress: () => {
                console.log(`[RacerTracker] Manual progress update`);
                updateProgressWindow();
            },
            resetProgress: () => {
                console.log(`[RacerTracker] Resetting daily progress`);
                writeGMNumber(keyRacerPuzzles, 0);
                writeGMNumber(keyDailyCount, 0);
                writeGMNumber(keyCachedSolved, 0);
                writeGMNumber(keyCachedUnlock, minTasksPerDay);
                publishSharedProgress(0);
                setDailyUnlockFlag(dateKey, false);
                updateProgressWindow();
            },
            clearProcessedRaces: () => {
                console.log(`[RacerTracker] Clearing all processed race data`);
                const allKeys = [];
                try {
                    const keys = GM_listValues();
                    for (let i = 0; i < keys.length; i++) {
                        if (keys[i].startsWith('processed_race_') || keys[i].startsWith('processing_lock_')) {
                            allKeys.push(keys[i]);
                        }
                    }
                } catch (e) {
                    console.log('GM_listValues not available, using manual cleanup');
                }
                allKeys.forEach(key => {
                    GM_deleteValue(key);
                    console.log(`[RacerTracker] Deleted: ${key}`);
                });
                console.log(`[RacerTracker] Cleared ${allKeys.length} processed race entries`);
            },
            getProcessedRaces: () => {
                const races = [];
                const locks = [];
                try {
                    const keys = GM_listValues();
                    for (let i = 0; i < keys.length; i++) {
                        if (keys[i].startsWith('processed_race_')) {
                            const timestamp = GM_getValue(keys[i], '0');
                            races.push({
                                raceId: keys[i].replace('processed_race_', ''),
                                processedAt: new Date(parseInt(timestamp))
                            });
                        } else if (keys[i].startsWith('processing_lock_')) {
                            const timestamp = GM_getValue(keys[i], '0');
                            locks.push({
                                raceId: keys[i].replace('processing_lock_', ''),
                                lockedAt: new Date(parseInt(timestamp))
                            });
                        }
                    }
                } catch (e) {
                    console.log('GM_listValues not available');
                }
                console.log(`Processed races:`, races);
                console.log(`Processing locks:`, locks);
                return { races, locks };
            },
            getCurrentRaceStatus: () => {
                const raceId = window.location.pathname;
                const processed = GM_getValue(`processed_race_${raceId}`, null);
                const locked = GM_getValue(`processing_lock_${raceId}`, null);
                const status = {
                    raceId,
                    isProcessed: !!processed,
                    processedAt: processed ? new Date(parseInt(processed)) : null,
                    isLocked: !!locked,
                    lockedAt: locked ? new Date(parseInt(locked)) : null
                };
                console.log('Current race status:', status);
                return status;
            },
            
        };
        
        console.log(`[RacerTracker] Global debug functions available: window.racerDebugTracker`);
        console.log(`[RacerTracker] Try: window.racerDebugTracker.getRacerData()`);

    })();

})();
