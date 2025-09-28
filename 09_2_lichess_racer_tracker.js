// ==UserScript==
// @name         09_2_lichess_racer_tracker - Раcer-only трекер Lichess
// @namespace    http://tampermonkey.net/
// @version      1.9
// @description  Трекер задач только для Lichess Racer, редиректы и мониторинг прогресса только по гонкам
// @include      *
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // ==============================
    // === Core Settings ===
    // ==============================
    // Dynamic target: Mon-Thu 500, Fri 200, Weekend 1000
    function getMinTasksPerDay(date = new Date()) {
        const day = date.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
        if (day === 5) return 200;            // Friday
        if (day === 6 || day === 0) return 1000; // Weekend
        return 500;                           // Monday-Thursday
    }

    let minTasksPerDay = getMinTasksPerDay();
    console.log(`[RacerTracker] Daily target set: ${minTasksPerDay}`);
    
    // For compatibility with message control script (uses same GM key format)
    const COMPATIBILITY_ID   = 72;         // Fixed ID for GM key compatibility

    // =================================
    // === Helper Functions ===
    // =================================
    function getTodayDateString() {
        const now = new Date();
        const y   = now.getFullYear();
        const m   = String(now.getMonth() + 1).padStart(2, '0');
        const d   = String(now.getDate()).padStart(2, '0');
        const result = `${y}-${m}-${d}`;
        console.log(`[RacerTracker] getTodayDateString() calculated: ${result} (raw Date: ${now})`);
        return result;
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

    // ===============================
    // === RACER TRACKER LOGIC ===
    // ===============================
    (function() {
        const racerPageURL = 'https://lichess.org/racer';
        const dateKey = getTodayDateString();

        // GM keys for compatibility with message control script
        const keyDailyCount   = `daily_solved_${COMPATIBILITY_ID}_${dateKey}`;
        const keyCachedSolved = `cached_solved_${COMPATIBILITY_ID}_${dateKey}`;
        const keyCachedUnlock = `cached_unlock_${COMPATIBILITY_ID}_${dateKey}`;
        const keyRacerPuzzles = `racer_puzzles_${COMPATIBILITY_ID}_${dateKey}`;

        const hostname = window.location.hostname;
        const pathname = window.location.pathname;
        
        // Check if current page is racer-related (allowed when goal not met)
        const isRacerRelated = hostname === 'lichess.org' && (
            pathname === '/racer' ||
            pathname.startsWith('/racer/')
        );
        
        // Check if this is a Lichess page that should be allowed (forums, teams, study, analysis)
        const isLichessUtilityPage = hostname === 'lichess.org' && (
            pathname.startsWith('/forum/') ||
            pathname.startsWith('/team/') ||
            pathname.startsWith('/study/') ||
            pathname.startsWith('/analysis/')
        );
        
        // Any non-Lichess page OR Lichess pages that aren't racer/utility should be redirected if goal not met
        const isOtherPage = hostname !== 'lichess.org' || 
            (!isRacerRelated && !isLichessUtilityPage);
        
        // Check if this is a racer page (including active races)
        const isRacerPage = hostname === 'lichess.org' && (
            pathname.startsWith('/racer/') || 
            pathname === '/racer' ||
            pathname.includes('/racer')
        );
        const isRacerLobby = hostname === 'lichess.org' && pathname === '/racer';

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
                }
            }
        }

        // If NOT racer-related, hide body until check
        if (isOtherPage && document.body) {
            document.documentElement.style.backgroundColor = '#fff';
            document.body.style.visibility = 'hidden';
            console.log("[RacerTracker] Hiding body until puzzle count check");
        }

        console.log(`[RacerTracker] Script started on: ${window.location.href}`);
        console.log(`[RacerTracker] Page classification:`);
        console.log(`[RacerTracker]   - isRacerRelated: ${isRacerRelated}`);
        console.log(`[RacerTracker]   - isLichessUtilityPage: ${isLichessUtilityPage}`);
        console.log(`[RacerTracker]   - isOtherPage: ${isOtherPage}`);
        console.log(`[RacerTracker]   - isRacerPage: ${isRacerPage}`);
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
                <div style="font-weight: bold; margin-bottom: 8px; color: white !important; border-bottom: 1px solid rgba(255,255,255,0.3); padding-bottom: 5px;">🏁 Прогресс гонок</div>
                <div id="progress-stats" style="color: white !important;">
                    <div>Решено: <strong id="solved-count">0</strong></div>
                    <div>Осталось: <strong id="remaining-count">${minTasksPerDay}</strong></div>
                    <div style="margin-top: 5px; font-size: 12px; opacity: 0.8;">Только задачи из гонок</div>
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
            if (!isRacerPage) return;
            
            const progressWindow = document.getElementById('racer-progress-window');
            if (!progressWindow) {
                createPersistentProgressWindow();
                return;
            }
            
            const racerPuzzles = readGMNumber(keyRacerPuzzles) || 0;
            const remaining = Math.max(minTasksPerDay - racerPuzzles, 0);
            
            const solvedEl = progressWindow.querySelector('#solved-count');
            const remainingEl = progressWindow.querySelector('#remaining-count');
            
            if (solvedEl) solvedEl.textContent = racerPuzzles;
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
            
            console.log(`[RacerTracker] Progress updated: ${racerPuzzles} solved, ${remaining} remaining`);
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

        // Add race puzzles to daily count
        function addRacePuzzlesToDaily(racePuzzleCount, raceId = null) {
            console.log(`[RacerTracker] Adding ${racePuzzleCount} race puzzles to daily count`);
            
            const currentRacerPuzzles = readGMNumber(keyRacerPuzzles) || 0;
            const newRacerPuzzles = currentRacerPuzzles + racePuzzleCount;
            
            // Update racer puzzles count
            writeGMNumber(keyRacerPuzzles, newRacerPuzzles);
            
            // Update daily count (only racer puzzles count)
            writeGMNumber(keyDailyCount, newRacerPuzzles);
            
            // Update cache
            const newUnlockRemaining = Math.max(minTasksPerDay - newRacerPuzzles, 0);
            writeGMNumber(keyCachedSolved, newRacerPuzzles);
            writeGMNumber(keyCachedUnlock, newUnlockRemaining);
            
            console.log(`[RacerTracker] Updated counts - Daily: ${newRacerPuzzles}, Racer: ${newRacerPuzzles}, Remaining: ${newUnlockRemaining}`);
            
            // Race is already marked as processed by extractRacePuzzleResults
            if (raceId) {
                console.log(`[RacerTracker] Race ${raceId} processing confirmed`);
            }
            
            // Enhanced cross-script communication
            try {
                const event = new CustomEvent('lichessTrackerUpdate', {
                    detail: {
                        solved: newRacerPuzzles,
                        courseId: COMPATIBILITY_ID,
                        date: dateKey,
                        key: keyDailyCount,
                        timestamp: Date.now(),
                        source: 'racer'
                    }
                });
                window.dispatchEvent(event);
                console.log(`[RacerTracker] Dispatched custom event with solved=${newRacerPuzzles}`);
            } catch (e) {
                console.error(`[RacerTracker] Failed to dispatch custom event:`, e);
            }
            
            // Update progress window
            updateProgressWindow();
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

        // Main logic
        
        // For non-racer pages: check puzzle count and redirect if needed
        if (isOtherPage) {
            console.log("[RacerTracker] Processing non-racer page");
            
            // Proceed with racer progress check without training mode considerations
            
            const racerPuzzles = readGMNumber(keyRacerPuzzles) || 0;
            const unlockRemaining = Math.max(minTasksPerDay - racerPuzzles, 0);
            
            // Update GM storage
            writeGMNumber(keyDailyCount, racerPuzzles);
            writeGMNumber(keyCachedSolved, racerPuzzles);
            writeGMNumber(keyCachedUnlock, unlockRemaining);
            
            console.log(`[RacerTracker] Current progress - Puzzles solved: ${racerPuzzles}, Remaining: ${unlockRemaining}`);
            
            if (unlockRemaining > 0) {
                console.log(`[RacerTracker] ${unlockRemaining} puzzles remaining - Redirecting to Lichess racer`);
                window.location.replace(racerPageURL);
            } else {
                console.log("[RacerTracker] Daily puzzle goal met, showing page");
                if (document.body) document.body.style.visibility = '';
            }
            return;
        }
        
        // For racer-related pages: allow access and setup features
        if (isRacerRelated) {
            console.log("[RacerTracker] On racer-related page, allowing access");
            
            // Always show racer-related pages
            if (document.body) document.body.style.visibility = '';
            
            // Create persistent progress window
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => {
                    createPersistentProgressWindow();
                    updateProgressWindow();
                });
            } else {
                createPersistentProgressWindow();
                updateProgressWindow();
            }
            
            // Update progress window periodically
            setInterval(updateProgressWindow, 2000);
            
            // Setup race monitoring if on specific race page
            if (isRacerPage && !isRacerLobby) {
                console.log(`[RacerTracker] Setting up race monitoring on URL: ${window.location.href}`);
                
                setTimeout(() => {
                    setupRaceMonitoring();
                }, 1000);
            }
        }
        
        // For Lichess utility pages: allow access and update GM storage
        if (isLichessUtilityPage) {
            console.log("[RacerTracker] On Lichess utility page, allowing access");
            
            // Always show utility pages
            if (document.body) document.body.style.visibility = '';
            
            // Update GM storage for message control compatibility
            const racerPuzzles = readGMNumber(keyRacerPuzzles) || 0;
            writeGMNumber(keyDailyCount, racerPuzzles);
            
            console.log(`[RacerTracker] Updated GM storage for utility page: ${racerPuzzles} puzzles`);
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
