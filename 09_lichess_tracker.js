// ==UserScript==
// @name         09_lichess_tracker - Основной трекер Lichess Puzzles
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Основной трекер задач Lichess, редиректы и мониторинг прогресса с GM хранилищем
// @include      *
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // ==============================
    // === Core Settings ===
    // ==============================
    const lichessUsername    = 'kazamba';  // Lichess username
    let   minTasksPerDay     = 500;        // Minimum puzzles per day
    
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
        console.log(`[LichessTracker] getTodayDateString() calculated: ${result} (raw Date: ${now})`);
        return result;
    }

    function readGMNumber(key) {
        const v = GM_getValue(key, null);
        const result = v === null ? null : (isNaN(parseInt(v, 10)) ? null : parseInt(v, 10));
        console.log(`[LichessTracker] GM_READ: '${key}' = '${v}' -> ${result}`);
        return result;
    }

    function writeGMNumberForceZero(key, num) {
        // Force write without safeguards (for intentional resets)
        const oldValue = GM_getValue(key, null);
        GM_setValue(key, String(num));
        
        const verifyValue = GM_getValue(key, null);
        console.log(`[LichessTracker] GM_WRITE_FORCE: '${key}' = '${oldValue}' -> '${num}' (verified: '${verifyValue}')`);
        
        if (verifyValue !== String(num)) {
            console.error(`[LichessTracker] GM_WRITE_FORCE FAILED! Expected '${num}', got '${verifyValue}'`);
        }
    }

    function writeGMNumber(key, num) {
        const oldValue = GM_getValue(key, null);
        
        // Safeguard: Don't write 0 if we previously had a higher value (unless it's explicitly allowed)
        if (num === 0 && oldValue !== null) {
            const oldNum = parseInt(oldValue, 10);
            if (!isNaN(oldNum) && oldNum > 0 && key.includes('daily_solved')) {
                console.warn(`[LichessTracker] SAFEGUARD: Prevented writing 0 to '${key}' (was ${oldNum}). Checking for backup...`);
                
                // Try to restore from backup if available
                const backupKey = `backup_${key}`;
                const backupValue = GM_getValue(backupKey, null);
                if (backupValue !== null) {
                    const backupNum = parseInt(backupValue, 10);
                    if (!isNaN(backupNum) && backupNum > 0) {
                        console.log(`[LichessTracker] Restored from backup: ${backupNum}`);
                        num = backupNum;
                        GM_setValue(backupKey, null); // Clear backup after use
                    }
                } else {
                    // Keep the old value instead of writing 0
                    console.log(`[LichessTracker] Keeping previous value: ${oldNum}`);
                    return;
                }
            }
        }
        
        GM_setValue(key, String(num));
        
        // Verify the write was successful
        const verifyValue = GM_getValue(key, null);
        console.log(`[LichessTracker] GM_WRITE: '${key}' = '${oldValue}' -> '${num}' (verified: '${verifyValue}')`);
        
        if (verifyValue !== String(num)) {
            console.error(`[LichessTracker] GM_WRITE FAILED! Expected '${num}', got '${verifyValue}'`);
        } else {
            // Also set a signal that message control can detect
            const signalKey = `data_updated_signal_${Date.now()}`;
            GM_setValue(signalKey, `${key}:${num}`);
            console.log(`[LichessTracker] Set update signal '${signalKey}' = '${key}:${num}'`);
        }
    }

    // Check if we're currently in training time window (temporary suspension only)
    function isCurrentlyInTrainingTime() {
        const now = new Date();
        const day = now.getDay(); // 0-Sun, 1-Mon, ..., 6-Sat  
        const hour = now.getHours();
        const isWeekday = day >= 1 && day <= 5; // Monday to Friday
        const trainingStartHour = 9;
        const trainingEndHour = 10;
        
        // Training suspension only during active training hours on weekdays
        return isWeekday && hour >= trainingStartHour && hour < trainingEndHour;
    }

    // ===============================
    // === LICHESS TRACKER LOGIC ===
    // ===============================
    (function() {
        // Mutex to prevent multiple instances from running simultaneously
        const mutexKey = 'lichess_tracker_mutex';
        const instanceId = Math.random().toString(36).substr(2, 9);
        const now = Date.now();
        
        // Check if another instance is already running
        const existingMutex = GM_getValue(mutexKey, null);
        if (existingMutex) {
            const mutexData = JSON.parse(existingMutex);
            const timeSinceLastUpdate = now - mutexData.timestamp;
            
            if (timeSinceLastUpdate < 5000) { // 5 seconds
                console.log(`[LichessTracker] Another instance is running (${mutexData.instanceId}), skipping...`);
                return;
            }
        }
        
        // Set mutex
        GM_setValue(mutexKey, JSON.stringify({ instanceId, timestamp: now }));
        console.log(`[LichessTracker] Instance ${instanceId} acquired mutex`);
        
        // Clear mutex after 10 seconds
        setTimeout(() => {
            const currentMutex = GM_getValue(mutexKey, null);
            if (currentMutex) {
                const mutexData = JSON.parse(currentMutex);
                if (mutexData.instanceId === instanceId) {
                    GM_setValue(mutexKey, null);
                    console.log(`[LichessTracker] Instance ${instanceId} released mutex`);
                }
            }
        }, 10000);
        const trainingPageURL = 'https://lichess.org/training';
        const dateKey         = getTodayDateString();

        // GM keys for compatibility with message control script
        const keyDailyCount   = `daily_solved_${COMPATIBILITY_ID}_${dateKey}`;
        const keyCachedSolved = `cached_solved_${COMPATIBILITY_ID}_${dateKey}`;
        const keyCachedUnlock = `cached_unlock_${COMPATIBILITY_ID}_${dateKey}`;
        const keyRacerPuzzles = `racer_puzzles_${COMPATIBILITY_ID}_${dateKey}`; // NEW: separate racer storage

        const hostname   = window.location.hostname;
        const pathname   = window.location.pathname;
        
        // Check if current page is training-related (allowed when goal not met)
        const isTrainingRelated = hostname === 'lichess.org' && (
            pathname === '/training' ||
            pathname === '/training/themes' ||
            pathname.startsWith('/training/') ||
            pathname === '/racer' ||
            pathname.startsWith('/racer/')
        );
        
        // Check if this is a Lichess page that should be allowed (inbox, forums, etc.)
        const isLichessUtilityPage = hostname === 'lichess.org' && (
            pathname.startsWith('/inbox/') ||
            pathname.startsWith('/forum/') ||
            pathname.startsWith('/team/') ||
            pathname.startsWith('/study/') ||
            pathname.startsWith('/analysis/')
        );
        
        // Any non-Lichess page OR Lichess pages that aren't training/utility should be redirected if goal not met
        const isOtherPage = hostname !== 'lichess.org' || 
            (!isTrainingRelated && !isLichessUtilityPage);
        
        // Specifically the main training page for UI setup
        const isMainTrainingPage = hostname === 'lichess.org' && pathname === '/training';
        
        // Check if this is a racer page (including active races)
        const isRacerPage = hostname === 'lichess.org' && (
            pathname.startsWith('/racer/') || 
            pathname === '/racer' ||
            pathname.includes('/racer')
        );
        const isRacerLobby = hostname === 'lichess.org' && pathname === '/racer';

        // Reset keys at midnight (only if it's actually a new day)
        const savedDate = GM_getValue('lichess_tracker_date', null);
        console.log(`[LichessTracker] Date check - Saved: '${savedDate}', Current: '${dateKey}'`);
        
        if (savedDate !== dateKey) {
            // Only reset if we have a saved date and it's actually earlier
            if (savedDate === null) {
                console.log(`[LichessTracker] First run - initializing date tracking for ${dateKey}`);
                GM_setValue('lichess_tracker_date', dateKey);
                // Don't reset keys on first run
            } else {
                // Parse dates to compare properly
                const savedDateObj = new Date(savedDate + 'T00:00:00');
                const currentDateObj = new Date(dateKey + 'T00:00:00');
                
                if (currentDateObj > savedDateObj) {
                    console.log(`[LichessTracker] New day detected (${savedDate} -> ${dateKey}) — resetting GM keys`);
                    GM_setValue('lichess_tracker_date', dateKey);
                    // Use force write for intentional day resets
                    writeGMNumberForceZero(keyDailyCount, 0);
                    GM_setValue(keyCachedSolved, null);
                    GM_setValue(keyCachedUnlock, null);
                    GM_setValue(keyRacerPuzzles, null);
                } else {
                    console.log(`[LichessTracker] Date appears to be same or earlier (${savedDate} -> ${dateKey}) — NOT resetting keys`);
                    // Update the stored date but don't reset data
                    GM_setValue('lichess_tracker_date', dateKey);
                }
            }
        } else {
            console.log(`[LichessTracker] Same date (${dateKey}) — no reset needed`);
        }

        // If we're on any training-related page, clear cache for fresh data
        // BUT preserve current data as backup in case API fetch fails
        if (isTrainingRelated) {
            console.log("[LichessTracker] On training-related page → clearing cache for fresh data");
            
            // Store current values as backup before clearing
            const currentSolved = readGMNumber(keyDailyCount) || 0;
            const currentCachedSolved = readGMNumber(keyCachedSolved) || 0;
            const currentCachedUnlock = readGMNumber(keyCachedUnlock) || 0;
            
            if (currentSolved > 0) {
                GM_setValue(`backup_${keyDailyCount}`, currentSolved);
                console.log(`[LichessTracker] Backed up current solved count: ${currentSolved}`);
            }
            
            GM_setValue(keyCachedUnlock, null);
            GM_setValue(keyCachedSolved, null);
            // Don't clear daily count until we have fresh data
            // Don't clear racer puzzles - they should persist
        }

        // If NOT training-related, hide body until check
        if (isOtherPage && document.body) {
            document.documentElement.style.backgroundColor = '#fff';
            document.body.style.visibility = 'hidden';
            console.log("[LichessTracker] Hiding body until puzzle count check");
        }

        console.log(`[LichessTracker] Script started on: ${window.location.href}`);
        console.log(`[LichessTracker] Page classification:`);
        console.log(`[LichessTracker]   - isTrainingRelated: ${isTrainingRelated}`);
        console.log(`[LichessTracker]   - isLichessUtilityPage: ${isLichessUtilityPage}`);
        console.log(`[LichessTracker]   - isOtherPage: ${isOtherPage}`);
        console.log(`[LichessTracker]   - isRacerPage: ${isRacerPage}`);
        console.log(`[LichessTracker]   - hostname: ${hostname}`);
        console.log(`[LichessTracker]   - pathname: ${pathname}`);

        // Make global debug functions available immediately
        window.lichessDebugTracker = {
            showNotification: (race = 3, total = 127, remaining = 23) => {
                console.log(`[LichessTracker] Manual notification test with: race=${race}, total=${total}, remaining=${remaining}`);
                showRaceCompletionNotification(race, total, remaining);
            },
            testProgressWindow: () => {
                console.log(`[LichessTracker] Testing progress window creation`);
                // Create a temporary progress window for testing
                const testWindow = document.createElement('div');
                testWindow.id = 'test-progress-window';
                testWindow.style.cssText = `
                    position: fixed !important;
                    top: 20px !important;
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
                `;
                testWindow.innerHTML = `
                    <div style="font-weight: bold; margin-bottom: 8px; color: white !important;">🏁 Тест окна прогресса</div>
                    <div style="color: white !important;">
                        <div>Всего решено: <strong>5</strong></div>
                        <div>Правильно: <strong>3</strong></div>
                        <div>Время: <strong>02:45</strong></div>
                        <div style="margin-top: 5px; font-size: 12px; opacity: 0.8;">Тестовое окно - автоудаление через 5с</div>
                    </div>
                `;
                
                if (document.body) {
                    document.body.appendChild(testWindow);
                    console.log('[LichessTracker] Test progress window created');
                    
                    // Auto-remove after 5 seconds
                    setTimeout(() => {
                        if (testWindow.parentNode) {
                            testWindow.parentNode.removeChild(testWindow);
                            console.log('[LichessTracker] Test progress window removed');
                        }
                    }, 5000);
                } else {
                    console.warn('[LichessTracker] Cannot create test window - body not available');
                }
            },
            pageInfo: () => {
                console.log('=== PAGE CLASSIFICATION ===');
                console.log(`URL: ${window.location.href}`);
                console.log(`Hostname: ${hostname}`);
                console.log(`Pathname: ${pathname}`);
                console.log(`isTrainingRelated: ${isTrainingRelated}`);
                console.log(`isRacerPage: ${isRacerPage}`);
                console.log(`Document ready: ${document.readyState}`);
                console.log(`Body exists: ${!!document.body}`);
                return {
                    url: window.location.href,
                    hostname,
                    pathname,
                    isTrainingRelated,
                    isRacerPage,
                    documentReady: document.readyState,
                    bodyExists: !!document.body
                };
            },
            addTestPuzzles: (count = 1) => {
                console.log(`[LichessTracker] Adding ${count} test puzzles`);
                addRacePuzzlesToDaily(count);
            },
            getGMData: () => {
                const daily = readGMNumber(keyDailyCount);
                const racer = readGMNumber(keyRacerPuzzles);
                console.log(`GM Data - Daily: ${daily}, Racer: ${racer}`);
                return { daily, racer };
            }
        };
        
        console.log(`[LichessTracker] Global debug functions available: window.lichessDebugTracker`);
        console.log(`[LichessTracker] Try: window.lichessDebugTracker.showNotification()`);
        
        // Pre-declare notification function for global access
        function showRaceCompletionNotification(racePuzzles, totalDaily, remaining) {
            console.log(`[LichessTracker] === SHOWING RACE COMPLETION NOTIFICATION ===`);
            console.log(`[LichessTracker] Parameters - Race: ${racePuzzles}, Total: ${totalDaily}, Remaining: ${remaining}`);
            console.log(`[LichessTracker] Current URL: ${window.location.href}`);
            console.log(`[LichessTracker] Document ready state: ${document.readyState}`);
            console.log(`[LichessTracker] Body exists: ${!!document.body}`);
            
            try {
                // Create notification element
                const notification = document.createElement('div');
                notification.id = 'lichess-race-notification-' + Date.now();
                notification.className = 'lichess-race-notification';
                
                // Enhanced CSS with !important to override any conflicts
                notification.style.cssText = `
                    position: fixed !important;
                    top: 80px !important;
                    right: 20px !important;
                    background: #339af0 !important;
                    color: white !important;
                    padding: 15px 20px !important;
                    border-radius: 8px !important;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.3) !important;
                    z-index: 2147483647 !important;
                    font-family: Arial, sans-serif !important;
                    font-size: 14px !important;
                    max-width: 300px !important;
                    border: 2px solid #1971c2 !important;
                    display: block !important;
                    visibility: visible !important;
                    opacity: 1 !important;
                    pointer-events: auto !important;
                `;
                
                notification.innerHTML = `
                    <div style="font-weight: bold; margin-bottom: 8px; color: white !important;">🏁 Гонка завершена!</div>
                    <div style="color: white !important;">Решено в гонке: <strong>${racePuzzles}</strong></div>
                    <div style="color: white !important;">Всего сегодня: <strong>${totalDaily}</strong></div>
                    <div style="color: white !important;">Осталось: <strong>${remaining}</strong></div>
                    <div style="margin-top: 8px; font-size: 11px; opacity: 0.8; color: white !important;">Окно исчезнет через 5 секунд</div>
                `;
                
                // Try multiple insertion methods
                let inserted = false;
                
                // Method 1: Append to body
                if (document.body) {
                    document.body.appendChild(notification);
                    inserted = true;
                    console.log(`[LichessTracker] Notification appended to body`);
                } else {
                    console.warn(`[LichessTracker] Document body not available`);
                }
                
                // Method 2: Fallback to document.documentElement if body failed
                if (!inserted && document.documentElement) {
                    document.documentElement.appendChild(notification);
                    inserted = true;
                    console.log(`[LichessTracker] Notification appended to documentElement`);
                }
                
                // Verify insertion
                setTimeout(() => {
                    const checkElement = document.getElementById(notification.id);
                    if (checkElement) {
                        console.log(`[LichessTracker] Notification verified in DOM`);
                        console.log(`[LichessTracker] Computed styles:`, {
                            display: getComputedStyle(checkElement).display,
                            visibility: getComputedStyle(checkElement).visibility,
                            opacity: getComputedStyle(checkElement).opacity,
                            zIndex: getComputedStyle(checkElement).zIndex,
                            position: getComputedStyle(checkElement).position
                        });
                    } else {
                        console.error(`[LichessTracker] Notification NOT found in DOM after insertion!`);
                        // Fallback: Use alert as last resort
                        alert(`🏁 Гонка завершена!\nРешено в гонке: ${racePuzzles}\nВсего сегодня: ${totalDaily}\nОсталось: ${remaining}`);
                    }
                }, 100);
                
                // Auto-hide after 5 seconds
                setTimeout(() => {
                    try {
                        if (notification.parentNode) {
                            console.log(`[LichessTracker] Removing notification`);
                            notification.parentNode.removeChild(notification);
                        }
                    } catch (e) {
                        console.error(`[LichessTracker] Error removing notification:`, e);
                    }
                }, 5000);
                
                // Add click to close
                notification.addEventListener('click', () => {
                    try {
                        if (notification.parentNode) {
                            notification.parentNode.removeChild(notification);
                            console.log(`[LichessTracker] Notification closed by click`);
                        }
                    } catch (e) {
                        console.error(`[LichessTracker] Error closing notification:`, e);
                    }
                });
                
                console.log(`[LichessTracker] Notification created and displayed successfully`);
                
            } catch (error) {
                console.error(`[LichessTracker] Error creating notification:`, error);
                console.error(`[LichessTracker] Error stack:`, error.stack);
                
                // Ultimate fallback: browser alert
                try {
                    alert(`🏁 Гонка завершена!\nРешено в гонке: ${racePuzzles}\nВсего сегодня: ${totalDaily}\nОсталось: ${remaining}`);
                } catch (alertError) {
                    console.error(`[LichessTracker] Even alert failed:`, alertError);
                }
            }
            
            // Also log to console as backup
            console.log(`%c🏁 ГОНКА ЗАВЕРШЕНА!`, 'font-size: 16px; font-weight: bold; color: #339af0;');
            console.log(`%cРешено в гонке: ${racePuzzles}`, 'font-size: 14px; color: #28a745;');
            console.log(`%cВсего сегодня: ${totalDaily}`, 'font-size: 14px; color: #007bff;');
            console.log(`%cОсталось: ${remaining}`, `font-size: 14px; color: ${remaining > 0 ? '#dc3545' : '#28a745'};`);
        }

        /**
         * Fetches today's solved puzzles from Lichess API
         */
        function fetchTodaysPuzzles() {
            console.log(`[LichessTracker] Fetching today's puzzles from API`);
            return new Promise(resolve => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: `https://lichess.org/api/user/${lichessUsername}/activity`,
                    onload(response) {
                        if (response.status < 200 || response.status >= 300) {
                            console.warn(`[LichessTracker] API error: ${response.status}`);
                            resolve(0);
                            return;
                        }

                        try {
                            const activities = JSON.parse(response.responseText);
                            console.log("[LichessTracker] Activities received:", activities.length);

                            // Get today's date string for comparison
                            const todayDateString = getTodayDateString(); // Format: YYYY-MM-DD
                            console.log(`[LichessTracker] Looking for activities on: ${todayDateString}`);

                            // Find today's puzzle activity by checking actual dates
                            let totalSolvedToday = 0;
                            let foundTodayActivity = false;
                            
                            for (const activity of activities) {
                                if (activity.interval && activity.puzzles && activity.puzzles.score) {
                                    // Convert interval start timestamp to date string
                                    const activityDate = new Date(activity.interval.start);
                                    const activityDateString = activityDate.getFullYear() + '-' + 
                                        String(activityDate.getMonth() + 1).padStart(2, '0') + '-' + 
                                        String(activityDate.getDate()).padStart(2, '0');
                                    
                                    console.log(`[LichessTracker] Activity date: ${activityDateString}`);
                                    
                                    // Only count if the activity is from today
                                    if (activityDateString === todayDateString) {
                                        const wins = activity.puzzles.score.win || 0;
                                        totalSolvedToday += wins;
                                        foundTodayActivity = true;
                                        console.log(`[LichessTracker] Found today's activity with ${wins} puzzles solved`);
                                    }
                                }
                            }

                            if (!foundTodayActivity) {
                                console.log(`[LichessTracker] No puzzle activity found for today (${todayDateString}), returning 0`);
                                totalSolvedToday = 0;
                            }

                            // Add racer puzzles to the total
                            const racerPuzzles = readGMNumber(keyRacerPuzzles) || 0;
                            totalSolvedToday += racerPuzzles;
                            
                            if (racerPuzzles > 0) {
                                console.log(`[LichessTracker] Adding ${racerPuzzles} racer puzzles to total`);
                            }

                            console.log(`[LichessTracker] Total puzzles solved today: ${totalSolvedToday} (API: ${totalSolvedToday - racerPuzzles}, Racer: ${racerPuzzles})`);
                            resolve(totalSolvedToday);
                        } catch (error) {
                            console.error("[LichessTracker] JSON parse error:", error);
                            resolve(0);
                        }
                    },
                    onerror(err) {
                        console.error("[LichessTracker] API request error:", err);
                        resolve(0);
                    }
                });
            });
        }

        // ============================================
        // Main Logic: Check if currently in training time, then puzzles and decide action
        // ============================================
        
        // For non-training pages: check if currently in training time, then cache, then Lichess API if needed
        if (isOtherPage) {
            console.log("[LichessTracker] Processing non-training page");

            // Check if we're currently in training time window (temporary suspension)
            if (isCurrentlyInTrainingTime()) {
                console.log("[LichessTracker] Currently in training time window (9:00-10:00), temporarily suspending puzzle requirements");
                if (document.body) document.body.style.visibility = '';
                return;
            }

            // Always fetch fresh data for non-training pages to make redirect decisions
            console.log("[LichessTracker] Fetching fresh data for redirect decision");
            fetchTodaysPuzzles().then(solvedToday => {
                const unlockRemaining = Math.max(minTasksPerDay - solvedToday, 0);
                
                // Update GM storage for message control compatibility
                writeGMNumber(keyDailyCount, solvedToday);
                writeGMNumber(keyCachedSolved, solvedToday);
                writeGMNumber(keyCachedUnlock, unlockRemaining);
                
                // Track update time
                const keyLastUpdate = `last_update_${COMPATIBILITY_ID}_${dateKey}`;
                GM_setValue(keyLastUpdate, Date.now());
                
                console.log(`[LichessTracker] Fresh data - Puzzles solved: ${solvedToday}, Remaining: ${unlockRemaining}`);
                console.log(`[LichessTracker] Updated GM key '${keyDailyCount}' with value: ${solvedToday}`);
                
                if (unlockRemaining > 0) {
                    console.log(`[LichessTracker] ${unlockRemaining} puzzles remaining - Redirecting to Lichess training`);
                    window.location.replace(trainingPageURL);
                } else {
                    console.log("[LichessTracker] Daily puzzle goal met, showing page");
                    if (document.body) document.body.style.visibility = '';
                }
            });
            return;
        }

        // For training-related pages: allow access and setup features if main training page
        if (isTrainingRelated) {
            console.log("[LichessTracker] On training-related page, allowing access");
            
            // Always show training-related pages
            if (document.body) document.body.style.visibility = '';
            
            // Immediately update GM storage with current data for message control compatibility
            fetchTodaysPuzzles().then(solvedToday => {
                writeGMNumber(keyDailyCount, solvedToday);
                console.log(`[LichessTracker] Updated GM key '${keyDailyCount}' with current total: ${solvedToday}`);
            });
            
            // Setup UI features only on main training page
            if (isMainTrainingPage) {
                console.log("[LichessTracker] Setting up features for main training page");

                function onTrainingPageLoad() {
                    console.log("[LichessTracker] Main training page loaded");

                    // Setup Lichess-specific features
                    hideLichessEasyDifficulties();
                    hideLichessHintSolutionButtons();
                    startLichessProgressTracking();
                }

                if (document.readyState === 'interactive' || document.readyState === 'complete') {
                    onTrainingPageLoad();
                } else {
                    window.addEventListener('DOMContentLoaded', onTrainingPageLoad);
                }
            }
            
            // Setup racer monitoring if on racer page
            if (isRacerPage) {
                console.log(`[LichessTracker] Setting up racer monitoring on URL: ${window.location.href}`);
                console.log(`[LichessTracker] Pathname: ${pathname}, isRacerPage: ${isRacerPage}`);
                
                // Add a small delay to ensure page is loaded
                setTimeout(() => {
                    setupRacerMonitoring();
                }, 1000);
            } else {
                console.log(`[LichessTracker] Not a racer page - isRacerPage: ${isRacerPage}, pathname: ${pathname}`);
            }
        }
        
        // For Lichess utility pages (inbox, forum, etc.): allow access and update GM storage
        if (isLichessUtilityPage) {
            console.log("[LichessTracker] On Lichess utility page (inbox/forum/etc.), allowing access and updating storage");
            console.log(`[LichessTracker] Utility page path: ${pathname}`);
            
            // Always show utility pages
            if (document.body) document.body.style.visibility = '';
            
            // Check if message control is requesting data
            const dataRequest = GM_getValue('message_control_requesting_data', null);
            if (dataRequest) {
                console.log(`[LichessTracker] Message control requested data at ${dataRequest}, responding immediately`);
                GM_setValue('message_control_requesting_data', null); // Clear the request
            }
            
            // Update GM storage for message control compatibility
            console.log(`[LichessTracker] About to fetch puzzles for utility page...`);
            fetchTodaysPuzzles().then(solvedToday => {
                writeGMNumber(keyDailyCount, solvedToday);
                
                // Track update time
                const keyLastUpdate = `last_update_${COMPATIBILITY_ID}_${dateKey}`;
                GM_setValue(keyLastUpdate, Date.now());
                
                console.log(`[LichessTracker] Updated GM key '${keyDailyCount}' with current total: ${solvedToday} for utility page`);
                console.log(`[LichessTracker] GM storage should now show ${solvedToday} for message control script`);
                
                // Write a test key to verify cross-script communication
                GM_setValue('tracker_test_communication', `${solvedToday}_${Date.now()}`);
                console.log(`[LichessTracker] Wrote test communication key for message control verification`);
                
                // Force message control to check again by setting a notification key
                GM_setValue('tracker_data_ready', `${keyDailyCount}:${solvedToday}:${Date.now()}`);
                console.log(`[LichessTracker] Set data ready notification for message control`);
                
                // ADD: Direct DOM-based communication to bypass GM storage isolation
                const dataElement = document.createElement('div');
                dataElement.id = 'lichess-tracker-data';
                dataElement.style.display = 'none';
                dataElement.setAttribute('data-solved', solvedToday);
                dataElement.setAttribute('data-course-id', COMPATIBILITY_ID);
                dataElement.setAttribute('data-date', dateKey);
                dataElement.setAttribute('data-timestamp', Date.now());
                dataElement.setAttribute('data-key', keyDailyCount);
                
                // Remove any existing element first
                const existing = document.getElementById('lichess-tracker-data');
                if (existing) existing.remove();
                
                // Add to DOM
                document.body.appendChild(dataElement);
                console.log(`[LichessTracker] Added DOM element with data: solved=${solvedToday}, key=${keyDailyCount}`);
                
                // Also dispatch a custom event
                const event = new CustomEvent('lichessTrackerUpdate', {
                    detail: {
                        solved: solvedToday,
                        courseId: COMPATIBILITY_ID,
                        date: dateKey,
                        key: keyDailyCount,
                        timestamp: Date.now()
                    }
                });
                window.dispatchEvent(event);
                console.log(`[LichessTracker] Dispatched custom event with solved=${solvedToday}`);
                
                // Store in window global as backup
                window.lichessTrackerData = {
                    solved: solvedToday,
                    courseId: COMPATIBILITY_ID,
                    date: dateKey,
                    key: keyDailyCount,
                    timestamp: Date.now()
                };
                console.log(`[LichessTracker] Set window.lichessTrackerData with solved=${solvedToday}`);
                
                // Try localStorage as another backup
                try {
                    localStorage.setItem('lichess_tracker_data', JSON.stringify({
                        solved: solvedToday,
                        courseId: COMPATIBILITY_ID,
                        date: dateKey,
                        key: keyDailyCount,
                        timestamp: Date.now()
                    }));
                    console.log(`[LichessTracker] Set localStorage backup with solved=${solvedToday}`);
                } catch (e) {
                    console.log(`[LichessTracker] localStorage backup failed:`, e);
                }
            }).catch(error => {
                console.error(`[LichessTracker] Error fetching puzzles for utility page:`, error);
            });
        }

        // =================================
        // === LICHESS-SPECIFIC FEATURES ===
        // =================================
        
        function hideLichessEasyDifficulties() {
            console.log("[LichessTracker] Hiding easy difficulty options on Lichess");
            
            function hideDifficulties() {
                const selector = document.querySelector('#puzzle-difficulty');
                if (selector) {
                    const easiestOption = selector.querySelector('option[value="easiest"]');
                    const easierOption = selector.querySelector('option[value="easier"]');
                    
                    if (easiestOption) {
                        easiestOption.style.display = 'none';
                        console.log("[LichessTracker] Hidden 'easiest' difficulty on Lichess");
                    }
                    if (easierOption) {
                        easierOption.style.display = 'none';
                        console.log("[LichessTracker] Hidden 'easier' difficulty on Lichess");
                    }
                }
            }

            // Apply immediately and observe changes
            hideDifficulties();
            const observer = new MutationObserver(hideDifficulties);
            observer.observe(document.body, { childList: true, subtree: true });
        }

        function hideLichessHintSolutionButtons() {
            console.log("[LichessTracker] Hiding hint and solution buttons on Lichess");
            
            // CSS approach for Lichess elements
            GM_addStyle(`
                .view_solution.show { display: none !important; }
                .view_solution { display: none !important; }
                .puzzle__side__user .view_solution { display: none !important; }
            `);

            // JavaScript approach for dynamic Lichess content
            function hideButtons() {
                document.querySelectorAll('.view_solution').forEach(element => {
                    element.style.display = 'none';
                });
            }

            hideButtons();
            const observer = new MutationObserver(hideButtons);
            observer.observe(document.body, { childList: true, subtree: true });
        }

        function startLichessProgressTracking() {
            console.log("[LichessTracker] Starting Lichess progress tracking");
            
            // Update progress every minute
            function updateProgress() {
                console.log("[LichessTracker] Updating progress data");
                fetchTodaysPuzzles().then(solvedToday => {
                    const unlockRemaining = Math.max(minTasksPerDay - solvedToday, 0);
                    
                    // Update GM storage
                    writeGMNumber(keyDailyCount, solvedToday);
                    writeGMNumber(keyCachedSolved, solvedToday);
                    writeGMNumber(keyCachedUnlock, unlockRemaining);
                    
                    // Update page title
                    const oldTitle = document.title.replace(/^\d+\s·\s/, '');
                    document.title = `${unlockRemaining} · ${oldTitle}`;
                    
                    console.log(`[LichessTracker] Progress: ${solvedToday} puzzles solved, ${unlockRemaining} remaining`);
                    
                    // Show simple progress indicator
                    showLichessProgressIndicator(solvedToday, unlockRemaining);
                });
            }

            // Update immediately and then every minute
            updateProgress();
            setInterval(updateProgress, 60000);
            
            // Make update function globally available for race completion
            window.lichessTrackerUpdateProgress = updateProgress;
        }

        function showLichessProgressIndicator(solved, remaining) {
            let indicator = document.getElementById('lichess-progress-indicator');
            if (!indicator) {
                indicator = document.createElement('div');
                indicator.id = 'lichess-progress-indicator';
                indicator.style.cssText = `
                    position: fixed;
                    top: 10px;
                    right: 10px;
                    background: rgba(255, 255, 255, 0.95);
                    border: 1px solid #ccc;
                    border-radius: 4px;
                    padding: 8px 12px;
                    font-family: Arial, sans-serif;
                    font-size: 12px;
                    z-index: 9999;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
                `;
                document.body.appendChild(indicator);
            }
            
            indicator.innerHTML = `
                <div><strong>Lichess Puzzles</strong></div>
                <div>Solved today: <strong>${solved}</strong></div>
                <div>Remaining: <strong>${remaining}</strong></div>
            `;
        }
        
        // =================================
        // === RACER MONITORING LOGIC ===
        // =================================
        
        function setupRacerMonitoring() {
            console.log("[LichessTracker] Setting up real-time racer monitoring");
            
            let raceCompleted = false;
            let racerCheckInterval = null;
            let progressWindow = null;
            let lastSolvedCount = 0;
            let lastCorrectCount = 0;
            let raceStarted = false;
            
            // Check if we're in an actual race (not lobby)
            function isInActiveRace() {
                // Check if we're on a specific race URL (not just /racer lobby)
                const isSpecificRaceUrl = window.location.pathname.startsWith('/racer/') && window.location.pathname !== '/racer/';
                
                // Check for race UI elements that indicate an active race
                const hasRaceUI = document.querySelector('.puz-side__solved, .puz-board, .racer__race__tracks');
                const hasLobbyButton = document.querySelector('[href="/racer"], .button[data-href="/racer"]');
                
                const inRace = isSpecificRaceUrl && hasRaceUI && !hasLobbyButton;
                console.log(`[LichessTracker] Race status check - URL: ${window.location.pathname}, hasRaceUI: ${!!hasRaceUI}, hasLobbyButton: ${!!hasLobbyButton}, inRace: ${inRace}`);
                
                return inRace;
            }
            
            // Create real-time progress window (only during race)
            function createProgressWindow() {
                if (progressWindow || !isInActiveRace()) return progressWindow;
                
                progressWindow = document.createElement('div');
                progressWindow.id = 'lichess-race-progress-' + Date.now();
                progressWindow.className = 'lichess-race-progress';
                
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
                    <div style="font-weight: bold; margin-bottom: 8px; color: white !important; border-bottom: 1px solid rgba(255,255,255,0.3); padding-bottom: 5px;">🏁 Гонка в процессе</div>
                    <div id="progress-stats" style="color: white !important;">
                        <div>Всего решено: <strong id="total-solved">0</strong></div>
                        <div>Правильно: <strong id="correct-solved">0</strong></div>
                        <div style="margin-top: 5px; font-size: 12px; opacity: 0.8;">Обновляется в реальном времени</div>
                    </div>
                `;
                
                // Add close button
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
                    if (progressWindow && progressWindow.parentNode) {
                        progressWindow.style.opacity = '0';
                        setTimeout(() => {
                            if (progressWindow && progressWindow.parentNode) {
                                progressWindow.parentNode.removeChild(progressWindow);
                                progressWindow = null;
                            }
                        }, 300);
                    }
                };
                progressWindow.appendChild(closeBtn);
                
                // Insert into DOM
                if (document.body) {
                    document.body.appendChild(progressWindow);
                    console.log('[LichessTracker] Real-time progress window created');
                } else {
                    console.warn('[LichessTracker] Cannot create progress window - body not available');
                }
                
                return progressWindow;
            }
            
            // Update progress window with current data
            function updateProgressWindow() {
                if (!isInActiveRace()) {
                    // If no longer in active race, remove window
                    if (progressWindow && progressWindow.parentNode) {
                        progressWindow.parentNode.removeChild(progressWindow);
                        progressWindow = null;
                    }
                    return;
                }
                
                if (!progressWindow) createProgressWindow();
                if (!progressWindow) return;
                
                // Get current solved count from UI
                const solvedElement = document.querySelector('.puz-side__solved__text');
                const currentSolved = solvedElement ? parseInt(solvedElement.textContent) || 0 : 0;
                
                // Count correct/incorrect from puzzle history
                const puzzleHistory = document.querySelector('.puz-history__rounds');
                let correctCount = 0;
                let totalCount = 0;
                
                if (puzzleHistory) {
                    const rounds = puzzleHistory.querySelectorAll('.puz-history__round');
                    totalCount = rounds.length;
                    
                    rounds.forEach(round => {
                        const goodElement = round.querySelector('good');
                        if (goodElement) {
                            correctCount++;
                        }
                    });
                }
                
                // Update window content (without timer)
                const totalSolvedEl = progressWindow.querySelector('#total-solved');
                const correctSolvedEl = progressWindow.querySelector('#correct-solved');
                
                if (totalSolvedEl) totalSolvedEl.textContent = Math.max(currentSolved, totalCount);
                if (correctSolvedEl) correctSolvedEl.textContent = correctCount;
                
                // Highlight changes
                if (correctCount > lastCorrectCount) {
                    if (correctSolvedEl) {
                        correctSolvedEl.style.background = '#28a745';
                        correctSolvedEl.style.padding = '2px 4px';
                        correctSolvedEl.style.borderRadius = '3px';
                        setTimeout(() => {
                            if (correctSolvedEl) {
                                correctSolvedEl.style.background = 'transparent';
                                correctSolvedEl.style.padding = '0';
                            }
                        }, 1000);
                    }
                    console.log(`[LichessTracker] Correct answers increased: ${lastCorrectCount} -> ${correctCount}`);
                }
                
                lastSolvedCount = Math.max(currentSolved, totalCount);
                lastCorrectCount = correctCount;
                
                return { totalSolved: Math.max(currentSolved, totalCount), correctSolved: correctCount };
            }
            
            // Enhanced race completion detection
            function checkForRaceCompletion() {
                if (raceCompleted) return;
                
                // Update progress window
                const progress = updateProgressWindow();
                
                // Check for race completion indicators
                let foundRaceEnd = false;
                
                // Method 1: Look for "Гонка завершена!" text in h2 elements
                const raceEndElements = document.querySelectorAll('h2');
                for (const element of raceEndElements) {
                    if (element.textContent && element.textContent.includes('Гонка завершена')) {
                        foundRaceEnd = true;
                        console.log("[LichessTracker] Race completion detected via h2 text!");
                        break;
                    }
                }
                
                // Method 2: Look for race completion in any text content
                if (!foundRaceEnd) {
                    const bodyText = document.body.textContent || '';
                    if (bodyText.includes('Гонка завершена') || 
                        bodyText.includes('Race finished') ||
                        bodyText.includes('Следующая гонка')) {
                        foundRaceEnd = true;
                        console.log("[LichessTracker] Race completion detected via general text search!");
                    }
                }
                
                // Method 3: Check for racer post section
                if (!foundRaceEnd) {
                    const racerPost = document.querySelector('.racer__post');
                    if (racerPost) {
                        foundRaceEnd = true;
                        console.log("[LichessTracker] Race completion detected via racer post section!");
                    }
                }
                
                if (foundRaceEnd && !raceCompleted) {
                    raceCompleted = true;
                    console.log("[LichessTracker] Processing race completion...");
                    
                    // Update window to show completion
                    if (progressWindow) {
                        const headerEl = progressWindow.querySelector('div');
                        if (headerEl) {
                            headerEl.innerHTML = '🏁 Гонка завершена!';
                            headerEl.style.background = '#28a745';
                            headerEl.style.padding = '5px';
                            headerEl.style.borderRadius = '4px';
                        }
                        
                        // Auto-hide the progress window after 10 seconds
                        setTimeout(() => {
                            if (progressWindow && progressWindow.parentNode) {
                                progressWindow.style.opacity = '0';
                                setTimeout(() => {
                                    if (progressWindow && progressWindow.parentNode) {
                                        progressWindow.parentNode.removeChild(progressWindow);
                                        progressWindow = null;
                                    }
                                }, 300);
                            }
                        }, 10000);
                    }
                    
                    // Process final results
                    setTimeout(() => {
                        extractRacePuzzleResults();
                    }, 1000);
                    
                    // Stop monitoring
                    if (racerCheckInterval) {
                        clearInterval(racerCheckInterval);
                        racerCheckInterval = null;
                    }
                }
            }
            
            // Start monitoring only if in active race, otherwise wait
            function startMonitoring() {
                if (isInActiveRace()) {
                    createProgressWindow();
                    updateProgressWindow();
                    raceStarted = true;
                    console.log('[LichessTracker] Race detected, starting progress monitoring');
                } else {
                    console.log('[LichessTracker] Not in active race yet, waiting...');
                }
                checkForRaceCompletion();
            }
            
            startMonitoring();
            
            // Set up interval to check every second
            racerCheckInterval = setInterval(() => {
                if (!raceStarted && isInActiveRace()) {
                    // Race just started
                    createProgressWindow();
                    raceStarted = true;
                    console.log('[LichessTracker] Race started, showing progress window');
                }
                
                checkForRaceCompletion();
                if (!raceCompleted && raceStarted) {
                    updateProgressWindow();
                }
            }, 1000);
            
            // Set up MutationObserver for faster detection
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'childList') {
                        if (!raceStarted && isInActiveRace()) {
                            // Race just started
                            createProgressWindow();
                            raceStarted = true;
                            console.log('[LichessTracker] Race started (via mutation), showing progress window');
                        }
                        
                        if (!raceCompleted && raceStarted) {
                            updateProgressWindow();
                        }
                        checkForRaceCompletion();
                    }
                });
            });
            
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
            
            console.log("[LichessTracker] Real-time racer monitoring active");
            
            // Make functions globally accessible for debugging
            window.lichessDebugRacer = {
                testNotification: (race = 3, total = 127, remaining = 23) => {
                    console.log(`[LichessTracker] Testing racer notification with: race=${race}, total=${total}, remaining=${remaining}`);
                    showRaceCompletionNotification(race, total, remaining);
                },
                testProgressWindow: () => {
                    console.log(`[LichessTracker] Testing real-time progress window`);
                    createProgressWindow();
                    updateProgressWindow();
                },
                forceCompletion: () => {
                    console.log(`[LichessTracker] Forcing race completion for testing`);
                    raceCompleted = true;
                    if (progressWindow) {
                        const headerEl = progressWindow.querySelector('div');
                        if (headerEl) {
                            headerEl.innerHTML = '🏁 Гонка завершена!';
                            headerEl.style.background = '#28a745';
                            headerEl.style.padding = '5px';
                            headerEl.style.borderRadius = '4px';
                        }
                    }
                    extractRacePuzzleResults();
                },
                checkCompletion: checkForRaceCompletion,
                extractResults: extractRacePuzzleResults,
                addPuzzles: (count) => addRacePuzzlesToDaily(count || 1),
                status: () => {
                    console.log(`Race completed: ${raceCompleted}`);
                    console.log(`Interval active: ${racerCheckInterval !== null}`);
                    console.log(`Current URL: ${window.location.href}`);
                    console.log(`Document ready: ${document.readyState}`);
                    console.log(`Body exists: ${!!document.body}`);
                }
            };
            
            console.log("[LichessTracker] Debug functions available: window.lichessDebugRacer");
        }
        
        function extractRacePuzzleResults() {
            console.log("[LichessTracker] Extracting race puzzle results");
            
            let puzzleHistorySection = null;
            let retryCount = 0;
            const maxRetries = 3;
            
            function findPuzzleHistory() {
                // Try multiple selectors for puzzle history
                const selectors = [
                    '.puz-history__rounds',
                    '.puz-history',
                    '[class*="history"]',
                    '[class*="round"]',
                    '.race-results'
                ];
                
                for (const selector of selectors) {
                    const element = document.querySelector(selector);
                    if (element) {
                        console.log(`[LichessTracker] Found puzzle history using selector: ${selector}`);
                        return element;
                    }
                }
                return null;
            }
            
            function attemptExtraction() {
                puzzleHistorySection = findPuzzleHistory();
                
                if (!puzzleHistorySection) {
                    retryCount++;
                    if (retryCount <= maxRetries) {
                        console.log(`[LichessTracker] Puzzle history section not found, retrying in 2 seconds... (attempt ${retryCount}/${maxRetries})`);
                        setTimeout(attemptExtraction, 2000);
                        return;
                    } else {
                        console.log(`[LichessTracker] Failed to find puzzle history after ${maxRetries} attempts, trying alternative method`);
                        // Alternative: look for any race result indicators
                        tryAlternativeExtraction();
                        return;
                    }
                }
                
                // Count correctly solved puzzles (those with <good> class)
                let allRounds = puzzleHistorySection.querySelectorAll('.puz-history__round');
                
                // If no rounds found, try alternative selectors
                if (allRounds.length === 0) {
                    const altSelectors = ['[class*="round"]', '[class*="puzzle"]', '.result'];
                    for (const selector of altSelectors) {
                        allRounds = puzzleHistorySection.querySelectorAll(selector);
                        if (allRounds.length > 0) {
                            console.log(`[LichessTracker] Found rounds using alternative selector: ${selector}`);
                            break;
                        }
                    }
                }
                
                let correctlySolved = 0;
                
                console.log(`[LichessTracker] Found ${allRounds.length} total puzzle rounds`);
                
                allRounds.forEach((round, index) => {
                    // Look for success indicators
                    const goodElement = round.querySelector('good');
                    const successElement = round.querySelector('.good, [class*="success"], [class*="correct"]');
                    
                    if (goodElement || successElement) {
                        correctlySolved++;
                        const timeText = (goodElement || successElement).textContent || '';
                        console.log(`[LichessTracker] Round ${index + 1}: Correctly solved (time: ${timeText})`);
                    } else {
                        const badElement = round.querySelector('bad, .bad, [class*="error"], [class*="wrong"]');
                        if (badElement) {
                            const timeText = badElement.textContent || '';
                            console.log(`[LichessTracker] Round ${index + 1}: Incorrectly solved (time: ${timeText})`);
                        }
                    }
                });
                
                console.log(`[LichessTracker] Race results: ${correctlySolved} correctly solved out of ${allRounds.length} total puzzles`);
                
                if (correctlySolved > 0) {
                    addRacePuzzlesToDaily(correctlySolved);
                } else {
                    console.log("[LichessTracker] No correctly solved puzzles in this race - checking for alternative indicators");
                    tryAlternativeExtraction();
                }
            }
            
            function tryAlternativeExtraction() {
                console.log("[LichessTracker] Trying alternative puzzle count extraction");
                
                // Look for any number indicators that might show solved count
                const numberElements = document.querySelectorAll('[class*="score"], [class*="point"], [class*="result"]');
                let foundCount = 0;
                
                for (const element of numberElements) {
                    const text = element.textContent;
                    const numbers = text.match(/\d+/);
                    if (numbers) {
                        const num = parseInt(numbers[0], 10);
                        if (num > 0 && num <= 20) { // Reasonable range for race puzzles
                            foundCount = Math.max(foundCount, num);
                        }
                    }
                }
                
                if (foundCount > 0) {
                    console.log(`[LichessTracker] Alternative extraction found: ${foundCount} puzzles`);
                    addRacePuzzlesToDaily(foundCount);
                } else {
                    console.log("[LichessTracker] Could not determine puzzle count - assuming 1 puzzle completed");
                    addRacePuzzlesToDaily(1); // Minimum assumption
                }
            }
            
            // Start the extraction process
            attemptExtraction();
        }
        
        function addRacePuzzlesToDaily(racePuzzleCount) {
            console.log(`[LichessTracker] Adding ${racePuzzleCount} race puzzles to daily count`);
            
            // Get current racer puzzles count and add new ones
            const currentRacerPuzzles = readGMNumber(keyRacerPuzzles) || 0;
            const newRacerPuzzles = currentRacerPuzzles + racePuzzleCount;
            
            // Store updated racer puzzles
            writeGMNumber(keyRacerPuzzles, newRacerPuzzles);
            
            // Get current daily count (should include existing racer puzzles)
            const currentDaily = readGMNumber(keyDailyCount) || 0;
            const newDaily = currentDaily + racePuzzleCount;
            
            // Update daily count
            writeGMNumber(keyDailyCount, newDaily);
            
            // Update cache
            const newUnlockRemaining = Math.max(minTasksPerDay - newDaily, 0);
            writeGMNumber(keyCachedSolved, newDaily);
            writeGMNumber(keyCachedUnlock, newUnlockRemaining);
            
            // Update timestamp for background sync protection
            const keyLastUpdate = `last_update_${COMPATIBILITY_ID}_${dateKey}`;
            GM_setValue(keyLastUpdate, Date.now());
            
            console.log(`[LichessTracker] Updated counts - Daily: ${currentDaily} -> ${newDaily}, Racer: ${currentRacerPuzzles} -> ${newRacerPuzzles}, Remaining: ${newUnlockRemaining}`);
            
            // Enhanced cross-script communication
            // Method 1: Custom event
            try {
                const event = new CustomEvent('lichessTrackerUpdate', {
                    detail: {
                        solved: newDaily,
                        courseId: COMPATIBILITY_ID,
                        date: dateKey,
                        key: keyDailyCount,
                        timestamp: Date.now(),
                        source: 'racer'
                    }
                });
                window.dispatchEvent(event);
                console.log(`[LichessTracker] Dispatched custom event with solved=${newDaily}`);
            } catch (e) {
                console.error(`[LichessTracker] Failed to dispatch custom event:`, e);
            }
            
            // Method 2: DOM element
            try {
                let dataElement = document.getElementById('lichess-tracker-data');
                if (!dataElement) {
                    dataElement = document.createElement('div');
                    dataElement.id = 'lichess-tracker-data';
                    dataElement.style.display = 'none';
                    document.body.appendChild(dataElement);
                }
                dataElement.setAttribute('data-solved', newDaily);
                dataElement.setAttribute('data-course-id', COMPATIBILITY_ID);
                dataElement.setAttribute('data-date', dateKey);
                dataElement.setAttribute('data-key', keyDailyCount);
                console.log(`[LichessTracker] Updated DOM element with data: solved=${newDaily}, key=${keyDailyCount}`);
            } catch (e) {
                console.error(`[LichessTracker] Failed to update DOM element:`, e);
            }
            
            // Method 3: Window global
            try {
                window.lichessTrackerData = {
                    solved: newDaily,
                    courseId: COMPATIBILITY_ID,
                    date: dateKey,
                    key: keyDailyCount,
                    timestamp: Date.now()
                };
                console.log(`[LichessTracker] Set window.lichessTrackerData with solved=${newDaily}`);
            } catch (e) {
                console.error(`[LichessTracker] Failed to set window global:`, e);
            }
            
            // Method 4: localStorage backup
            try {
                const data = {
                    solved: newDaily,
                    courseId: COMPATIBILITY_ID,
                    date: dateKey,
                    key: keyDailyCount,
                    timestamp: Date.now()
                };
                localStorage.setItem('lichess_tracker_data', JSON.stringify(data));
                console.log(`[LichessTracker] Set localStorage backup with solved=${newDaily}`);
            } catch (e) {
                console.error(`[LichessTracker] Failed to set localStorage:`, e);
            }
            
            // Show notification
            showRaceCompletionNotification(racePuzzleCount, newDaily, newUnlockRemaining);
            
            // Trigger progress update if available
            if (typeof window.lichessTrackerUpdateProgress === 'function') {
                setTimeout(() => {
                    window.lichessTrackerUpdateProgress();
                }, 1000);
            }
            
            // Force update other dependent systems
            setTimeout(() => {
                console.log(`[LichessTracker] Triggering system-wide data refresh after race completion`);
                
                // Trigger message control refresh if available
                const forms = document.querySelectorAll('.msg-app__convo__post, form.form3.reply');
                forms.forEach(form => {
                    if (form.dataset.msgCtrlInit) {
                        const refreshEvent = new CustomEvent('refreshMessageControl');
                        form.dispatchEvent(refreshEvent);
                    }
                });
            }, 2000);
        }
        
    })();
    
    // Background data update to ensure GM storage is always current
    // This runs regardless of page to keep message control script up to date
    setTimeout(() => {
        console.log("[LichessTracker] Background update of GM storage");
        const dateKey = getTodayDateString();
        const keyDailyCount = `daily_solved_${COMPATIBILITY_ID}_${dateKey}`;
        const keyRacerPuzzles = `racer_puzzles_${COMPATIBILITY_ID}_${dateKey}`;
        const keyLastUpdate = `last_update_${COMPATIBILITY_ID}_${dateKey}`;
        
        // Check if data was recently updated (within last 10 seconds)
        const lastUpdate = GM_getValue(keyLastUpdate, 0);
        const now = Date.now();
        const timeSinceUpdate = now - lastUpdate;
        
        if (timeSinceUpdate < 10000) {
            console.log(`[LichessTracker] Background update skipped - data updated ${Math.round(timeSinceUpdate/1000)}s ago`);
            return;
        }
        
        // Re-use the same fetchTodaysPuzzles logic
        const lichessUsername = 'kazamba';
        GM_xmlhttpRequest({
            method: 'GET',
            url: `https://lichess.org/api/user/${lichessUsername}/activity`,
            onload(response) {
                if (response.status >= 200 && response.status < 300) {
                    try {
                        const activities = JSON.parse(response.responseText);
                        const todayDateString = getTodayDateString();
                        let totalSolvedToday = 0;
                        
                        for (const activity of activities) {
                            if (activity.interval && activity.puzzles && activity.puzzles.score) {
                                const activityDate = new Date(activity.interval.start);
                                const activityDateString = activityDate.getFullYear() + '-' + 
                                    String(activityDate.getMonth() + 1).padStart(2, '0') + '-' + 
                                    String(activityDate.getDate()).padStart(2, '0');
                                
                                if (activityDateString === todayDateString) {
                                    totalSolvedToday += activity.puzzles.score.win || 0;
                                }
                            }
                        }
                        
                        // Add racer puzzles
                        const racerPuzzles = readGMNumber(keyRacerPuzzles) || 0;
                        totalSolvedToday += racerPuzzles;
                        
                        const currentStored = readGMNumber(keyDailyCount) || 0;
                        if (currentStored !== totalSolvedToday) {
                            writeGMNumber(keyDailyCount, totalSolvedToday);
                            GM_setValue(keyLastUpdate, now); // Track when we updated
                            console.log(`[LichessTracker] Background update - GM key '${keyDailyCount}' updated: ${currentStored} -> ${totalSolvedToday}`);
                        } else {
                            console.log(`[LichessTracker] Background update - GM key '${keyDailyCount}' already current: ${totalSolvedToday}`);
                        }
                    } catch (error) {
                        console.error("[LichessTracker] Background update error:", error);
                    }
                }
            },
            onerror(err) {
                console.error("[LichessTracker] Background update request error:", err);
            }
        });
    }, 2000); // Wait 2 seconds after page load

})();