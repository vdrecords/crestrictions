// ==UserScript==
// @name         02_animation_autoclick - Анимации и автоклик ChessKing
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Мгновенные анимации для ChessKing и автоклик кнопки «Следующее задание»
// @match        https://learn.chessking.com/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // =========================================
    // === Instant ChessKing Animations ===
    // =========================================
    (function() {
        function overrideJQueryAnimate() {
            if (window.jQuery && jQuery.fn && jQuery.fn.animate) {
                jQuery.fn.animate = function(prop, duration, easing, callback) {
                    this.css(prop);
                    if (typeof callback === "function") callback.call(this);
                    return this;
                };
                jQuery.fn.fadeIn = function(duration, easing, callback) {
                    this.show().css({ opacity: 1 });
                    if (typeof callback === "function") callback.call(this);
                    return this;
                };
                jQuery.fn.fadeOut = function(duration, easing, callback) {
                    this.hide().css({ opacity: 0 });
                    if (typeof callback === "function") callback.call(this);
                    return this;
                };
                if (jQuery.fn.callbackAnimate) {
                    jQuery.fn.callbackAnimate = function(callback, prop, duration, easing) {
                        this.css(prop);
                        setTimeout(callback, 1);
                        return this;
                    };
                }
                if (jQuery.fn.deferredAnimate) {
                    jQuery.fn.deferredAnimate = function(prop, duration, easing) {
                        this.css(prop);
                        return jQuery.Deferred().resolve().promise();
                    };
                }
                console.log("[Animation] jQuery.animate/fade overridden");
            }
        }

        if (window.jQuery) {
            overrideJQueryAnimate();
        } else {
            Object.defineProperty(window, "jQuery", {
                configurable: true,
                set(val) {
                    this._jQuery = val;
                    overrideJQueryAnimate();
                    return val;
                },
                get() {
                    return this._jQuery;
                }
            });
        }

        function isElementVisible(el) {
            return el.offsetParent !== null;
        }

        function autoClickNextButton() {
            document.querySelectorAll("a.btn.btn-primary").forEach(btn => {
                if (btn.textContent.trim() === "Следующее задание" && isElementVisible(btn)) {
                    console.log("[Animation] Click on 'Next Task'");
                    btn.click();
                }
            });
        }

        function setupObserver() {
            const observer = new MutationObserver(() => {
                console.log("[Animation] MutationObserver: checking 'Next Task'");
                autoClickNextButton();
            });
            observer.observe(document.body, { childList: true, subtree: true });
            autoClickNextButton();
        }

        if (document.body) {
            setupObserver();
        } else {
            document.addEventListener("DOMContentLoaded", setupObserver);
        }
    })();

})();