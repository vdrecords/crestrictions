// ==UserScript==
// @name         06_url_blocker - Блокировщик URL и список доменов
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Блокировка нежелательных сайтов и разрешение только определённых доменов с режимом турнира
// @match        *://*/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // ========================================
    // === General URL Blocking ===
    // ========================================
    (function() {
        const blocked = [
            "youtube.com",
            "music.youtube.com",
            "chrome.google.com/webstore",
            "chromewebstore.google.com",
            "addons.mozilla.org",
            "microsoftedge.microsoft.com/addons",
            "opera.com/extensions",
            "addons.opera.com",
            "yandex.ru/extensions"
        ];

        function isBlocked() {
            return blocked.some(site => location.hostname.includes(site));
        }

        function injectCSS() {
            const style = document.createElement('style');
            style.textContent = `
                html, body { visibility: hidden !important; }
                html::before {
                    content: 'Page blocked!';
                    visibility: visible !important;
                    position: fixed;
                    top: 40%;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    color: red;
                    font-size: 2em;
                    text-align: center;
                    z-index: 999999;
                }
            `;
            document.documentElement.appendChild(style);
            console.log("[URLBlock] Content blocked via CSS injection");
        }

        if (isBlocked()) {
            if (document.readyState === 'loading') {
                document.addEventListener("DOMContentLoaded", injectCSS);
            } else {
                injectCSS();
            }
        }
    })();

    // ========================================
    // === Domain Whitelist (General Mode) ===
    // ========================================
    (function() {
        // Check if we're in tournament mode (specific allowed URLs)
        const tournamentMode = checkTournamentMode();
        if (tournamentMode) return; // Skip general whitelist if in tournament mode

        // 1. List of allowed hosts (and their subdomains)
        const allowedHosts = [
            'learn.chessking.com',
            'allcantrip.ru',
            'start.bizon365.ru',
            'worldchess.com',
            'chess.com',
            'lichess.org',
            'deepl.com'
        ];

        const host = window.location.hostname.toLowerCase();

        // 2. Check if current host is allowed or its subdomain
        const isAllowed = allowedHosts.some(allowed =>
            host === allowed || host.endsWith('.' + allowed)
        );

        // 3. If not allowed — replace page with "blocker"
        if (!isAllowed) {
            document.open('text/html', 'replace');
            document.write(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Access Denied</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: Arial, sans-serif;
      background: #fafafa;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      color: #900;
    }
    #blocker {
      text-align: center;
      border: 2px solid #900;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 0 15px rgba(0,0,0,0.2);
      background: #fff;
    }
    #blocker h1 {
      margin-bottom: 15px;
      font-size: 1.8em;
    }
    #blocker p {
      margin: 10px 0;
      font-size: 1em;
      color: #000;
    }
    #blocker a {
      display: block;
      margin: 8px 0;
      font-size: 1em;
      text-decoration: none;
      color: #0066cc;
    }
    #blocker a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div id="blocker">
    <h1>Access to this page is blocked</h1>
    <p>Only the following resources are allowed:</p>
    <a href="https://learn.chessking.com"       target="_blank">• learn.chessking.com</a>
    <a href="https://www.chess.com"             target="_blank">• chess.com</a>
    <a href="https://lichess.org"               target="_blank">• lichess.org</a>
  </div>
</body>
</html>
            `);
            document.close();
            return;
        }

        // 4. All allowed — script no longer interferes
    })();

    // ========================================
    // === Tournament Mode (Specific URLs) ===
    // ========================================
    function checkTournamentMode() {
        // Check if we should enable tournament mode (you can add conditions here)
        // For now, return false to use general mode
        // Set to true and uncomment the tournament logic below to enable tournament mode
        return false;
        
        /*
        // Tournament mode - only specific URLs allowed
        const allowed = [
            'https://learn.chessking.com/learning/course/72',
            'https://www.chess.com/puzzles/battle',
            'https://www.chess.com/puzzles/rush'
        ];
        const url = window.location.href;
        const ok  = allowed.some(p => url.startsWith(p));

        // Block all other pages
        if (!ok) {
            document.open('text/html', 'replace');
            document.write(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Page Blocked</title>
  <style>
    body {
      margin: 0; padding: 0;
      font-family: Arial, sans-serif;
      background: #fff;
      display: flex; align-items: center; justify-content: center;
      height: 100vh; color: #c00;
    }
    #block-container {
      text-align: center;
      border: 2px solid #c00;
      padding: 20px; border-radius: 8px;
      box-shadow: 0 0 10px rgba(0,0,0,0.2);
    }
    #block-container h1 {
      margin: 0 0 10px; font-size: 1.5em;
    }
    #block-container p {
      margin: 5px 0; font-size: 1em; color: #000;
    }
    #block-container a {
      display: block; margin: 8px 0;
      text-decoration: none; color: #0066cc; font-size: 1em;
    }
    #block-container a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div id="block-container">
    <h1>Page blocked!</h1>
    <p>Only allowed:</p>
    <a href="https://learn.chessking.com/learning/course/72" target="_blank">• ChessKing Course #72</a>
    <a href="https://www.chess.com/puzzles/battle"       target="_blank">• Chess.com — Battle</a>
    <a href="https://www.chess.com/puzzles/rush"         target="_blank">• Chess.com — Rush</a>
  </div>
</body>
</html>`);
            document.close();
            return true; // Tournament mode was active
        }
        
        return true; // Tournament mode was active but URL was allowed
        */
    }

})();