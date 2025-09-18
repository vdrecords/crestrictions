// ==UserScript==
// @name         07_time_blocker - Блокировщик по времени
// @namespace    http://tampermonkey.net/
// @version      1.11
// @description  Блокировка страниц в определённые временные интервалы с возможностью задания минут
// @match        *://*/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // --- SETTINGS ---

    // Blocking interval #1: 13:00 to 18:00 (same day)
    const blockStart1Hour = 13;
    const blockStart1Minute = 0;
    const blockEnd1Hour = 18;
    const blockEnd1Minute = 0;

    // Blocking interval #2: 21:00 to 23:59 (same day)
    const blockStart2Hour = 21;
    const blockStart2Minute = 0;
    const blockEnd2Hour = 23;
    const blockEnd2Minute = 59;

    // Blocking interval #3: 00:00 to 8:00 (next day)
    const blockStart3Hour = 0;
    const blockStart3Minute = 0;
    const blockEnd3Hour = 8;
    const blockEnd3Minute = 0;

    const warningMinutes = 20; // How many minutes before blocking to show timer

    // --- END SETTINGS ---

    const STYLE_ID = 'time-blocker-style';
    const OVERLAY_ID = 'time-blocker-overlay';
    const BLOCK_CLASS = 'time-blocker-blocked';
    const INIT_CLASS = 'time-blocker-init';

    let mainCheckInterval = null; // Variable for main check interval
    let currentlyBlocked = false;
    let overlayElements = null;

    injectBaseStyle();
    ensureOverlay();

    const htmlRoot = document.documentElement;
    if (htmlRoot) {
        htmlRoot.classList.add(INIT_CLASS);
    }

    // Function to create and update timer
    function showWarningTimer(message) {
        let timerElement = document.getElementById('blocker-timer');
        if (!timerElement) {
            timerElement = document.createElement('div');
            timerElement.id = 'blocker-timer';
            timerElement.style.position = 'fixed';
            timerElement.style.top = '10px';
            timerElement.style.left = '10px';
            timerElement.style.padding = '10px';
            timerElement.style.backgroundColor = 'rgba(255, 221, 0, 0.9)';
            timerElement.style.border = '2px solid #333';
            timerElement.style.borderRadius = '5px';
            timerElement.style.zIndex = '9999999';
            timerElement.style.fontSize = '16px';
            timerElement.style.fontFamily = 'Arial, sans-serif';
            timerElement.style.color = '#000';
            if (document.documentElement) {
                document.documentElement.appendChild(timerElement);
            }
        }
        timerElement.innerHTML = `<b>${message}</b>`;
    }

    // Function to remove timer
    function removeWarningTimer() {
        const timerElement = document.getElementById('blocker-timer');
        if (timerElement) {
            timerElement.parentNode.removeChild(timerElement);
        }
    }

    function injectBaseStyle() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
html.${INIT_CLASS} body { display: none !important; }
html.${BLOCK_CLASS} body { display: none !important; }
#${OVERLAY_ID} {
    display: none;
    position: fixed;
    inset: 0;
    margin: 0;
    background-color: #333;
    color: #fff;
    font-family: Arial, sans-serif;
    text-align: center;
    padding: 20px;
    z-index: 2147483647;
    box-sizing: border-box;
    align-items: center;
    justify-content: center;
    flex-direction: column;
}
#${OVERLAY_ID} h1 {
    font-size: 3em;
    margin: 0 0 16px 0;
}
#${OVERLAY_ID} p {
    font-size: 1.2em;
    margin: 0;
}
html.${BLOCK_CLASS} #${OVERLAY_ID} {
    display: flex !important;
}
`;
        const head = document.head || document.documentElement;
        head.appendChild(style);
    }

    function ensureOverlay() {
        if (overlayElements) return overlayElements;
        const existing = document.getElementById(OVERLAY_ID);
        const container = existing || document.createElement('div');
        container.id = OVERLAY_ID;
        let titleEl = container.querySelector('h1');
        let messageEl = container.querySelector('p');

        if (!titleEl) {
            titleEl = document.createElement('h1');
            container.appendChild(titleEl);
        }
        if (!messageEl) {
            messageEl = document.createElement('p');
            container.appendChild(messageEl);
        }

        if (!existing) {
            const parent = document.body || document.documentElement;
            parent.appendChild(container);
        }

        overlayElements = { container, title: titleEl, message: messageEl };
        return overlayElements;
    }

    function setBlockedState(title, message) {
        const html = document.documentElement;
        if (!html) return;
        const overlay = ensureOverlay();
        overlay.title.textContent = title || 'Time is up';
        if (message) {
            overlay.message.textContent = message;
            overlay.message.style.display = 'block';
        } else {
            overlay.message.textContent = '';
            overlay.message.style.display = 'none';
        }

        if (!currentlyBlocked) {
            window.stop();
        }
        html.classList.add(BLOCK_CLASS);
        currentlyBlocked = true;
    }

    function setAllowedState() {
        const html = document.documentElement;
        if (!html) return;
        html.classList.remove(BLOCK_CLASS);
        currentlyBlocked = false;
    }

    // Function to convert time to minutes since midnight
    function timeToMinutes(hours, minutes) {
        return hours * 60 + minutes;
    }

    // Function to check if current time is in any blocking interval
    function isInBlockingInterval(currentHour, currentMinute, dayOfWeekOverride) {
        const dayOfWeek = typeof dayOfWeekOverride === 'number' ? dayOfWeekOverride : new Date().getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
        // Weekdays Mon-Thu: block everything EXCEPT 16:00-20:00
        if (dayOfWeek >= 1 && dayOfWeek <= 4) {
            const currentTimeInMinutes = timeToMinutes(currentHour, currentMinute);
            const freeStart = timeToMinutes(16, 0);
            const freeEnd = timeToMinutes(20, 0);
            const inFreeWindow = currentTimeInMinutes >= freeStart && currentTimeInMinutes < freeEnd;
            console.log(`[TimeBlocker] Mon-Thu policy. Free window 16:00-20:00. In free window: ${inFreeWindow}`);
            return !inFreeWindow; // block outside free window
        }
        // Friday: block from 21:00
        if (dayOfWeek === 5) { // Friday
            const t = timeToMinutes(currentHour, currentMinute);
            const isBlocked = t >= timeToMinutes(21, 0);
            console.log(`[TimeBlocker] Friday policy. Block after 21:00: ${isBlocked}`);
            return isBlocked;
        }
        // Weekends: custom windows
        if (dayOfWeek === 6) { // Saturday: 08:00-13:00 and 18:00-21:00 free
            const t = timeToMinutes(currentHour, currentMinute);
            const saturdayFree = (t >= timeToMinutes(8,0) && t < timeToMinutes(13,0)) ||
                                 (t >= timeToMinutes(18,0) && t < timeToMinutes(21,0));
            console.log(`[TimeBlocker] Saturday policy. Free windows 08:00-13:00, 18:00-21:00. In free: ${saturdayFree}`);
            return !saturdayFree;
        }
        if (dayOfWeek === 0) { // Sunday: 08:00-13:00 and 18:00-21:00 free
            const t = timeToMinutes(currentHour, currentMinute);
            const sundayFree = (t >= timeToMinutes(8,0) && t < timeToMinutes(13,0)) ||
                               (t >= timeToMinutes(18,0) && t < timeToMinutes(21,0));
            console.log(`[TimeBlocker] Sunday policy. Free windows 08:00-13:00, 18:00-21:00. In free: ${sundayFree}`);
            return !sundayFree;
        }
        // Fallback to legacy (shouldn't reach here)
        const currentTimeInMinutes = timeToMinutes(currentHour, currentMinute);
        
        // Debug logging
        console.log(`[TimeBlocker] Current time: ${currentHour}:${currentMinute} (${currentTimeInMinutes} minutes)`);
        
        // Check interval 1: 13:00 to 18:00
        const start1Minutes = timeToMinutes(blockStart1Hour, blockStart1Minute);
        const end1Minutes = timeToMinutes(blockEnd1Hour, blockEnd1Minute);
        console.log(`[TimeBlocker] Interval 1: ${blockStart1Hour}:${blockStart1Minute} to ${blockEnd1Hour}:${blockEnd1Minute} (${start1Minutes} to ${end1Minutes})`);
        
        if (currentTimeInMinutes >= start1Minutes && currentTimeInMinutes < end1Minutes) {
            console.log(`[TimeBlocker] Blocked by interval 1 (13:00-18:00)`);
            return true;
        }
        
        // Check interval 2: 21:00 to 23:59
        const start2Minutes = timeToMinutes(blockStart2Hour, blockStart2Minute);
        const end2Minutes = timeToMinutes(blockEnd2Hour, blockEnd2Minute);
        console.log(`[TimeBlocker] Interval 2: ${blockStart2Hour}:${blockStart2Minute} to ${blockEnd2Hour}:${blockEnd2Minute} (${start2Minutes} to ${end2Minutes})`);
        
        if (currentTimeInMinutes >= start2Minutes && currentTimeInMinutes < end2Minutes) {
            console.log(`[TimeBlocker] Blocked by interval 2 (21:00-23:59)`);
            return true;
        }
        
        // Check interval 3: 00:00 to 8:00
        const start3Minutes = timeToMinutes(blockStart3Hour, blockStart3Minute);
        const end3Minutes = timeToMinutes(blockEnd3Hour, blockEnd3Minute);
        console.log(`[TimeBlocker] Interval 3: ${blockStart3Hour}:${blockStart3Minute} to ${blockEnd3Hour}:${blockEnd3Minute} (${start3Minutes} to ${end3Minutes})`);
        
        if (currentTimeInMinutes >= start3Minutes && currentTimeInMinutes < end3Minutes) {
            console.log(`[TimeBlocker] Blocked by interval 3 (00:00-8:00)`);
            return true;
        }
        
        console.log(`[TimeBlocker] Not blocked`);
        return false;
    }

    // Function to calculate time until next blocking starts
    function getTimeUntilBlocking(currentHour, currentMinute, dayOfWeekOverride) {
        const dayOfWeek = typeof dayOfWeekOverride === 'number' ? dayOfWeekOverride : new Date().getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
        // Mon-Thu: Only free window 16:00-20:00, show time left until 20:00 when inside it
        if (dayOfWeek >= 1 && dayOfWeek <= 4) {
            const currentTimeInMinutes = timeToMinutes(currentHour, currentMinute);
            const freeStart = timeToMinutes(16, 0);
            const freeEnd = timeToMinutes(20, 0);
            if (currentTimeInMinutes >= freeStart && currentTimeInMinutes < freeEnd) {
                const remaining = freeEnd - currentTimeInMinutes;
                console.log(`[TimeBlocker] Mon-Thu free window active. Blocking resumes in ${remaining} minutes`);
                return remaining;
            }
            // Already blocked outside free window
            return 0;
        }
        // Friday: show minutes until 21:00 when before it
        if (dayOfWeek === 5) {
            const t = timeToMinutes(currentHour, currentMinute);
            const blockAt = timeToMinutes(21,0);
            if (t < blockAt) {
                const remaining = blockAt - t;
                console.log(`[TimeBlocker] Friday countdown. Blocking in ${remaining} minutes`);
                return remaining;
            }
            return 0;
        }
        // Weekends: show time until next block only if in a free window
        if (dayOfWeek === 6) { // Saturday
            const t = timeToMinutes(currentHour, currentMinute);
            const morningStart = timeToMinutes(8,0);
            const morningEnd   = timeToMinutes(13,0);
            const eveningStart = timeToMinutes(18,0);
            const eveningEnd   = timeToMinutes(21,0);
            if (t >= morningStart && t < morningEnd) return morningEnd - t;
            if (t >= eveningStart && t < eveningEnd) return eveningEnd - t;
            return 0;
        }
        if (dayOfWeek === 0) { // Sunday
            const t = timeToMinutes(currentHour, currentMinute);
            const morningStart = timeToMinutes(8,0);
            const morningEnd   = timeToMinutes(13,0);
            const eveningStart = timeToMinutes(18,0);
            const eveningEnd   = timeToMinutes(21,0);
            if (t >= morningStart && t < morningEnd) return morningEnd - t;
            if (t >= eveningStart && t < eveningEnd) return eveningEnd - t;
            return 0;
        }
        // Fallback to legacy (shouldn't reach here)
        const currentTimeInMinutes = timeToMinutes(currentHour, currentMinute);
        
        // Calculate time until each interval starts
        const intervals = [
            { name: 'Interval 1', startHour: blockStart1Hour, startMinute: blockStart1Minute },
            { name: 'Interval 2', startHour: blockStart2Hour, startMinute: blockStart2Minute },
            { name: 'Interval 3', startHour: blockStart3Hour, startMinute: blockStart3Minute }
        ];
        
        let minTimeUntilBlock = Infinity;
        let nextIntervalName = '';
        
        intervals.forEach(interval => {
            const startMinutes = timeToMinutes(interval.startHour, interval.startMinute);
            let timeUntilBlock = startMinutes - currentTimeInMinutes;
            
            // If negative, it means the interval starts tomorrow
            if (timeUntilBlock < 0) {
                timeUntilBlock = 24 * 60 + timeUntilBlock;
            }
            
            if (timeUntilBlock < minTimeUntilBlock) {
                minTimeUntilBlock = timeUntilBlock;
                nextIntervalName = interval.name;
            }
        });
        
        console.log(`[TimeBlocker] Next blocking in ${minTimeUntilBlock} minutes (${nextIntervalName})`);
        return minTimeUntilBlock;
    }

    // Main blocking logic
    function checkTime(precomputed) {
        const now = precomputed && precomputed.now instanceof Date ? precomputed.now : new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const dayOfWeek = precomputed && typeof precomputed.dayOfWeek === 'number' ? precomputed.dayOfWeek : now.getDay();
        const shouldBlock = precomputed && typeof precomputed.shouldBlock === 'boolean'
            ? precomputed.shouldBlock
            : isInBlockingInterval(currentHour, currentMinute, dayOfWeek);

        console.log(`[TimeBlocker] Checking time: ${currentHour}:${currentMinute}`);

        // Check if we're in blocking interval
        if (shouldBlock) {
            console.log(`[TimeBlocker] BLOCKING PAGE - Time is up`);
            setBlockedState('Time is up');
            removeWarningTimer();
            return;
        }

        setAllowedState();

        // Check if blocking time is approaching soon
        const timeUntilBlock = getTimeUntilBlocking(currentHour, currentMinute, dayOfWeek);
        
        if (timeUntilBlock > 0 && timeUntilBlock <= warningMinutes) {
            console.log(`[TimeBlocker] Showing warning timer: ${timeUntilBlock} minutes until blocking`);
            showWarningTimer(`Until blocking: ${timeUntilBlock} min.`);
            return;
        }

        console.log(`[TimeBlocker] No blocking needed, removing timer if exists`);
        removeWarningTimer();
    }

    // --- SCRIPT STARTUP ---

    // Debug: Show current time immediately
    const debugNow = new Date();
    console.log(`[TimeBlocker] Script started at: ${debugNow.toLocaleString()}`);
    console.log(`[TimeBlocker] Current time: ${debugNow.getHours()}:${debugNow.getMinutes()}`);

    const initialDayOfWeek = debugNow.getDay();
    const initialShouldBlock = isInBlockingInterval(debugNow.getHours(), debugNow.getMinutes(), initialDayOfWeek);

    if (initialShouldBlock) {
        setBlockedState('Time is up');
    } else {
        setAllowedState();
    }

    if (htmlRoot) {
        htmlRoot.classList.remove(INIT_CLASS);
    }

    // Immediate check at document start to update warnings / transitions
    checkTime({
        now: debugNow,
        dayOfWeek: initialDayOfWeek,
        shouldBlock: initialShouldBlock
    });

    // Start main check every minute
    mainCheckInterval = setInterval(checkTime, 60000);

})();
