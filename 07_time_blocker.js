// ==UserScript==
// @name         07_time_blocker - Блокировщик по времени
// @namespace    http://tampermonkey.net/
// @version      1.19
// @description  Блокировка страниц в определённые временные интервалы с возможностью задания минут
// @match        *://*/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // --- SCHEDULE SETTINGS ---
    // Каждый день содержит список окон, когда экран разблокирован (формат HH:MM).
    const WEEK_SCHEDULE = createWeekSchedule([
        {
            name: 'Monday',
            dayOfWeek: 1,
            unlocked: [
                { from: '09:00', to: '13:00' },
                { from: '16:00', to: '21:00' }
            ]
        },
        {
            name: 'Tuesday',
            dayOfWeek: 2,
            unlocked: [
                { from: '09:00', to: '13:00' },
                { from: '16:00', to: '21:00' }
            ]
        },
        {
            name: 'Wednesday',
            dayOfWeek: 3,
            unlocked: [
                { from: '09:00', to: '13:00' },
                { from: '16:00', to: '21:00' }
            ]
        },
        {
            name: 'Thursday',
            dayOfWeek: 4,
            unlocked: [
                { from: '09:00', to: '13:00' },
                { from: '16:00', to: '21:00' }
            ]
        },
        {
            name: 'Friday',
            dayOfWeek: 5,
            unlocked: [
                { from: '09:00', to: '13:00' },
                { from: '15:30', to: '16:20' },
                { from: '18:00', to: '21:00' }
            ]
        },
        {
            name: 'Saturday',
            dayOfWeek: 6,
            unlocked: [
                { from: '08:00', to: '13:00' },
                { from: '18:00', to: '21:00' }
            ]
        },
        {
            name: 'Sunday',
            dayOfWeek: 0,
            unlocked: [
                { from: '08:00', to: '13:00' },
                { from: '18:00', to: '21:00' }
            ]
        }
    ]);

    const warningMinutes = 20; // How many minutes before blocking to show timer

    // --- END SETTINGS ---

    const OVERLAY_ID = 'time-blocker-overlay';
    const ALLOWED_CLASS = 'time-blocker-allowed';
    const SPECIAL_UNLOCK_DATE = '2025-09-28'; // YYYY-MM-DD
    const SPECIAL_UNLOCK_END_MINUTES = 21 * 60; // 21:00 local time

    let mainCheckInterval = null; // Variable for main check interval
    let currentlyBlocked = false;
    let overlayElements = null;

    ensureOverlay();

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

        container.style.display = 'none';
        container.style.position = 'fixed';
        container.style.inset = '0';
        container.style.margin = '0';
        container.style.backgroundColor = '#333';
        container.style.color = '#fff';
        container.style.fontFamily = 'Arial, sans-serif';
        container.style.textAlign = 'center';
        container.style.padding = '20px';
        container.style.zIndex = '2147483647';
        container.style.boxSizing = 'border-box';
        container.style.display = 'none';
        container.style.alignItems = 'center';
        container.style.justifyContent = 'center';
        container.style.flexDirection = 'column';
        container.style.gap = '12px';

        titleEl.style.fontSize = '3em';
        titleEl.style.margin = '0';
        messageEl.style.fontSize = '1.2em';
        messageEl.style.margin = '0';

        if (!existing) {
            const parent = document.documentElement;
            if (parent.firstChild) {
                parent.insertBefore(container, parent.firstChild);
            } else {
                parent.appendChild(container);
            }
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
            // Stop further loading once we know the page is blocked
            window.stop();
        }
        overlay.container.style.display = 'flex';
        html.classList.remove(ALLOWED_CLASS);
        currentlyBlocked = true;
    }

    function setAllowedState() {
        const html = document.documentElement;
        if (!html) return;
        html.classList.add(ALLOWED_CLASS);
        const overlay = ensureOverlay();
        overlay.container.style.display = 'none';
        currentlyBlocked = false;
    }

    // Function to convert time to minutes since midnight
    function timeToMinutes(hours, minutes) {
        return hours * 60 + minutes;
    }

    function timeStringToMinutes(value) {
        if (typeof value !== 'string') {
            throw new Error(`[TimeBlocker] Invalid time string "${value}"`);
        }
        const [hoursPart, minutesPart = '0'] = value.split(':');
        const hours = parseInt(hoursPart, 10);
        const mins = parseInt(minutesPart, 10);
        if (Number.isNaN(hours) || Number.isNaN(mins)) {
            throw new Error(`[TimeBlocker] Unable to parse time string "${value}"`);
        }
        return timeToMinutes(hours, mins);
    }

    function createWeekSchedule(rawSchedule) {
        const schedule = new Array(7).fill(null);
        rawSchedule.forEach((dayConfig, orderIndex) => {
            const dayIndex = typeof dayConfig.dayOfWeek === 'number'
                ? dayConfig.dayOfWeek
                : orderIndex;
            if (dayIndex < 0 || dayIndex > 6) {
                throw new Error(`[TimeBlocker] dayOfWeek должен быть в диапазоне 0-6, получено ${dayIndex}`);
            }

            const unlocked = (dayConfig.unlocked || []).map((period) => {
                const startMinutes = timeStringToMinutes(period.from);
                const endMinutes = timeStringToMinutes(period.to);
                return {
                    from: period.from,
                    to: period.to,
                    label: `${period.from}-${period.to}`,
                    startMinutes,
                    endMinutes
                };
            }).sort((a, b) => a.startMinutes - b.startMinutes);

            const summary = unlocked.length ? unlocked.map((period) => period.label).join(', ') : 'нет окон';

            schedule[dayIndex] = {
                dayIndex,
                name: dayConfig.name || `Day ${dayIndex}`,
                unlocked,
                summary
            };
        });

        return schedule.map((dayConfig, index) => {
            if (dayConfig) {
                return dayConfig;
            }
            return {
                dayIndex: index,
                name: `Day ${index}`,
                unlocked: [],
                summary: 'нет окон'
            };
        });
    }

    function getDaySchedule(dayIndex) {
        return WEEK_SCHEDULE[dayIndex] || null;
    }

    function findActiveUnlockedPeriod(daySchedule, currentMinutes) {
        if (!daySchedule || daySchedule.unlocked.length === 0) {
            return null;
        }
        return daySchedule.unlocked.find((period) => currentMinutes >= period.startMinutes && currentMinutes < period.endMinutes) || null;
    }

    function getDateKey(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function isSpecialUnlockActive(date, hour, minute) {
        if (!(date instanceof Date)) return false;
        const dateKey = getDateKey(date);
        if (dateKey !== SPECIAL_UNLOCK_DATE) return false;
        return timeToMinutes(hour, minute) < SPECIAL_UNLOCK_END_MINUTES;
    }

    // Function to check if current time is in any blocking interval
    function isInBlockingInterval(currentHour, currentMinute, dayOfWeekOverride) {
        const dayOfWeek = typeof dayOfWeekOverride === 'number' ? dayOfWeekOverride : new Date().getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
        const daySchedule = getDaySchedule(dayOfWeek);
        const currentTimeInMinutes = timeToMinutes(currentHour, currentMinute);

        if (!daySchedule) {
            console.log(`[TimeBlocker] Нет расписания для дня ${dayOfWeek}. Блокируем по умолчанию.`);
            return true;
        }

        if (daySchedule.unlocked.length === 0) {
            console.log(`[TimeBlocker] ${daySchedule.name}: окна разблокировки отсутствуют.`);
            return true;
        }

        const activePeriod = findActiveUnlockedPeriod(daySchedule, currentTimeInMinutes);
        const activeLabel = activePeriod ? activePeriod.label : 'нет';
        console.log(`[TimeBlocker] ${daySchedule.name}: окна разблокировки ${daySchedule.summary}. Активное окно: ${activeLabel}`);
        return !activePeriod;
    }

    // Function to calculate time until next blocking starts
    function getTimeUntilBlocking(currentHour, currentMinute, dayOfWeekOverride) {
        const dayOfWeek = typeof dayOfWeekOverride === 'number' ? dayOfWeekOverride : new Date().getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
        const daySchedule = getDaySchedule(dayOfWeek);

        if (!daySchedule || daySchedule.unlocked.length === 0) {
            return 0;
        }

        const currentTimeInMinutes = timeToMinutes(currentHour, currentMinute);
        const activePeriod = findActiveUnlockedPeriod(daySchedule, currentTimeInMinutes);

        if (!activePeriod) {
            return 0;
        }

        const remaining = activePeriod.endMinutes - currentTimeInMinutes;
        console.log(`[TimeBlocker] ${daySchedule.name}: активное окно ${activePeriod.label}. До блокировки ${remaining} минут`);
        return remaining;
    }

    // Main blocking logic
    function checkTime(precomputed) {
        const now = precomputed && precomputed.now instanceof Date ? precomputed.now : new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const dayOfWeek = precomputed && typeof precomputed.dayOfWeek === 'number' ? precomputed.dayOfWeek : now.getDay();
        const baseShouldBlock = precomputed && typeof precomputed.baseShouldBlock === 'boolean'
            ? precomputed.baseShouldBlock
            : isInBlockingInterval(currentHour, currentMinute, dayOfWeek);
        const currentTimeInMinutes = timeToMinutes(currentHour, currentMinute);
        const specialUnlockActive = isSpecialUnlockActive(now, currentHour, currentMinute);
        const shouldBlock = specialUnlockActive ? false : baseShouldBlock;

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
        const timeUntilBlock = specialUnlockActive
            ? SPECIAL_UNLOCK_END_MINUTES - currentTimeInMinutes
            : getTimeUntilBlocking(currentHour, currentMinute, dayOfWeek);

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
    const initialBaseShouldBlock = isInBlockingInterval(debugNow.getHours(), debugNow.getMinutes(), initialDayOfWeek);
    const initialSpecialUnlockActive = isSpecialUnlockActive(debugNow, debugNow.getHours(), debugNow.getMinutes());
    const initialEffectiveShouldBlock = initialSpecialUnlockActive ? false : initialBaseShouldBlock;

    if (initialEffectiveShouldBlock) {
        setBlockedState('Time is up');
    } else {
        setAllowedState();
    }

    // Immediate check at document start to update warnings / transitions
    checkTime({
        now: debugNow,
        dayOfWeek: initialDayOfWeek,
        baseShouldBlock: initialBaseShouldBlock
    });

    // Start main check every minute
    mainCheckInterval = setInterval(checkTime, 60000);

})();
