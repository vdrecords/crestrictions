// ==UserScript==
// @name         07_time_blocker - Блокировщик по времени
// @namespace    http://tampermonkey.net/
// @version      1.3
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

    let mainCheckInterval = null; // Variable for main check interval

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

    // Function to block page
    function blockPage(title, message) {
        if (mainCheckInterval) clearInterval(mainCheckInterval);

        // Use requestAnimationFrame to guarantee DOM is ready for changes
        requestAnimationFrame(() => {
            document.head.innerHTML = '';
            document.body.innerHTML = `
                <div style="display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100vh; background-color: #333; color: #fff; font-family: Arial, sans-serif; text-align: center; padding: 20px;">
                    <h1 style="font-size: 3em;">${title}</h1>
                    ${message ? `<p style="font-size: 1.2em;">${message}</p>` : ''}
                </div>
            `;
        });
        window.stop();
    }

    // Function to convert time to minutes since midnight
    function timeToMinutes(hours, minutes) {
        return hours * 60 + minutes;
    }

    // Function to check if current time is in any blocking interval
    function isInBlockingInterval(currentHour, currentMinute) {
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
    function getTimeUntilBlocking(currentHour, currentMinute) {
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
    function checkTime() {
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();

        console.log(`[TimeBlocker] Checking time: ${currentHour}:${currentMinute}`);

        // Check if we're in blocking interval
        if (isInBlockingInterval(currentHour, currentMinute)) {
            console.log(`[TimeBlocker] BLOCKING PAGE - Time is up`);
            blockPage('Time is up');
            return;
        }

        // Check if blocking time is approaching soon
        const timeUntilBlock = getTimeUntilBlocking(currentHour, currentMinute);
        
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

    // Immediate check at document start
    checkTime();

    // Start main check every minute
    mainCheckInterval = setInterval(checkTime, 60000);

})();