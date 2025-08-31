// ==UserScript==
// @name         07_time_blocker - Блокировщик по времени
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Блокировка страниц в определённые временные интервалы с возможностью задания минут
// @match        *://*/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // --- SETTINGS ---

    // Blocking interval #1: 13:30 to 18:00
    const blockStart1Hour = 13;
    const blockStart1Minute = 0;
    const blockEnd1Hour = 18;
    const blockEnd1Minute = 0;

    // Blocking interval #2: 21:00 to 8:00 next day
    const blockStart2Hour = 21;
    const blockStart2Minute = 0;
    const blockEnd2Hour = 8;
    const blockEnd2Minute = 0;

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

    // Function to check if current time is in blocking interval
    function isInBlockingInterval(currentHour, currentMinute) {
        const currentTimeInMinutes = timeToMinutes(currentHour, currentMinute);
        
        // First interval: 13:30 to 18:00
        const start1Minutes = timeToMinutes(blockStart1Hour, blockStart1Minute);
        const end1Minutes = timeToMinutes(blockEnd1Hour, blockEnd1Minute);
        
        // Second interval: 21:00 to 8:00 next day
        const start2Minutes = timeToMinutes(blockStart2Hour, blockStart2Minute);
        const end2Minutes = timeToMinutes(blockEnd2Hour, blockEnd2Minute);
        
        // Check first interval (same day)
        if (currentTimeInMinutes >= start1Minutes && currentTimeInMinutes < end1Minutes) {
            return true;
        }
        
        // Check second interval (spans midnight)
        if (currentTimeInMinutes >= start2Minutes || currentTimeInMinutes < end2Minutes) {
            return true;
        }
        
        return false;
    }

    // Function to calculate time until blocking starts
    function getTimeUntilBlocking(currentHour, currentMinute) {
        const currentTimeInMinutes = timeToMinutes(currentHour, currentMinute);
        
        // Time until first interval
        const start1Minutes = timeToMinutes(blockStart1Hour, blockStart1Minute);
        let timeUntilBlock1 = start1Minutes - currentTimeInMinutes;
        if (timeUntilBlock1 < 0) timeUntilBlock1 = 24 * 60 + timeUntilBlock1; // Next day
        
        // Time until second interval
        const start2Minutes = timeToMinutes(blockStart2Hour, blockStart2Minute);
        let timeUntilBlock2 = start2Minutes - currentTimeInMinutes;
        if (timeUntilBlock2 < 0) timeUntilBlock2 = 24 * 60 + timeUntilBlock2; // Next day
        
        return Math.min(timeUntilBlock1, timeUntilBlock2);
    }

    // Main blocking logic
    function checkTime() {
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();

        // Check if we're in blocking interval
        if (isInBlockingInterval(currentHour, currentMinute)) {
            blockPage('Time is up');
            return;
        }

        // Check if blocking time is approaching soon
        const timeUntilBlock = getTimeUntilBlocking(currentHour, currentMinute);
        
        if (timeUntilBlock > 0 && timeUntilBlock <= warningMinutes) {
            showWarningTimer(`Until blocking: ${timeUntilBlock} min.`);
            return;
        }

        removeWarningTimer();
    }

    // --- SCRIPT STARTUP ---

    // Immediate check at document start
    checkTime();

    // Start main check every minute
    mainCheckInterval = setInterval(checkTime, 60000);

})();