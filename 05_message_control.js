// ==UserScript==
// @name         05_message_control - Контроль сообщений по задачам
// @namespace    http://tampermonkey.net/
// @version      1.5
// @description  Универсальный контроль отправки сообщений на основе количества решённых задач. Автоматически определяет активный трекер (ChessKing или Lichess)
// @match        https://lichess.org/inbox/*
// @match        https://lichess.org/forum/*
// @match        https://lichess.org/team/*/pm
// @match        https://lichess.org/team/*/pm-all
// @match        https://lichess.org/team/*/messages
// @match        https://lichess.org/team/*/forum/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // ==============================
    // === Settings ===
    // ==============================
    const tasksPerMessage = 10;     // Tasks required per message (updated to match user's settings)
    const INFO_CLASS = 'message-control-indicator';
    const DAILY_UNLOCK_FLAG_PREFIX = 'daily_unlock_flag';

    // =================================
    // === Helper Functions ===
    // =================================
    function getTodayDateString() {
        const now = new Date();
        const y   = now.getFullYear();
        const m   = String(now.getMonth() + 1).padStart(2, '0');
        const d   = String(now.getDate()).padStart(2, '0');
        const result = `${y}-${m}-${d}`;
        console.log(`[MessageControl] getTodayDateString() calculated: ${result} (raw Date: ${now})`);
        return result;
    }

    function readGMNumber(key) {
        const v = GM_getValue(key, null);
        const result = v === null ? null : (isNaN(parseInt(v, 10)) ? null : parseInt(v, 10));
        console.log(`[MessageControl] GM_READ: '${key}' = '${v}' -> ${result} (${typeof v})`);
        return result;
    }

    // Enhanced debugging function to check GM storage state
    function debugGMStorage() {
        console.log(`[MessageControl] === GM Storage Debug ===`);
        
        // Try to read all possible keys and show their values
        const testKeys = [
            'daily_solved_72_2025-08-26',
            'tracker_test_communication',
            'lichess_tracker_date',
            'last_update_72_2025-08-26'
        ];
        
        testKeys.forEach(key => {
            const rawValue = GM_getValue(key, 'KEY_NOT_FOUND');
            console.log(`[MessageControl] Debug key '${key}': '${rawValue}' (type: ${typeof rawValue})`);
        });
        
        // Try to write and read back a test value
        const testKey = 'message_control_test_' + Date.now();
        GM_setValue(testKey, '999');
        const readBack = GM_getValue(testKey, null);
        console.log(`[MessageControl] Test write/read - Wrote '999', read back '${readBack}'`);
        
        // List all available GM keys (if possible)
        try {
            console.log(`[MessageControl] Available GM functions: setValue=${typeof GM_setValue}, getValue=${typeof GM_getValue}`);
        } catch(e) {
            console.log(`[MessageControl] GM function check error:`, e);
        }
        
        console.log(`[MessageControl] === End GM Storage Debug ===`);
    }

    function writeGMNumber(key, num) {
        GM_setValue(key, String(num));
    }

    function getDailyUnlockFlagKey(courseId, dateKey) {
        return `${DAILY_UNLOCK_FLAG_PREFIX}_${courseId}_${dateKey}`;
    }

    function isDailyUnlockFlagActive(courseId, dateKey) {
        return GM_getValue(getDailyUnlockFlagKey(courseId, dateKey), '0') === '1';
    }

    // === Message control logic ===
    (function() {
        // 0) URL guard: only work on needed pages
        const path        = location.pathname;
        const isInbox     = path.startsWith('/inbox/');
        const isForum     = path.startsWith('/forum/');
        const isForumNew  = /^\/forum\/[^\/]+\/new/.test(path);
        const isTeamForum = /^\/team\/[^\/]+\/forum\//.test(path);
        const isTeamPM    = /^\/team\/[^\/]+\/(pm|messages)/.test(path);
        if (!(isInbox || isForum || isForumNew || isTeamForum || isTeamPM)) return;

        // 1) Auto-detect which tracker is active by checking GM keys
        const dateKey = getTodayDateString();
        
        // Check today and recent dates in case of date mismatches
        const datesToCheck = [];
        for (let i = 0; i <= 2; i++) {
            const checkDate = new Date();
            checkDate.setDate(checkDate.getDate() + i); // today, tomorrow, day after
            const y = checkDate.getFullYear();
            const m = String(checkDate.getMonth() + 1).padStart(2, '0');
            const d = String(checkDate.getDate()).padStart(2, '0');
            datesToCheck.push(`${y}-${m}-${d}`);
        }
        for (let i = 1; i <= 2; i++) {
            const checkDate = new Date();
            checkDate.setDate(checkDate.getDate() - i); // yesterday, day before
            const y = checkDate.getFullYear();
            const m = String(checkDate.getMonth() + 1).padStart(2, '0');
            const d = String(checkDate.getDate()).padStart(2, '0');
            datesToCheck.push(`${y}-${m}-${d}`);
        }
        
        console.log(`[MessageControl] Will check dates: ${datesToCheck.join(', ')}`);
        
        // Test GM storage isolation by trying to read a known key from tracker script
        const testKey = 'lichess_tracker_date';
        const testValue = GM_getValue(testKey, null);
        console.log(`[MessageControl] Storage test - Can read tracker date key '${testKey}': '${testValue}'`);
        
        // Also test for the communication key
        const commKey = 'tracker_test_communication';
        const commValue = GM_getValue(commKey, null);
        console.log(`[MessageControl] Storage test - Can read tracker communication key '${commKey}': '${commValue}'`);
        
        // Run full GM storage debug
        debugGMStorage();
        
        const possibleKeys = [];
        for (const date of datesToCheck) {
            possibleKeys.push(`daily_solved_72_${date}`);
        }
        
        let activeKey = null;
        let activeSolved = 0;
        let dataReceivedFromEvent = false; // Track if we got data from custom event
        
        const messageFormSelectors = [
            '.msg-app__convo__post',                      // личные сообщения
            'form.form3.reply',                           // ответы в форуме
            'form.form3:not(.reply)',                     // создание тем
            'form#team-message-form',                     // командные рассылки (старый вариант)
            'form.team-message',                          // командные рассылки (новый вариант)
            'form[action*="/team/"][action*="/pm"]',      // дополнительные формы команды
            'form[action*="/team/"][action*="/messages"]',
            'form[action*="/inbox/"]'
        ];

        function extractDateFromKey(key) {
            if (!key) return null;
            const match = key.match(/daily_solved_\d+_(\d{4}-\d{2}-\d{2})/);
            return match ? match[1] : null;
        }

        function isKeyForDate(key, targetDate) {
            const keyDate = extractDateFromKey(key);
            return keyDate === targetDate;
        }

        function forEachMessageForm(callback) {
            messageFormSelectors.forEach(selector => {
                const forms = document.querySelectorAll(selector);
                forms.forEach(form => callback(form));
            });
        }

        function refreshAllInitializedForms() {
            forEachMessageForm(form => {
                if (form.dataset.msgCtrlInit) {
                    const refreshEvent = new CustomEvent('refreshMessageControl');
                    form.dispatchEvent(refreshEvent);
                }
            });
        }

        const todayKey = possibleKeys[0];
        const todaySolvedRaw = readGMNumber(todayKey);
        let fallbackKey = null;
        let fallbackSolved = 0;

        console.log(`[MessageControl] Checking possible keys for date: ${dateKey}`);
        possibleKeys.forEach((key, index) => {
            const solved = readGMNumber(key) || 0;
            console.log(`[MessageControl] Key '${key}' has value: ${solved}`);
            if (index > 0 && solved > fallbackSolved) {
                fallbackSolved = solved;
                fallbackKey = key;
            }
        });

        if (todaySolvedRaw !== null && !Number.isNaN(todaySolvedRaw)) {
            activeKey = todayKey;
            activeSolved = todaySolvedRaw;
            console.log(`[MessageControl] Using today's key ${todayKey} with value ${activeSolved}`);
        } else if (fallbackKey && fallbackSolved > 0) {
            activeKey = fallbackKey;
            activeSolved = fallbackSolved;
            console.log(`[MessageControl] Today's key missing, using fallback ${fallbackKey} with value ${activeSolved}`);
        } else {
            activeKey = todayKey;
            activeSolved = 0;
            console.log(`[MessageControl] No valid data found, defaulting to today's key ${todayKey}`);
        }
        if (typeof activeSolved !== 'number' || Number.isNaN(activeSolved)) {
            activeSolved = 0;
        }
        
        // If no data found, wait a bit and retry (in case tracker script is still loading)
        if (activeSolved === 0 && !dataReceivedFromEvent) {
            console.log(`[MessageControl] No data found yet, will retry in 3 seconds...`);
            setTimeout(() => {
                console.log(`[MessageControl] Retrying data check (attempt 1)...`);
                debugGMStorage(); // Run debug again
                if (!dataReceivedFromEvent) {
                    activeSolved = 0; // Only reset if no event data
                    activeKey = null;
                }
                for (const key of possibleKeys) {
                    const solved = readGMNumber(key) || 0;
                    console.log(`[MessageControl] Retry 1 - Key '${key}' has value: ${solved}`);
                    if (solved > activeSolved) {
                        activeSolved = solved;
                        activeKey = key;
                    }
                }
                if (activeSolved > 0) {
                    console.log(`[MessageControl] Found data on retry 1: ${activeSolved} puzzles`);
                    initializeMessageControl();
                } else {
                    console.log(`[MessageControl] Still no data, trying one more time in 5 seconds...`);
                    setTimeout(() => {
                        console.log(`[MessageControl] Retrying data check (attempt 2)...`);
                        debugGMStorage(); // Run debug again
                        if (!dataReceivedFromEvent) {
                            activeSolved = 0; // Only reset if no event data
                            activeKey = null;
                        }
                        for (const key of possibleKeys) {
                            const solved = readGMNumber(key) || 0;
                            console.log(`[MessageControl] Retry 2 - Key '${key}' has value: ${solved}`);
                            if (solved > activeSolved) {
                                activeSolved = solved;
                                activeKey = key;
                            }
                        }
                        if (activeSolved > 0) {
                            console.log(`[MessageControl] Found data on retry 2: ${activeSolved} puzzles`);
                            initializeMessageControl();
                        } else {
                            console.log(`[MessageControl] No data found after 2 retries, trying direct key access`);
                            // Try accessing the exact key we know should exist
                            const directKey = 'daily_solved_72_2025-08-26';
                            const directValue = GM_getValue(directKey, 'NOT_FOUND');
                            console.log(`[MessageControl] Direct access to '${directKey}': '${directValue}'`);
                            
                            // Try to trigger the tracker script by setting a signal
                            GM_setValue('message_control_requesting_data', Date.now());
                            console.log(`[MessageControl] Set signal for tracker script to update data`);
                            
                            initializeMessageControl();
                        }
                    }, 5000);
                }
            }, 3000);
        }        
        
        function initializeMessageControl() {
            // Re-check for active data if not set
            if (!activeKey || activeSolved === 0) {
                for (const key of possibleKeys) {
                    const solved = readGMNumber(key) || 0;
                    if (solved > activeSolved) {
                        activeSolved = solved;
                        activeKey = key;
                    }
                }
            }
            
            // Default to first key if none found
            if (!activeKey) {
                activeKey = possibleKeys[0];
            }
            
            // Extract the courseId and date from the active key
            const keyParts = activeKey.split('_'); // ['daily', 'solved', '72', '2025-08-26']
            const courseId = keyParts[2]; // Extract '72'
            const actualDate = keyParts[3]; // Extract the actual date from the key
            
            console.log(`[MessageControl] Auto-detected active tracker key: ${activeKey} (courseId: ${courseId}, date: ${actualDate})`);
            
            const keyDailyCount   = activeKey;
            const keyMessageCount = `messages_sent_${courseId}_${actualDate}`; // Use actual date, not today's date
            
            if (readGMNumber(keyMessageCount) === null) {
                writeGMNumber(keyMessageCount, 0);
            }

            // 2) Counting
            function getCounts() {
                // Try GM storage first, then fall back to activeSolved from cross-script communication
                let solved = readGMNumber(keyDailyCount);
                if (solved === null || solved === 0) {
                    // Check for backup data if main storage returns 0
                    const backupKey = `backup_${keyDailyCount}`;
                    const backupSolved = readGMNumber(backupKey);
                    
                    if (backupSolved > 0) {
                        console.log(`[MessageControl] Using backup data: ${backupSolved} (main storage was ${solved})`);
                        solved = backupSolved;
                    } else if (activeSolved > 0) {
                        solved = activeSolved;
                        console.log(`[MessageControl] GM storage returned ${solved === null ? 'null' : solved}, using activeSolved: ${activeSolved}`);
                    } else {
                        // Last resort: check if we had a previous valid value
                        const previousKey = `previous_${keyDailyCount}`;
                        const previousSolved = readGMNumber(previousKey);
                        if (previousSolved > 0) {
                            console.log(`[MessageControl] Using previous session data: ${previousSolved}`);
                            solved = previousSolved;
                        } else {
                            solved = 0;
                        }
                    }
                }
                
                // Store current value for future fallback
                if (solved > 0) {
                    const previousKey = `previous_${keyDailyCount}`;
                    writeGMNumber(previousKey, solved);
                }
                
                const sent      = readGMNumber(keyMessageCount) || 0;
                const allowed   = Math.floor(solved / tasksPerMessage);
                const remaining = allowed - sent;
                const now = new Date();
                const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                const unlockGranted = isDailyUnlockFlagActive(courseId, todayKey);
                
                // Debug logging
                console.log(`[MessageControl] Debug - Solved: ${solved}, Sent: ${sent}, Allowed: ${allowed}, Remaining: ${remaining}`);
                console.log(`[MessageControl] Reading from key: ${keyDailyCount}`);
                
                return { solved, allowed, sent, remaining, unlockGranted };
            }

            // 3) Form initialization
            function initFormControl(form) {
                if (!form) return;
                const ta  = form.querySelector('textarea');
                const btn = form.querySelector('button[type="submit"], button:not([type]), input[type="submit"]');
                if (!ta || !btn) return;

                function composeInfoText(solved, allowed, remaining, tasksToNext, unlockGranted) {
                    if (!unlockGranted) {
                        return 'Сообщения заблокированы до выполнения гонок (флаг 09_2 не активен)';
                    }
                    return remaining > 0
                        ? `Доступно сообщений: ${remaining} из ${allowed} (решено ${solved} задач)`
                        : `Нет доступных сообщений. Решите ещё ${tasksToNext} задач (решено ${solved} задач)`;
                }

                if (form.dataset.msgCtrlInit === '1') {
                    if (!form.querySelector(`.${INFO_CLASS}`)) {
                        const info = document.createElement('div');
                        info.className = INFO_CLASS;
                        info.style.cssText = 'font-size:12px;color:#c00;margin-top:4px;margin-left:4px;';
                        ta.parentNode.insertBefore(info, ta.nextSibling);
                        const { solved, allowed, remaining, unlockGranted } = getCounts();
                        const tasksToNext = tasksPerMessage - (solved % tasksPerMessage);
                        info.textContent = composeInfoText(solved, allowed, remaining, tasksToNext, unlockGranted);
                    }
                    return;
                }

                let lastTextareaValue = ta.value;
                let messagePending = false;
                let sendIntent = false;

                // Create indicator next to textarea
                const info = document.createElement('div');
                info.className = INFO_CLASS;
                info.style.cssText = 'font-size:12px;color:#c00;margin-top:4px;margin-left:4px;';
                ta.parentNode.insertBefore(info, ta.nextSibling);

                // State update
                function refresh() {
                    const { solved, allowed, remaining, unlockGranted } = getCounts();
                    const tasksToNext = tasksPerMessage - (solved % tasksPerMessage);
                    const lockedByFlag = !unlockGranted;
                    ta.disabled  = lockedByFlag || remaining <= 0;
                    btn.disabled = ta.disabled;
                    if (lockedByFlag) {
                        console.log('[MessageControl] Blocking messaging — daily unlock flag inactive');
                    }
                    info.textContent = composeInfoText(solved, allowed, remaining, tasksToNext, unlockGranted);
                }
                refresh();

                // Block submit when no messages remaining
                form.addEventListener('submit', e => {
                    const cnt = getCounts();
                    console.log(`[MessageControl] Form submit event triggered! Remaining: ${cnt.remaining}, Unlock flag: ${cnt.unlockGranted}`);
                    if (cnt.remaining <= 0 || !cnt.unlockGranted) {
                        e.preventDefault();
                        e.stopImmediatePropagation();
                        if (!cnt.unlockGranted) {
                            console.log('[MessageControl] Blocked form submission - unlock flag inactive');
                        } else {
                            console.log('[MessageControl] Blocked form submission - no messages remaining');
                        }
                        sendIntent = false;
                    } else {
                        // Allow submission and increment counter
                        console.log(`[MessageControl] Allowing form submission, incrementing counter from ${cnt.sent} to ${cnt.sent + 1}`);
                        sendIntent = true;
                        messagePending = true; // Prevent duplicate counting from AJAX detectors
                        writeGMNumber(keyMessageCount, cnt.sent + 1);
                        setTimeout(() => {
                            refresh();
                            console.log(`[MessageControl] Form refreshed after submission`);
                            messagePending = false;
                            sendIntent = false;
                        }, 500); // Increased delay for better detection
                    }
                }, true);

                // Enhanced AJAX detection using MutationObserver
                // Monitor textarea changes to detect message sending
                const observer = new MutationObserver((mutations) => {
                    const currentValue = ta.value;
                    // If textarea was cleared and we had content before, message was likely sent
                    if (lastTextareaValue.trim() !== '' && currentValue.trim() === '' && !messagePending && sendIntent) {
                        console.log(`[MessageControl] Textarea cleared detected - message likely sent via AJAX`);
                        messagePending = true;
                        setTimeout(() => {
                            const newCount = readGMNumber(keyMessageCount) || 0;
                            console.log(`[MessageControl] AJAX detection - incrementing counter from ${newCount} to ${newCount + 1}`);
                            writeGMNumber(keyMessageCount, newCount + 1);
                            refresh();
                            messagePending = false;
                            sendIntent = false;
                        }, 100);
                    }
                    lastTextareaValue = currentValue;
                });
                
                // Observe textarea content changes
                observer.observe(ta, {
                    attributes: true,
                    attributeFilter: ['value'],
                    characterData: true,
                    childList: true,
                    subtree: true
                });
                
                // Also monitor value changes via input event
                ta.addEventListener('input', () => {
                    const currentValue = ta.value;
                    if (lastTextareaValue.trim() !== '' && currentValue.trim() === '' && !messagePending && sendIntent) {
                        console.log(`[MessageControl] Input event - textarea cleared, message sent`);
                        messagePending = true;
                        setTimeout(() => {
                            const newCount = readGMNumber(keyMessageCount) || 0;
                            console.log(`[MessageControl] Input detection - incrementing counter from ${newCount} to ${newCount + 1}`);
                            writeGMNumber(keyMessageCount, newCount + 1);
                            refresh();
                            messagePending = false;
                            sendIntent = false;
                        }, 100);
                    }
                    lastTextareaValue = currentValue;
                });

                // Additional detection methods for AJAX submissions
                // Monitor button clicks (only for blocking, not counting)
                btn.addEventListener('click', e => {
                    console.log(`[MessageControl] Button clicked! Current textarea value: '${ta.value.slice(0, 50)}...'`);
                    const cnt = getCounts();
                    console.log(`[MessageControl] Button click - Current count: Solved=${cnt.solved}, Sent=${cnt.sent}, Remaining=${cnt.remaining}`);
                    if (cnt.remaining <= 0 || !cnt.unlockGranted) {
                        e.preventDefault();
                        e.stopImmediatePropagation();
                        if (!cnt.unlockGranted) {
                            console.log('[MessageControl] Blocked button click - unlock flag inactive');
                        } else {
                            console.log(`[MessageControl] Blocked button click - no messages remaining`);
                        }
                        sendIntent = false;
                    } else {
                        console.log(`[MessageControl] Button click allowed - counting handled by other detection methods`);
                        sendIntent = true;
                    }
                }, true);

                // Monitor Enter key in textarea (only for blocking, not counting)
                ta.addEventListener('keydown', e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        console.log(`[MessageControl] Enter key pressed! Current textarea value: '${ta.value.slice(0, 50)}...'`);
                        const cnt = getCounts();
                        console.log(`[MessageControl] Enter key - Current count: Solved=${cnt.solved}, Sent=${cnt.sent}, Remaining=${cnt.remaining}`);
                        if (cnt.remaining <= 0 || !cnt.unlockGranted) {
                            e.preventDefault();
                            e.stopImmediatePropagation();
                            if (!cnt.unlockGranted) {
                                console.log('[MessageControl] Blocked Enter key - unlock flag inactive');
                            } else {
                                console.log(`[MessageControl] Blocked Enter key - no messages remaining`);
                            }
                            sendIntent = false;
                        } else {
                            console.log(`[MessageControl] Enter key allowed - counting handled by other detection methods`);
                            sendIntent = true;
                        }
                    }
                });

                // Listen for refresh events from custom event handler
                form.addEventListener('refreshMessageControl', () => {
                    console.log(`[MessageControl] Refreshing form display`);
                    refresh();
                });

                form.dataset.msgCtrlInit = '1';
            }

            // 4) Continuous polling (more frequent), looking for all supported forms
            setInterval(() => {
                forEachMessageForm(form => initFormControl(form));
            }, 100); // Check every 100ms for faster response
        }
        
        // Set up periodic data checking to catch updates from tracker script
        function startPeriodicDataCheck() {
            let dataCheckAttempts = 0;
            const maxDataCheckAttempts = 30; // Check for 30 seconds
            
            console.log(`[MessageControl] Starting periodic data check...`);
            
            // ADD: Listen for custom events from tracker script
            window.addEventListener('lichessTrackerUpdate', (event) => {
                console.log(`[MessageControl] Received custom event with data:`, event.detail);
                if (!event.detail || event.detail.solved <= 0) return;

                const incomingKey = event.detail.key || `daily_solved_${event.detail.courseId}_${event.detail.date}`;
                const incomingDate = event.detail.date || extractDateFromKey(incomingKey);

                if (incomingDate !== dateKey) {
                    console.log(`[MessageControl] Ignoring event data for ${incomingDate}, waiting for ${dateKey}`);
                    return;
                }

                activeSolved = event.detail.solved;
                activeKey = incomingKey;
                dataReceivedFromEvent = true; // Mark that we got data from event
                console.log(`[MessageControl] Event provided: solved=${activeSolved}, key=${activeKey}`);
                clearInterval(dataCheckInterval);
                initializeMessageControl();
                // Immediately refresh any existing forms
                setTimeout(() => {
                    refreshAllInitializedForms();
                }, 100);
            });
            
            // ADD: Function to check DOM elements for data
            function checkDOMForData() {
                // Check for DOM element with tracker data
                const dataElement = document.getElementById('lichess-tracker-data');
                if (dataElement) {
                    const solved = parseInt(dataElement.getAttribute('data-solved'), 10);
                    const courseId = dataElement.getAttribute('data-course-id');
                    const date = dataElement.getAttribute('data-date');
                    const key = dataElement.getAttribute('data-key');

                    const keyDate = date || extractDateFromKey(key);
                    if (solved > 0 && keyDate === dateKey) {
                        console.log(`[MessageControl] Found DOM element with data: solved=${solved}, key=${key}`);
                        activeSolved = solved;
                        activeKey = key;
                        dataReceivedFromEvent = true; // Mark that we got data from alternative source
                        return true;
                    }
                    if (solved > 0) {
                        console.log(`[MessageControl] Ignoring DOM data for different date (${keyDate})`);
                    }
                }

                // Check window global
                if (window.lichessTrackerData && window.lichessTrackerData.solved > 0) {
                    const globalDate = window.lichessTrackerData.date || extractDateFromKey(window.lichessTrackerData.key);
                    if (globalDate === dateKey) {
                        console.log(`[MessageControl] Found window global data:`, window.lichessTrackerData);
                        activeSolved = window.lichessTrackerData.solved;
                        activeKey = window.lichessTrackerData.key;
                        dataReceivedFromEvent = true; // Mark that we got data from alternative source
                        return true;
                    }
                    console.log(`[MessageControl] Ignoring window global data for ${globalDate}`);
                }

                // Check localStorage
                try {
                    const localData = localStorage.getItem('lichess_tracker_data');
                    if (localData) {
                        const data = JSON.parse(localData);
                        const localDate = data.date || extractDateFromKey(data.key);
                        if (data.solved > 0 && localDate === dateKey) {
                            console.log(`[MessageControl] Found localStorage data:`, data);
                            activeSolved = data.solved;
                            activeKey = data.key;
                            dataReceivedFromEvent = true; // Mark that we got data from alternative source
                            return true;
                        }
                        if (data.solved > 0) {
                            console.log(`[MessageControl] Ignoring localStorage data for ${localDate}`);
                        }
                    }
                } catch (e) {
                    console.log(`[MessageControl] localStorage check failed:`, e);
                }
                
                return false;
            }
            const dataCheckInterval = setInterval(() => {
                dataCheckAttempts++;
                console.log(`[MessageControl] Periodic check ${dataCheckAttempts}/${maxDataCheckAttempts}`);
                
                // First, try DOM-based detection
                if (checkDOMForData()) {
                    console.log(`[MessageControl] DOM check found data: solved=${activeSolved}`);
                    clearInterval(dataCheckInterval);
                    initializeMessageControl();
                    return;
                }
                
                // Check for data ready signals from tracker
                const dataReadySignal = GM_getValue('tracker_data_ready', null);
                if (dataReadySignal) {
                    console.log(`[MessageControl] Found tracker data ready signal: ${dataReadySignal}`);
                    GM_setValue('tracker_data_ready', null); // Clear the signal
                    clearInterval(dataCheckInterval);

                    // Parse the signal to get the latest data
                    const parts = dataReadySignal.split(':'); // format: key:value:timestamp
                    if (parts.length >= 2) {
                        activeKey = parts[0];
                        activeSolved = parseInt(parts[1], 10) || 0;
                        const signalDate = extractDateFromKey(activeKey);
                        if (signalDate !== dateKey) {
                            console.log(`[MessageControl] Ignoring signal for ${signalDate}`);
                            activeKey = todayKey;
                            activeSolved = todaySolvedRaw || 0;
                        } else {
                            console.log(`[MessageControl] Signal provided: key=${activeKey}, solved=${activeSolved}`);
                        }
                    }

                    initializeMessageControl();
                    return;
                }
                
                // Check for any of our expected keys (fallback)
                let foundData = false;
                for (const key of possibleKeys) {
                    const solved = readGMNumber(key) || 0;
                    if (solved > 0) {
                        console.log(`[MessageControl] Periodic check found data: key '${key}' = ${solved}`);
                        foundData = true;
                        activeSolved = solved;
                        activeKey = key;
                        break;
                    }
                }
                
                if (foundData) {
                    clearInterval(dataCheckInterval);
                    initializeMessageControl();
                    return;
                }
                
                if (dataCheckAttempts >= maxDataCheckAttempts) {
                    console.log(`[MessageControl] Periodic check timeout after ${maxDataCheckAttempts} attempts`);
                    clearInterval(dataCheckInterval);
                    initializeMessageControl(); // Initialize with defaults
                }
            }, 1000); // Check every second
        }
        
        // If we found data immediately, initialize right away, otherwise start periodic checking
        if (activeSolved > 0) {
            console.log(`[MessageControl] Found data immediately: ${activeSolved} puzzles`);
            initializeMessageControl();
        } else {
            // Check DOM immediately before starting periodic checks
            function checkDOMForDataImmediate() {
                const dataElement = document.getElementById('lichess-tracker-data');
                if (dataElement) {
                    const solved = parseInt(dataElement.getAttribute('data-solved'), 10);
                    const key = dataElement.getAttribute('data-key');
                    const keyDate = extractDateFromKey(key);
                    if (solved > 0 && keyDate === dateKey) {
                        console.log(`[MessageControl] Found immediate DOM data: solved=${solved}, key=${key}`);
                        activeSolved = solved;
                        activeKey = key;
                        dataReceivedFromEvent = true; // Mark that we got data from alternative source
                        return true;
                    }
                    if (solved > 0) {
                        console.log(`[MessageControl] Immediate DOM data ignored for ${keyDate}`);
                    }
                }
                if (window.lichessTrackerData && window.lichessTrackerData.solved > 0) {
                    const globalDate = window.lichessTrackerData.date || extractDateFromKey(window.lichessTrackerData.key);
                    if (globalDate === dateKey) {
                        console.log(`[MessageControl] Found immediate window data:`, window.lichessTrackerData);
                        activeSolved = window.lichessTrackerData.solved;
                        activeKey = window.lichessTrackerData.key;
                        dataReceivedFromEvent = true; // Mark that we got data from alternative source
                        return true;
                    }
                    console.log(`[MessageControl] Immediate window data ignored for ${globalDate}`);
                }
                return false;
            }
            
            if (checkDOMForDataImmediate()) {
                console.log(`[MessageControl] Found immediate data via DOM: ${activeSolved} puzzles`);
                initializeMessageControl();
            } else {
                startPeriodicDataCheck();
            }
        }
    })();

})();
