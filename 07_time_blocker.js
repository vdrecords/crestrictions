// ==UserScript==
// @name         07_time_blocker - Блокировщик по времени
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Блокировка страниц в определённые временные интервалы
// @match        *://*/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // --- SETTINGS ---

    // Blocking interval #1: 13:00 to 18:00
    const blockStart1 = 13;
    const blockEnd1 = 18;

    // Blocking interval #2: 21:00 to midnight
    const blockStart2 = 21;
    const blockEnd2 = 24; // 24 means until end of day

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

    // Main blocking logic
    function checkTime() {
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const currentTimeInMinutes = currentHour * 60 + currentMinute;

        // Determine if blocking time is approaching soon
        const timeUntilBlock1 = (blockStart1 * 60) - currentTimeInMinutes;
        const timeUntilBlock2 = (blockStart2 * 60) - currentTimeInMinutes;

        // Check if we're in blocking interval
        const isBlocked = (currentHour >= blockStart1 && currentHour < blockEnd1) ||
                          (currentHour >= blockStart2 && currentHour < blockEnd2);

        if (isBlocked) {
            blockPage('Time is up');
            return;
        }

        // Timer logic for first interval
        if (timeUntilBlock1 > 0 && timeUntilBlock1 <= warningMinutes) {
            showWarningTimer(`Until blocking: ${timeUntilBlock1} min.`);
            return;
        }

        // Timer logic for second interval
        if (timeUntilBlock2 > 0 && timeUntilBlock2 <= warningMinutes) {
            showWarningTimer(`Until blocking: ${timeUntilBlock2} min.`);
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