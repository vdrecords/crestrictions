// ==UserScript==
// @name         10_training_redirect - Автоматический редирект на обучение
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Автоматический редирект на страницу обучения в 9:00 утра в будние дни с блокировкой неразрешённых доменов
// @match        *://*/*
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // --- SETTINGS ---

    // Master training mode toggle
    const enableTrainingMode = true; // Set to false to completely disable training mode

    // Training mode settings
    const trainingRedirectURL = 'https://allcantrip.ru/lesson'; // Link for redirect at 9:00
    const allowedTrainingDomain = 'start.bizon365.ru'; // Allowed domain during training
    const trainingStartHour = 9; // Training starts at 9:00
    const trainingEndHour = 10; // Training ends at 10:00
    const warningMinutes = 20; // Warning starts 20 minutes before training (8:40)

    // --- END SETTINGS ---

    // Helper function to get today's date string
    function getTodayDateString() {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    // Check if training mode is disabled
    if (!enableTrainingMode) {
        console.log('[TrainingRedirect] Training mode disabled, script inactive');
        return;
    }

    let mainCheckInterval = null; // Variable for main check interval

    // Function to create and update timer
    function showTrainingTimer(message) {
        let timerElement = document.getElementById('training-timer');
        if (!timerElement) {
            timerElement = document.createElement('div');
            timerElement.id = 'training-timer';
            timerElement.style.position = 'fixed';
            timerElement.style.top = '10px';
            timerElement.style.right = '10px';
            timerElement.style.padding = '10px';
            timerElement.style.backgroundColor = 'rgba(0, 123, 255, 0.9)';
            timerElement.style.border = '2px solid #fff';
            timerElement.style.borderRadius = '5px';
            timerElement.style.zIndex = '9999999';
            timerElement.style.fontSize = '16px';
            timerElement.style.fontFamily = 'Arial, sans-serif';
            timerElement.style.color = '#fff';
            if (document.documentElement) {
                document.documentElement.appendChild(timerElement);
            }
        }
        timerElement.innerHTML = `<b>${message}</b>`;
    }

    // Function to remove timer
    function removeTrainingTimer() {
        const timerElement = document.getElementById('training-timer');
        if (timerElement) {
            timerElement.parentNode.removeChild(timerElement);
        }
    }

    // Function to block page during training time
    function blockPageForTraining(title, message) {
        if (mainCheckInterval) clearInterval(mainCheckInterval);

        // Use requestAnimationFrame to guarantee DOM is ready for changes
        requestAnimationFrame(() => {
            document.head.innerHTML = '';
            document.body.innerHTML = `
                <div style="display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100vh; background-color: #007bff; color: #fff; font-family: Arial, sans-serif; text-align: center; padding: 20px;">
                    <h1 style="font-size: 3em;">${title}</h1>
                    ${message ? `<p style="font-size: 1.2em;">${message}</p>` : ''}
                    <p style="font-size: 1em; margin-top: 20px;">Allowed domain: <b>${allowedTrainingDomain}</b></p>
                </div>
            `;
        });
        window.stop();
    }

    // Main training logic
    function checkTrainingTime() {
        const now = new Date();
        const day = now.getDay(); // 0-Sun, 1-Mon, ..., 6-Sat
        const hour = now.getHours();
        const minute = now.getMinutes();
        const isWeekday = day >= 1 && day <= 5; // Check that day is Monday to Friday

        // Only run on weekdays
        if (!isWeekday) {
            removeTrainingTimer();
            return;
        }

        const currentTimeInMinutes = hour * 60 + minute;
        const trainingStartInMinutes = trainingStartHour * 60;
        const trainingWarningStart = trainingStartInMinutes - warningMinutes; // 8:40 in minutes

        // 1. Check training period (9:00 - 9:59)
        if (hour >= trainingStartHour && hour < trainingEndHour) {
            console.log(`[TrainingRedirect] Training time active: ${hour}:${minute.toString().padStart(2, '0')}`);
            
            // If we're not on allowed domain, handle redirect/block
            if (window.location.hostname !== allowedTrainingDomain) {
                // If it's exactly 9:00, redirect
                if (hour === trainingStartHour && minute === 0) {
                    console.log(`[TrainingRedirect] Redirecting to training at 9:00`);
                    window.location.href = trainingRedirectURL;
                } else {
                    // If already after 9:00, show blocking page
                    console.log(`[TrainingRedirect] Blocking page during training time`);
                    blockPageForTraining('Training in Progress!', 'Time for your scheduled training session.');
                }
            } else {
                // On correct domain - remove any timers and allow access
                console.log(`[TrainingRedirect] On allowed training domain: ${allowedTrainingDomain}`);
                
                // Mark training as completed for today
                const dateKey = getTodayDateString();
                const trainingCompletedKey = `training_completed_${dateKey}`;
                const existingValue = typeof GM_setValue !== 'undefined' ? 
                    (typeof GM_getValue !== 'undefined' ? GM_getValue(trainingCompletedKey, 'false') : 'false') : 'false';
                
                if (existingValue !== 'true') {
                    if (typeof GM_setValue !== 'undefined') {
                        GM_setValue(trainingCompletedKey, 'true');
                        console.log(`[TrainingRedirect] Training marked as completed for ${dateKey}`);
                    } else {
                        console.log('[TrainingRedirect] GM_setValue not available, cannot save training completion');
                    }
                }
                
                removeTrainingTimer();
            }
            return;
        }

        // 2. Check warning period (8:40 - 8:59)
        if (currentTimeInMinutes >= trainingWarningStart && hour < trainingStartHour) {
            const minutesLeft = trainingStartInMinutes - currentTimeInMinutes;
            console.log(`[TrainingRedirect] Training warning: ${minutesLeft} minutes remaining`);
            showTrainingTimer(`Training starts in: ${minutesLeft} min.`);
            return;
        }

        // 3. Outside training time - remove timer
        removeTrainingTimer();
    }

    // --- SCRIPT STARTUP ---

    console.log(`[TrainingRedirect] Script started on: ${window.location.href}`);

    // Immediate check at document start
    checkTrainingTime();

    // Start main check every minute
    mainCheckInterval = setInterval(checkTrainingTime, 60000);

})();