// ==UserScript==
// @name         08_turnir - Турнир
// @namespace    http://tampermonkey.net/
// @version      1.4
// @description  Разрешает курс ChessKing #72 и два режима задач Chess.com; все прочие страницы полностью блокируются с сообщением и ссылками. На ChessKing включены мгновенные анимации и автоклик.
// @match        *://*/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // Разрешённые URL
    const allowed = [
        //'https://learn.chessking.com/learning/course/72',
        'https://www.chess.com/puzzles/battle',
        'https://www.chess.com/puzzles/rush'
    ];
    const url = window.location.href;
    const ok  = allowed.some(p => url.startsWith(p));

    // Блокировка всех прочих страниц
    if (!ok) {
        document.open('text/html', 'replace');
        document.write(`
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>Страница заблокирована</title>
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
    <h1>Страница заблокирована!</h1>
    <p>Разрешены только:</p>
    <a href="https://learn.chessking.com/learning/course/72" target="_blank">• Курс ChessKing #72</a>
    <a href="https://www.chess.com/puzzles/battle"       target="_blank">• Chess.com — Battle</a>
    <a href="https://www.chess.com/puzzles/rush"         target="_blank">• Chess.com — Rush</a>
  </div>
</body>
</html>`);
        document.close();
        return;
    }

    // === Мгновенные анимации ChessKing и автоклик «Следующее задание» ===
    (function() {
        // Переопределяем jQuery.animate/fadeIn/fadeOut
        function overrideJQueryAnimate() {
            if (window.jQuery && jQuery.fn) {
                jQuery.fn.animate = function(props, duration, easing, callback) {
                    this.css(props);
                    if (typeof callback === 'function') callback.call(this);
                    return this;
                };
                jQuery.fn.fadeIn = function(duration, easing, callback) {
                    this.show().css({ opacity: 1 });
                    if (typeof callback === 'function') callback.call(this);
                    return this;
                };
                jQuery.fn.fadeOut = function(duration, easing, callback) {
                    this.hide().css({ opacity: 0 });
                    if (typeof callback === 'function') callback.call(this);
                    return this;
                };
                if (jQuery.fn.callbackAnimate) {
                    jQuery.fn.callbackAnimate = function(callback, props) {
                        this.css(props);
                        setTimeout(callback, 1);
                        return this;
                    };
                }
                if (jQuery.fn.deferredAnimate) {
                    jQuery.fn.deferredAnimate = function(props) {
                        this.css(props);
                        return jQuery.Deferred().resolve().promise();
                    };
                }
            }
        }

        // Проверяем видимость элемента
        function isElementVisible(el) {
            return el && el.offsetParent !== null;
        }

        // Ищем и кликаем кнопку «Следующее задание»
        function autoClickNextButton() {
            document.querySelectorAll('a.btn.btn-primary').forEach(btn => {
                if (btn.textContent.trim() === 'Следующее задание' && isElementVisible(btn)) {
                    btn.click();
                }
            });
        }

        // Настраиваем MutationObserver для автоклика
        function setupObserver() {
            overrideJQueryAnimate();
            autoClickNextButton();
            const observer = new MutationObserver(autoClickNextButton);
            observer.observe(document.body, { childList: true, subtree: true });
        }

        if (document.body) {
            setupObserver();
        } else {
            document.addEventListener('DOMContentLoaded', setupObserver);
        }
    })();

})();