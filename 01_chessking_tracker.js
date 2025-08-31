// ==UserScript==
// @name         01_chessking_tracker - Основной трекер ChessKing
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Основной трекер задач ChessKing, редиректы и мониторинг прогресса с GM хранилищем
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
    // === ChessKing Settings ===
    // ==============================
    const courseId            = 72;     // ChessKing course ID
    let   minTasksPerDay      = 2000;   // Minimum tasks per day

    // =================================
    // === Helper Functions ===
    // =================================
    function getTodayDateString() {
        const now = new Date();
        const y   = now.getFullYear();
        const m   = String(now.getMonth() + 1).padStart(2, '0');
        const d   = String(now.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    function readGMNumber(key) {
        const v = GM_getValue(key, null);
        if (v === null) {
            return null;
        }
        const num = parseInt(v, 10);
        return isNaN(num) ? null : num;
    }

    function writeGMNumber(key, num) {
        GM_setValue(key, String(num));
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

    // Reads current solved count directly from DOM /tasks page
    function readSolvedCountFromDOM() {
        const solvedElem = document.querySelector('span.course-overview__stats-item[title*="Решенное"] span');
        if (solvedElem) {
            const text = solvedElem.innerText.split('/')[0].trim();
            const n = parseInt(text, 10);
            return isNaN(n) ? null : n;
        }
        return null;
    }

    // ===============================
    // === CHESSKING TRACKER LOGIC ===
    // ===============================
    (function() {
        const coursePageBase = `https://learn.chessking.com/learning/course/${courseId}`;
        const tasksHashURL   = `${coursePageBase}/tasks#`;
        const dateKey        = getTodayDateString();

        // GM keys for current date:
        const keyInitial      = `initial_solved_${courseId}_${dateKey}`;   // initialVal
        const keyDailyCount   = `daily_solved_${courseId}_${dateKey}`;     // solved today
        const keyCachedSolved = `cached_solved_${courseId}_${dateKey}`;    // cache: solvedToday
        const keyCachedUnlock = `cached_unlock_${courseId}_${dateKey}`;    // cache: unlockRemaining

        const hostname   = window.location.hostname;
        const pathname   = window.location.pathname;
        // Check if current page is /tasks
        const isTasksPage = hostname.endsWith('learn.chessking.com')
                            && pathname.includes(`/learning/course/${courseId}/tasks`);
        // Any other page
        const isOtherPage = !isTasksPage;

        // Reset keys at midnight
        const savedDate = GM_getValue('ck_tracker_date', null);
        if (savedDate !== dateKey) {
            console.log(`[Tracker] New day (${dateKey}) — resetting all GM keys for yesterday`);
            GM_setValue('ck_tracker_date', dateKey);
            GM_setValue(keyInitial, null);
            GM_setValue(keyDailyCount, null);
            GM_setValue(keyCachedSolved, null);
            GM_setValue(keyCachedUnlock, null);
        } else {
            console.log(`[Tracker] Date unchanged (${dateKey}), not resetting GM keys`);
        }

        // If we're on /tasks, immediately clear old cache
        if (isTasksPage) {
            console.log("[Tracker] We're on /tasks → clearing GM keys cached_unlock and cached_solved");
            GM_setValue(keyCachedUnlock, null);
            GM_setValue(keyCachedSolved, null);
        }

        // If NOT /tasks, immediately hide <body> until check
        if (isOtherPage && document.body) {
            document.documentElement.style.backgroundColor = '#fff';
            document.body.style.visibility = 'hidden';
            console.log("[Tracker] Hid body on other page until check");
        }

        console.log(`[Tracker] Script started on: ${window.location.href}`);
        console.log(`[Tracker] isTasksPage=${isTasksPage}, isOtherPage=${isOtherPage}`);

        /**
         * fetchCourseDataViaGM(allowInit)
         *  - allowInit=true and initialVal missing → initialVal=totalSolved, solvedToday=0.
         *  - If initialVal exists → solvedToday = totalSolved - initialVal.
         *  - If allowInit=false and initialVal missing → solvedToday=0.
         *  - Always returns { totalSolved, solvedToday, unlockRemaining }.
         */
        function fetchCourseDataViaGM(allowInit) {
            console.log(`[Tracker][fetchCourseDataViaGM] Starting (allowInit=${allowInit})`);
            return new Promise(resolve => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: coursePageBase,
                    onload(response) {
                        console.log(`[Tracker][fetchCourseDataViaGM] HTTP status: ${response.status}`);
                        if (response.status < 200 || response.status >= 300) {
                            console.warn(`[Tracker][fetchCourseDataViaGM] Invalid status: ${response.status}`);
                            resolve(null);
                            return;
                        }
                        const html = response.responseText;
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(html, 'text/html');

                        const solvedElem = doc.querySelector('span.course-overview__stats-item[title*="Решенное"] span');
                        if (!solvedElem) {
                            console.warn("[Tracker][fetchCourseDataViaGM] 'Solved' element not found");
                            resolve(null);
                            return;
                        }
                        const totalText = solvedElem.innerText.split('/')[0].trim();
                        const totalSolved = parseInt(totalText, 10);
                        console.log(`[Tracker][fetchCourseDataViaGM] totalSolved (from server) = ${totalSolved}`);
                        if (isNaN(totalSolved)) {
                            console.warn("[Tracker][fetchCourseDataViaGM] Failed to parse totalSolved");
                            resolve(null);
                            return;
                        }

                        let initialVal = readGMNumber(keyInitial);
                        let solvedToday;

                        if (initialVal === null) {
                            console.log("[Tracker][fetchCourseDataViaGM] initialVal missing");
                            if (allowInit) {
                                initialVal = totalSolved;
                                writeGMNumber(keyInitial, initialVal);
                                solvedToday = 0;
                                console.log(`[Tracker][fetchCourseDataViaGM] (tasks) initialVal = ${initialVal}, solvedToday = 0`);
                            } else {
                                solvedToday = 0;
                                console.log("[Tracker][fetchCourseDataViaGM] (not /tasks) solvedToday = 0");
                            }
                        } else {
                            solvedToday = Math.max(0, totalSolved - initialVal);
                            console.log(`[Tracker][fetchCourseDataViaGM] initialVal=${initialVal}, solvedToday=${solvedToday}`);
                        }

                        writeGMNumber(keyDailyCount, solvedToday);
                        const unlockRemaining = Math.max(minTasksPerDay - solvedToday, 0);
                        console.log(`[Tracker][fetchCourseDataViaGM] unlockRemaining=${unlockRemaining}`);

                        resolve({ totalSolved, solvedToday, unlockRemaining });
                    },
                    onerror(err) {
                        console.error("[Tracker][fetchCourseDataViaGM] GM_xmlhttpRequest error:", err);
                        resolve(null);
                    }
                });
            });
        }

        // --------------------------------------------
        // 1) If NOT /tasks: check if currently in training time, then GM cache, otherwise fetch and cache, then decide
        // --------------------------------------------
        if (isOtherPage) {
            console.log("[Tracker] Processing non-/tasks page");

            // 1.0) Check if we're currently in training time window (temporary suspension)
            if (isCurrentlyInTrainingTime()) {
                console.log("[Tracker] Currently in training time window (9:00-10:00), temporarily suspending task requirements");
                if (document.body) document.body.style.visibility = '';
                return;
            }

            // 1.1) Read from GM storage `cached_unlock`
            const cachedUnlock = readGMNumber(keyCachedUnlock);
            if (cachedUnlock !== null) {
                console.log(`[Tracker] Using GM cache: cached_unlock = ${cachedUnlock}`);
                if (cachedUnlock > 0) {
                    console.log("[Tracker] cached_unlock > 0 → redirecting to /tasks");
                    window.location.replace(tasksHashURL);
                } else {
                    console.log("[Tracker] cached_unlock = 0 → showing page");
                    if (document.body) document.body.style.visibility = '';
                }
                return;
            }

            // 1.2) No GM cache → single fetchCourseDataViaGM(false)
            console.log("[Tracker] No GM cache, executing fetchCourseDataViaGM(false)");
            fetchCourseDataViaGM(false).then(data => {
                if (!data) {
                    console.log("[Tracker] fetch returned null → showing page");
                    if (document.body) document.body.style.visibility = '';
                    return;
                }
                const { solvedToday, unlockRemaining } = data;
                writeGMNumber(keyCachedSolved, solvedToday);
                writeGMNumber(keyCachedUnlock, unlockRemaining);
                console.log(`[Tracker] After fetch: solvedToday=${solvedToday}, unlockRemaining=${unlockRemaining}`);
                if (unlockRemaining > 0) {
                    console.log("[Tracker] unlockRemaining > 0 → redirecting to /tasks");
                    window.location.replace(tasksHashURL);
                } else {
                    console.log("[Tracker] unlockRemaining = 0 → showing page");
                    if (document.body) document.body.style.visibility = '';
                }
            });
            return;
        }

        // --------------------------------------------
        // 2) If we're on /tasks: wait for DOMContentLoaded → DOM cache initialization + auto-update + UI
        // --------------------------------------------
        if (isTasksPage) {
            console.log("[Tracker] On /tasks → hiding body and waiting for DOMContentLoaded");
            if (document.body) document.body.style.visibility = 'hidden';

            function onTasksPageLoad() {
                console.log("[Tracker] DOMContentLoaded on /tasks");

                // 2.1) Sync cache from DOM
                function syncCacheFromDOM() {
                    const domSolved = readSolvedCountFromDOM();
                    if (domSolved === null) return;

                    let initialVal = readGMNumber(keyInitial);
                    let solvedToday;
                    if (initialVal === null) {
                        initialVal = domSolved;
                        writeGMNumber(keyInitial, initialVal);
                        solvedToday = 0;
                        console.log(`[Tracker](tasks, DOM) initialVal=domSolved=${initialVal}, solvedToday=0`);
                    } else {
                        solvedToday = Math.max(0, domSolved - initialVal);
                        console.log(`[Tracker](tasks, DOM) initialVal=${initialVal}, domSolved=${domSolved}, solvedToday=${solvedToday}`);
                    }
                    writeGMNumber(keyDailyCount, solvedToday);
                    const unlockRemaining = Math.max(minTasksPerDay - solvedToday, 0);
                    writeGMNumber(keyCachedSolved, solvedToday);
                    writeGMNumber(keyCachedUnlock, unlockRemaining);
                    console.log(`[Tracker](tasks, DOM) synced: cached_solved=${solvedToday}, cached_unlock=${unlockRemaining}`);

                    // Update <title>
                    const oldTitle = document.title.replace(/^\d+\s·\s/, '');
                    document.title = `${unlockRemaining} · ${oldTitle}`;
                    console.log(`[Tracker](tasks, DOM) Updated title: "${document.title}"`);
                }

                // Immediately sync cache from DOM
                syncCacheFromDOM();

                // 2.2) Show <body>
                if (document.body) document.body.style.visibility = '';

                // 2.3) Start interval every second to check DOM → sync cache
                console.log("[Tracker] Starting interval every 1 sec for DOM cache sync");
                setInterval(syncCacheFromDOM, 1000);

                // 2.4) Build UI + start fetchAndUpdate
                buildUIandStartUpdates();
            }

            if (document.readyState === 'interactive' || document.readyState === 'complete') {
                onTasksPageLoad();
            } else {
                window.addEventListener('DOMContentLoaded', onTasksPageLoad);
            }
        }

        // =================================
        // === FUNCTION: buildUIandStartUpdates ===
        // =================================
        function buildUIandStartUpdates() {
            console.log("[Tracker] buildUIandStartUpdates: building UI and starting fetchAndUpdate()");

            function fetchAndUpdate() {
                console.log("[Tracker][fetchAndUpdate] Starting fetch + UI update");
                fetchCourseDataViaGM(true).then(data => {
                    if (!data) {
                        console.log("[Tracker][fetchAndUpdate] fetch returned null");
                        return;
                    }
                    const { totalSolved, solvedToday, unlockRemaining } = data;

                    // Update cache (fetch-based)
                    writeGMNumber(keyCachedSolved, solvedToday);
                    writeGMNumber(keyCachedUnlock, unlockRemaining);
                    console.log(`[Tracker][fetchAndUpdate] Fetch: totalSolved=${totalSolved}, solvedToday=${solvedToday}, unlockRemaining=${unlockRemaining}`);

                    // ==== Update <title> ====
                    const oldTitle = document.title.replace(/^\d+\s·\s/, '');
                    document.title = `${unlockRemaining} · ${oldTitle}`;
                    console.log(`[Tracker][fetchAndUpdate] Updated title: "${document.title}"`);

                    // ==== History totalSolved for chart ====
                    let readings = [];
                    try {
                        readings = JSON.parse(localStorage.getItem('ck_readings') || '[]');
                    } catch {
                        readings = [];
                    }
                    readings.push({ time: new Date().toISOString(), solved: totalSolved });
                    if (readings.length > 60) readings = readings.slice(-60);
                    localStorage.setItem('ck_readings', JSON.stringify(readings));
                    console.log(`[Tracker][fetchAndUpdate] Added reading: time=${readings.slice(-1)[0].time}, solved=${readings.slice(-1)[0].solved}`);

                    // ==== Calculate diffs (interval ≤ 90 sec) ====
                    const diffs = [];
                    for (let i = 1; i < readings.length; i++) {
                        const t0 = new Date(readings[i - 1].time).getTime();
                        const t1 = new Date(readings[i].time).getTime();
                        if (t1 - t0 <= 90000) {
                            diffs.push(readings[i].solved - readings[i - 1].solved);
                        }
                    }
                    console.log(`[Tracker][fetchAndUpdate] diffs (last 5): ${diffs.slice(-5)}`);
                    const graphDiffs = diffs.length > 30 ? diffs.slice(-30) : diffs;

                    // ==== Average speed (median of last 10, excluding consecutive 0s) ====
                    let lastTen = diffs.length > 10 ? diffs.slice(-10) : diffs;
                    const filtered = [];
                    for (let i = 0; i < lastTen.length; i++) {
                        if (lastTen[i] === 0 && i > 0 && lastTen[i - 1] === 0) continue;
                        filtered.push(lastTen[i]);
                    }
                    if (filtered.length === 0) filtered.push(...lastTen);

                    let avgPerMin = 0;
                    if (filtered.length) {
                        const sorted = [...filtered].sort((a, b) => a - b);
                        const mid = Math.floor(sorted.length / 2);
                        avgPerMin = (sorted.length % 2)
                            ? sorted[mid]
                            : (sorted[mid - 1] + sorted[mid]) / 2;
                        avgPerMin = Math.round(avgPerMin);
                    }
                    console.log(`[Tracker][fetchAndUpdate] avgPerMin=${avgPerMin}`);

                    // ==== Maximum speed (from positives > avgPerMin) ====
                    const positives = lastTen.filter(x => x > 0);
                    const candidateMax = positives.filter(x => x > avgPerMin);
                    let maxPerMin = 0;
                    if (candidateMax.length) {
                        maxPerMin = Math.max(...candidateMax);
                    } else if (positives.length) {
                        maxPerMin = Math.max(...positives);
                    }
                    console.log(`[Tracker][fetchAndUpdate] maxPerMin=${maxPerMin}`);

                    // ==== Total task count and remaining tasks ====
                    let totalCount = 0;
                    const solvedElem = document.querySelector('span.course-overview__stats-item[title*="Решенное"] span');
                    if (solvedElem) {
                        const parts = solvedElem.innerText.split('/');
                        if (parts[1]) {
                            const t = parseInt(parts[1].trim(), 10);
                            if (!isNaN(t)) totalCount = t;
                        }
                    }
                    const remainingTasks = totalCount - totalSolved;
                    console.log(`[Tracker][fetchAndUpdate] totalCount=${totalCount}, remainingTasks=${remainingTasks}`);

                    let remainingTimeText = "no data";
                    if (maxPerMin > 0) {
                        const minsLeft = remainingTasks / maxPerMin;
                        const h = Math.floor(minsLeft / 60);
                        const m = Math.round(minsLeft % 60);
                        remainingTimeText = `${h}h ${m}m`;
                    }
                    console.log(`[Tracker][fetchAndUpdate] remainingTimeText="${remainingTimeText}"`);

                    const nextTh = Math.ceil(totalSolved / 1000) * 1000;
                    const toNext = nextTh - totalSolved;
                    let milestoneText = "no data";
                    if (maxPerMin > 0) {
                        const m2 = toNext / maxPerMin;
                        const h2 = Math.floor(m2 / 60);
                        const m3 = Math.round(m2 % 60);
                        milestoneText = `${h2}h ${m3}m`;
                    }
                    console.log(`[Tracker][fetchAndUpdate] milestoneText="${milestoneText}"`);

                    // =====================================
                    // === Draw overlay with chart and metrics ===
                    // =====================================
                    let overlay = document.getElementById('ck-progress-overlay');
                    if (!overlay) {
                        overlay = document.createElement('div');
                        overlay.id = 'ck-progress-overlay';
                        overlay.style.position = 'fixed';
                        overlay.style.top = '10px';
                        overlay.style.right = '10px';
                        overlay.style.backgroundColor = 'white';
                        overlay.style.border = '1px solid #ccc';
                        overlay.style.padding = '10px';
                        overlay.style.zIndex = 9999;
                        overlay.style.fontFamily = 'Arial, sans-serif';
                        overlay.style.fontSize = '12px';
                        overlay.style.color = '#000';
                        overlay.innerHTML = '<strong>Task Progress&nbsp;(difference per minute)</strong><br/>';

                        const contentDiv = document.createElement('div');
                        contentDiv.id = 'ck-progress-content';

                        const canvas = document.createElement('canvas');
                        canvas.id = 'ck-progress-canvas';
                        canvas.width = 400;
                        canvas.height = 150;
                        contentDiv.appendChild(canvas);

                        const metricsDiv = document.createElement('div');
                        metricsDiv.id = 'ck-progress-metrics';
                        metricsDiv.style.marginTop = '0px';
                        contentDiv.appendChild(metricsDiv);

                        overlay.appendChild(contentDiv);
                        document.body.appendChild(overlay);

                        const toggleBtn = document.createElement('button');
                        toggleBtn.id = 'ck-toggle-btn';
                        toggleBtn.textContent = 'Collapse';
                        toggleBtn.style.position = 'absolute';
                        toggleBtn.style.top = '2px';
                        toggleBtn.style.right = '2px';
                        toggleBtn.style.fontSize = '10px';
                        toggleBtn.style.padding = '2px 5px';
                        overlay.appendChild(toggleBtn);
                        toggleBtn.addEventListener('click', () => {
                            const cd = document.getElementById('ck-progress-content');
                            if (cd.style.display === 'none') {
                                cd.style.display = 'block';
                                toggleBtn.textContent = 'Collapse';
                            } else {
                                cd.style.display = 'none';
                                toggleBtn.textContent = 'Expand';
                            }
                        });
                        console.log("[Tracker] Overlay created");
                    } else {
                        let toggleBtn = document.getElementById('ck-toggle-btn');
                        if (!toggleBtn) {
                            const newBtn = document.createElement('button');
                            newBtn.id = 'ck-toggle-btn';
                            newBtn.textContent = 'Collapse';
                            newBtn.style.position = 'absolute';
                            newBtn.style.top = '2px';
                            newBtn.style.right = '2px';
                            newBtn.style.fontSize = '10px';
                            newBtn.style.padding = '2px 5px';
                            overlay.appendChild(newBtn);
                            newBtn.addEventListener('click', () => {
                                const cd = document.getElementById('ck-progress-content');
                                if (cd.style.display === 'none') {
                                    cd.style.display = 'block';
                                    newBtn.textContent = 'Collapse';
                                } else {
                                    cd.style.display = 'none';
                                    newBtn.textContent = 'Expand';
                                }
                            });
                            console.log("[Tracker] Toggle button added");
                        }
                    }

                    // Draw chart
                    const canvas = document.getElementById('ck-progress-canvas');
                    const ctx = canvas.getContext('2d');
                    ctx.clearRect(0, 0, canvas.width, canvas.height);

                    const margin = 30;
                    const graphW  = canvas.width - margin * 2;
                    const graphH  = canvas.height - margin * 2;
                    const maxDiff = Math.max(...graphDiffs, 1);

                    // Horizontal axis
                    ctx.beginPath();
                    ctx.moveTo(margin, canvas.height - margin);
                    ctx.lineTo(canvas.width - margin, canvas.height - margin);
                    ctx.strokeStyle = '#000';
                    ctx.stroke();

                    if (graphDiffs.length) {
                        const step = graphDiffs.length > 1 ? graphW / (graphDiffs.length - 1) : graphW;
                        const pts = [];
                        for (let i = 0; i < graphDiffs.length; i++) {
                            const x = margin + i * step;
                            const y = canvas.height - margin - (graphDiffs[i] / maxDiff) * graphH;
                            pts.push({ x, y, v: graphDiffs[i] });
                        }
                        ctx.beginPath();
                        ctx.moveTo(pts[0].x, pts[0].y);
                        for (let i = 1; i < pts.length; i++) {
                            ctx.lineTo(pts[i].x, pts[i].y);
                        }
                        ctx.strokeStyle = 'blue';
                        ctx.stroke();

                        ctx.font = "10px Arial";
                        for (const p of pts) {
                            ctx.fillStyle = 'red';
                            ctx.beginPath();
                            ctx.arc(p.x, p.y, 3, 0, 2 * Math.PI);
                            ctx.fill();
                            ctx.fillStyle = 'black';
                            ctx.fillText(p.v, p.x - 5, p.y - 5);
                        }
                    } else {
                        ctx.font = "14px Arial";
                        ctx.fillText("Insufficient data", margin, margin + 20);
                    }

                    // Update metrics
                    const metricsDiv = document.getElementById('ck-progress-metrics');
                    metricsDiv.innerHTML = `
                        <div>Tasks solved today: <strong>${solvedToday}</strong></div>
                        <div>Remaining to unlock: <strong>${unlockRemaining}</strong></div>
                        <div>Average speed: <strong>${avgPerMin}</strong> tasks/min</div>
                        <div>Remaining time: <strong>${remainingTimeText}</strong></div>
                        <div>Tasks remaining: <strong>${remainingTasks}</strong></div>
                        <div>To ${nextTh} solved tasks: <strong>${milestoneText}</strong></div>
                    `;
                    console.log("[Tracker] UI updated");
                });
            }

            // Start fetchAndUpdate immediately and then by timer
            fetchAndUpdate();
            setInterval(fetchAndUpdate, 60000);
        }
    })();

})();