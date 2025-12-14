// ==UserScript==
// @name         02_animation_autoclick - Анимации и автоклик ChessKing + ChessTempo
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Мгновенные анимации для ChessKing и автоклик: «Следующее задание» (ChessKing) и «Следующий» (ChessTempo)
// @match        https://learn.chessking.com/*
// @match        https://chesstempo.com/*
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

    // =========================================
    // === ChessTempo Auto Next ===
    // =========================================
    (function() {
        const isChessTempoHost = window.location.hostname === 'chesstempo.com';
        const path = window.location.pathname;
        const isTacticsPage = path === '/chess-tactics' || path.startsWith('/chess-tactics/');
        if (!isChessTempoHost || !isTacticsPage) return;

        const chessTempoTacticsURL = 'https://chesstempo.com/chess-tactics/';
        const DEBUG_CT_NEXT_LOGS = true;

        const nextLog = (...args) => { if (DEBUG_CT_NEXT_LOGS) console.log('[CT Next]', ...args); };
        const nextWarn = (...args) => { if (DEBUG_CT_NEXT_LOGS) console.warn('[CT Next]', ...args); };

        function descEl(el) {
            if (!el) return 'null';
            const tag = el.tagName ? el.tagName.toLowerCase() : 'node';
            const id = el.id ? `#${el.id}` : '';
            const cls = el.className ? `.${String(el.className).replace(/\s+/g, '.')}` : '';
            const text = (el.textContent || '').trim().slice(0, 50);
            return `${tag}${id}${cls} "${text}"`;
        }

        let chessTempoPuzzleKey = null;
        let chessTempoPuzzleSolved = false;
        let chessTempoKeyInterval = null;
        let chessTempoSolveObserver = null;
        let chessTempoNextInterval = null;
        let chessTempoNextAttempts = 0;
        let chessTempoNextKey = null;
        let chessTempoLastClickTs = 0;
        let chessTempoAutoStartInterval = null;
        let chessTempoNavigationForced = false;
        let chessTempoTrackingStarted = false;

        function getChessTempoPuzzleKey() {
            const dataEl = document.querySelector('[data-problem-id], [data-puzzle-id], [data-problemid]');
            if (dataEl) {
                const candidate = dataEl.getAttribute('data-problem-id') || dataEl.getAttribute('data-puzzle-id') || dataEl.getAttribute('data-problemid');
                if (candidate) return `id:${candidate}`;
            }
            const idFromUrl = window.location.pathname + window.location.search + window.location.hash;
            return `url:${idFromUrl}`;
        }

        function refreshChessTempoPuzzleKey() {
            const newKey = getChessTempoPuzzleKey();
            if (newKey !== chessTempoPuzzleKey) {
                chessTempoPuzzleKey = newKey;
                chessTempoPuzzleSolved = false;
                nextLog('Puzzle context updated:', chessTempoPuzzleKey);
            }
        }

        function collectShadowCandidates(root = document, acc = []) {
            if (!root) return acc;
            const nodes = root.querySelectorAll('*');
            nodes.forEach(node => {
                acc.push(node);
                if (node.shadowRoot) collectShadowCandidates(node.shadowRoot, acc);
            });
            return acc;
        }

        function isVisibleButton(el) {
            if (!el) return false;
            const style = window.getComputedStyle(el);
            const opacity = parseFloat(style.opacity || '1');
            if (style.display === 'none' || style.visibility === 'hidden' || opacity < 0.05) return false;
            if (el.classList && el.classList.contains('ct-hidden')) return false;
            const hasBox = el.offsetParent !== null || style.position === 'fixed' || style.display === 'contents';
            if (!hasBox) return false;
            if ((style.pointerEvents || '').toLowerCase() === 'none') return false;
            return true;
        }

        function textLooksLikeNext(rawText) {
            if (!rawText) return false;
            const text = rawText.trim().toLowerCase().replace(/\s+/g, ' ');
            if (!text) return false;
            const patterns = [
                /следующ/,
                /\bдалее\b/,
                /\bnext\b/,
                /\bnext (problem|puzzle|task|exercise)\b/,
                /\bcontinue\b/,
            ];
            return patterns.some(re => re.test(text));
        }

        function attrsLookLikeNext(node) {
            if (!node || !node.getAttribute) return false;
            const attrNames = ['data-cy', 'data-qa', 'aria-label', 'title', 'data-testid', 'data-id', 'data-action'];
            for (const name of attrNames) {
                const val = node.getAttribute(name);
                if (val && textLooksLikeNext(val)) return true;
            }
            return false;
        }

        function isChessTempoModalOpen() {
            return !!document.querySelector('.mdc-dialog--open, .cdk-overlay-container, .ct-dialog, .mat-dialog-container');
        }

        function textLooksLikeStart(rawText) {
            if (!rawText) return false;
            const text = rawText.trim().toLowerCase().replace(/\s+/g, ' ');
            if (!text) return false;
            const patterns = [
                /начать/,
                /старт/,
                /продолж/,
                /трениров/,
                /решать/,
                /решение/,
                /реши зада/,
                /новую зада/,
                /\bstart\b/,
                /\bbegin\b/,
                /\bresume\b/,
                /\bcontinue\b/,
                /\bplay\b/,
                /\bsolve\b/,
                /\btrain\b/,
                /\bgo\b/
            ];
            return patterns.some(re => re.test(text));
        }

        function attrsLookLikeStart(node) {
            if (!node || !node.getAttribute) return false;
            const attrNames = ['aria-label', 'title', 'data-qa', 'data-cy', 'data-testid'];
            return attrNames.some(name => textLooksLikeStart(node.getAttribute(name)));
        }

        function clickWithEvents(el) {
            if (!el) return false;
            try {
                const rect = el.getBoundingClientRect();
                const cx = rect.left + rect.width / 2;
                const cy = rect.top + rect.height / 2;
                const pointerOpts = { bubbles: true, cancelable: true, composed: true, view: window, clientX: cx, clientY: cy, pointerId: 1, pointerType: 'mouse', buttons: 1 };
                const mouseOpts = { bubbles: true, cancelable: true, composed: true, view: window, clientX: cx, clientY: cy, button: 0, buttons: 1 };
                try {
                    if (el.scrollIntoView) el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
                } catch (_) {}
                try {
                    const touchObj = new Touch({
                        identifier: Date.now(),
                        target: el,
                        clientX: cx,
                        clientY: cy,
                        radiusX: 2,
                        radiusY: 2,
                        rotationAngle: 0,
                        force: 0.5
                    });
                    const touchEvent = (type) => el.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, composed: true, touches: [touchObj], targetTouches: [touchObj], changedTouches: [touchObj] }));
                    touchEvent('touchstart');
                    touchEvent('touchend');
                } catch (_) {}
                if (el.focus) {
                    try { el.focus({ preventScroll: true }); } catch (_) { el.focus(); }
                }
                ['pointerdown', 'mousedown'].forEach(type => {
                    el.dispatchEvent(new PointerEvent(type, pointerOpts));
                    el.dispatchEvent(new MouseEvent(type, mouseOpts));
                });
                ['pointerup', 'mouseup', 'click'].forEach(type => {
                    el.dispatchEvent(new PointerEvent(type, pointerOpts));
                    el.dispatchEvent(new MouseEvent(type, mouseOpts));
                });
                el.dispatchEvent(new MouseEvent('dblclick', mouseOpts));
                ['keydown', 'keypress', 'keyup'].forEach(type => {
                    el.dispatchEvent(new KeyboardEvent(type, { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter' }));
                    el.dispatchEvent(new KeyboardEvent(type, { bubbles: true, cancelable: true, key: ' ', code: 'Space' }));
                });
                el.dispatchEvent(new Event('tap', { bubbles: true, cancelable: true }));
                el.dispatchEvent(new Event('action', { bubbles: true, cancelable: true }));
                if (typeof el.click === 'function') el.click();
                return true;
            } catch (e) {
                try {
                    el.click();
                    return true;
                } catch (err) {
                    nextWarn('Failed to click element', err);
                    return false;
                }
            }
        }

        function forceEnableElement(el) {
            if (!el) return;
            try { el.removeAttribute('disabled'); } catch (_) {}
            try { el.removeAttribute('aria-disabled'); } catch (_) {}
            try { el.classList && el.classList.remove('ct-hidden'); } catch (_) {}
            try { el.style && (el.style.pointerEvents = 'auto'); } catch (_) {}
            try { el.style && (el.style.visibility = ''); } catch (_) {}
            try { el.style && (el.style.display = ''); } catch (_) {}
        }

        function clickSimple(el) {
            if (!el) return false;
            try {
                forceEnableElement(el);
                try { el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }); } catch (_) {}
                try { el.focus({ preventScroll: true }); } catch (_) {}
                el.click();
                return true;
            } catch (_) {}
            try {
                const rect = el.getBoundingClientRect();
                const cx = rect.left + rect.width / 2;
                const cy = rect.top + rect.height / 2;
                try { el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }); } catch (_) {}
                el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: cx, clientY: cy, button: 0 }));
                return true;
            } catch (_) {}
            return false;
        }

        function clickAtCenter(el) {
            if (!el) return false;
            try {
                const rect = el.getBoundingClientRect();
                if (!rect || !rect.width || !rect.height) return false;
                const cx = rect.left + rect.width / 2;
                const cy = rect.top + rect.height / 2;
                const target = document.elementFromPoint(cx, cy) || el;
                try { el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }); } catch (_) {}
                try { el.focus({ preventScroll: true }); } catch (_) {}
                return clickWithEvents(target);
            } catch (_) {
                return false;
            }
        }

        function findStartButtons(root = document) {
            const nodes = collectShadowCandidates(root);
            const matches = [];
            nodes.forEach(node => {
                if (!node || !node.tagName) return;
                const tag = node.tagName.toLowerCase();
                const role = node.getAttribute && node.getAttribute('role');
                const isButtonLike = tag === 'button' || tag === 'ct-button' || tag === 'a' || role === 'button';
                if (!isButtonLike) return;
                const textMatch = textLooksLikeStart(node.textContent || '');
                const attrMatch = attrsLookLikeStart(node);
                if ((textMatch || attrMatch) && isVisibleButton(node)) {
                    matches.push(node);
                }
            });
            return matches;
        }

        function clickChessTempoStartButton(reason = 'auto-start') {
            const containers = [];
            const modal = document.querySelector('.mdc-dialog--open, .ct-dialog, .mat-dialog-container, .cdk-overlay-container .ct-dialog');
            if (modal) containers.push(modal);
            containers.push(document);

            for (const container of containers) {
                const candidates = findStartButtons(container);
                if (!candidates.length) continue;

                nextLog(`Start/resume candidates (${reason}):`, candidates.map(descEl));

                for (const target of candidates) {
                    if (!target) continue;
                    let clicked = false;
                    if (!clicked) clicked = clickSimple(target);
                    if (!clicked) clicked = clickAtCenter(target);
                    if (!clicked) clicked = clickWithEvents(target);
                    if (clicked) {
                        nextLog(`Start/resume click (${reason}) on`, descEl(target));
                        return true;
                    }
                }
            }
            return false;
        }

        function getActionsContainer() {
            return document.querySelector('.ct-problems-actions-buttons') || document.body || document;
        }

        function isVisibleCandidate(node) {
            if (!node) return false;
            const style = window.getComputedStyle(node);
            if (!style) return false;
            const visible = style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity || '1') > 0.05;
            const hiddenClass = node.classList && node.classList.contains('ct-hidden');
            return visible && !hiddenClass;
        }

        function findDeepNextButtons(container) {
            const result = [];
            if (!container) return result;
            const nodes = collectShadowCandidates(container);
            nodes.forEach(node => {
                if (!node.tagName) return;
                const tag = node.tagName.toLowerCase();
                if (tag !== 'button' && tag !== 'ct-button') return;
                const text = (node.textContent || '').trim().toLowerCase();
                if (!text.includes('следующий')) return;
                if (!isVisibleCandidate(node)) return;
                result.push(node);
            });
            return result;
        }

        function getActionableNextTargets() {
            const container = getActionsContainer();
            if (!container) return [];
            const explicitNodes = [
                container.querySelector('#ct-69'),
                container.querySelector('#ct-68')
            ].filter(Boolean);

            const nodes = Array.from(container.querySelectorAll(`
                ct-button.ct-tactics-next-button:not(.ct-hidden),
                ct-button.ct-tactics-next-button:not(.ct-hidden) button,
                .ct-tactics-next-button:not(.ct-hidden),
                .ct-tactics-next-button:not(.ct-hidden) button
            `.replace(/\s+/g, ' ')));

            const shadowCandidates = collectShadowCandidates(container).filter(node => {
                if (!node.tagName) return false;
                const tag = node.tagName.toLowerCase();
                const cls = node.classList ? Array.from(node.classList) : [];
                const id = node.id || '';
                if (cls.some(c => c.includes('ct-tactics-next-button'))) return true;
                if (id === 'ct-68' || id === 'ct-69') return true;
                const text = (node.textContent || '').toLowerCase();
                return text && (textLooksLikeNext(text) || attrsLookLikeNext(node));
            });

            const targets = [];
            const considerNode = (node) => {
                if (!node) return;
                const style = window.getComputedStyle(node);
                const visible = style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity || '1') > 0.05;
                if (!visible) return;
                const innerButton = node.tagName.toLowerCase() === 'button' ? node : (node.querySelector && node.querySelector('button')) || null;
                const outer = node.tagName.toLowerCase() === 'ct-button' ? node : null;
                [outer || null, innerButton].forEach(candidate => {
                    if (!candidate) return;
                    forceEnableElement(candidate);
                    targets.push(candidate);
                });
            };

            explicitNodes.forEach(considerNode);
            nodes.forEach(considerNode);
            shadowCandidates.forEach(considerNode);

            if (!targets.length) {
                findDeepNextButtons(container).forEach(btn => targets.push(btn));
            }

            nextLog('CT next buttons found:', targets.map(descEl));

            if (targets.length > 1) {
                return [targets[0]];
            }

            return targets;
        }

        function dispatchKeyboardNext() {
            const keys = ['ArrowRight', 'Enter', ' '];
            keys.forEach(key => {
                try {
                    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, code: key }));
                    window.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key, code: key }));
                } catch (_) {}
                try {
                    document.body && document.body.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, code: key }));
                    document.body && document.body.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key, code: key }));
                } catch (_) {}
            });
        }

        function getChessTempoNextUrl() {
            const container = getActionsContainer();
            const btn = container && (
                container.querySelector('.ct-problem-action-button.ct-tactics-next-button') ||
                container.querySelector('button[data-cy*="next"]') ||
                container.querySelector('button[data-qa*="next"]') ||
                container.querySelector('button[aria-label*="Next"]') ||
                container.querySelector('button[aria-label*="След"]') ||
                getActionableNextTargets()[0]
            );
            if (!btn) return null;

            const linkEl = btn.querySelector && btn.querySelector('a[href]');
            if (linkEl && linkEl.href) return linkEl.href;

            const attrNames = ['href', 'data-href', 'routerlink', 'routerLink', 'ng-reflect-router-link', 'ng-reflect-href'];
            for (const name of attrNames) {
                const val = btn.getAttribute && btn.getAttribute(name);
                if (val) {
                    try {
                        return new URL(val, window.location.href).href;
                    } catch (_) {}
                }
            }
            return null;
        }

        function forceNavigateToNextPuzzle(reason = 'fallback') {
            if (chessTempoNavigationForced) return;
            chessTempoNavigationForced = true;
            try {
                const target = `${chessTempoTacticsURL}?auto=1&reason=${encodeURIComponent(reason)}&ts=${Date.now()}`;
                nextWarn('Force navigation to next puzzle:', target);
                window.location.href = target;
            } catch (e) {
                nextWarn('Failed to force navigation', e);
            }
        }

        function clickChessTempoNextButton() {
            if (isChessTempoModalOpen()) {
                if (clickChessTempoStartButton('modal-open')) {
                    return true;
                }
                nextLog('Modal open - skip auto-next');
                return false;
            }

            const container = getActionsContainer();
            const selectors = [
                '.ct-problem-action-button.ct-tactics-next-button:not(.ct-hidden) button',
                '.ct-problem-action-button.ct-tactics-next-button:not(.ct-hidden)',
                'button.ct-tactics-next-button:not(.ct-hidden)'
            ];

            const candidates = new Set();
            getActionableNextTargets().forEach(n => candidates.add(n));
            selectors.forEach(sel => {
                Array.from(container.querySelectorAll(sel)).forEach(n => candidates.add(n));
            });
            collectShadowCandidates(container).forEach(n => {
                if (!n || !n.tagName) return;
                const tag = n.tagName.toLowerCase();
                const cls = n.classList ? Array.from(n.classList) : [];
                if (cls.some(c => c.includes('ct-tactics-next-button'))) candidates.add(n);
                if (tag === 'button' && textLooksLikeNext(n.textContent || '')) candidates.add(n);
                if (n.id === 'ct-68' || n.id === 'ct-69') candidates.add(n);
            });

            if (!candidates.size) {
                const startClicked = clickChessTempoStartButton('no-next-button');
                if (startClicked) return true;
            }

            nextLog('Candidate set:', Array.from(candidates).map(descEl));

            let clickedAny = false;
            const clickHostAndInner = (node) => {
                if (!node) return false;
                const inner = node.querySelector ? node.querySelector('button') : null;
                let local = false;
                [node, inner].forEach(target => {
                    if (!target) return;
                    if (clickWithEvents(target)) { local = true; return; }
                    if (clickSimple(target)) { local = true; return; }
                    if (clickAtCenter(target)) { local = true; return; }
                });
                if (!local) {
                    dispatchKeyboardNext();
                    local = true;
                }
                return local;
            };

            const tryAllClickVariants = (target) => {
                let localClicked = false;
                if (!localClicked) localClicked = clickWithEvents(target);
                if (!localClicked) localClicked = clickSimple(target);
                if (!localClicked) localClicked = clickAtCenter(target);
                if (!localClicked) {
                    dispatchKeyboardNext();
                    localClicked = true;
                }
                return localClicked;
            };

            for (const target of candidates) {
                if (!target) continue;
                const clicked = clickHostAndInner(target) || tryAllClickVariants(target);
                if (clicked) {
                    clickedAny = true;
                    nextLog('Click dispatched on', descEl(target));
                }
            }

            if (clickedAny) return true;
            if (clickChessTempoStartButton('fallback')) return true;

            nextWarn('No next button clicked');
            return false;
        }

        function stopChessTempoNextLoop() {
            if (chessTempoNextInterval) {
                clearInterval(chessTempoNextInterval);
                chessTempoNextInterval = null;
            }
            chessTempoNextAttempts = 0;
            chessTempoNextKey = null;
        }

        function startChessTempoNextLoop(delayMs = 800) {
            stopChessTempoNextLoop();
            chessTempoNextKey = chessTempoPuzzleKey;

            const hasAdvancedToNextPuzzle = () => chessTempoPuzzleKey !== chessTempoNextKey;

            setTimeout(() => {
                if (hasAdvancedToNextPuzzle()) {
                    stopChessTempoNextLoop();
                    return;
                }

                chessTempoNextAttempts = 0;
                const maxAttempts = 10;

                chessTempoNextInterval = setInterval(() => {
                    chessTempoNextAttempts++;

                    refreshChessTempoPuzzleKey();

                    if (hasAdvancedToNextPuzzle()) {
                        stopChessTempoNextLoop();
                        return;
                    }

                    if (Date.now() - chessTempoLastClickTs < 400) {
                        return;
                    }

                    const clicked = clickChessTempoNextButton();
                    if (clicked) {
                        stopChessTempoNextLoop();
                        chessTempoLastClickTs = Date.now();
                        setTimeout(() => {
                            refreshChessTempoPuzzleKey();
                            if (!hasAdvancedToNextPuzzle()) {
                                const directUrl = getChessTempoNextUrl();
                                if (directUrl && !chessTempoNavigationForced) {
                                    nextLog('Post-click direct href navigation to', directUrl);
                                    try {
                                        window.location.href = directUrl;
                                        chessTempoNavigationForced = true;
                                    } catch (e) {
                                        forceNavigateToNextPuzzle('post-click-href');
                                    }
                                } else {
                                    forceNavigateToNextPuzzle('post-click');
                                }
                            }
                        }, 600);
                        if (chessTempoNextAttempts === 1 || chessTempoNextAttempts % 3 === 0) {
                            nextLog(`ChessTempo next attempt #${chessTempoNextAttempts} dispatched for ${chessTempoNextKey}`);
                        }
                        return;
                    }

                    if (chessTempoNextAttempts >= 3) {
                        const directUrl = getChessTempoNextUrl();
                        if (directUrl) {
                            nextLog('Direct href navigation to', directUrl);
                            stopChessTempoNextLoop();
                            try {
                                window.location.href = directUrl;
                                chessTempoNavigationForced = true;
                            } catch (e) {
                                forceNavigateToNextPuzzle('href-fallback');
                            }
                            return;
                        }
                    }

                    if (chessTempoNextAttempts >= maxAttempts) {
                        nextWarn('Next attempts exhausted, forcing navigation');
                        forceNavigateToNextPuzzle('exhausted');
                        stopChessTempoNextLoop();
                    }
                }, 350);
            }, delayMs);
        }

        function ensureChessTempoAutoStartLoop() {
            if (chessTempoAutoStartInterval) return;
            chessTempoAutoStartInterval = setInterval(() => {
                const hasProblemId = !!document.querySelector('[data-problem-id], [data-puzzle-id], [data-problemid]');
                const hasBoard = !!document.querySelector('.ct-problem-board, .ct-board, chess-board, .ct-problem');
                if (hasProblemId || hasBoard) return;
                clickChessTempoStartButton('auto-start-loop');
            }, 1200);
        }

        function checkChessTempoSolved() {
            refreshChessTempoPuzzleKey();
            const solvedElement = document.querySelector('.ct-problem-result-output.ct-correct, .ct-problem-result.ct-correct, .ct-problem-result .ct-correct, problem-result .ct-correct');
            if (solvedElement && !chessTempoPuzzleSolved) {
                chessTempoPuzzleSolved = true;
                nextLog('Puzzle solved, auto-next trigger');
                startChessTempoNextLoop();
            } else if (!solvedElement && chessTempoPuzzleSolved) {
                chessTempoPuzzleSolved = false;
            }
        }

        function setupChessTempoAutoNext() {
            if (chessTempoTrackingStarted) return;
            chessTempoTrackingStarted = true;

            refreshChessTempoPuzzleKey();
            checkChessTempoSolved();

            chessTempoSolveObserver = new MutationObserver(() => checkChessTempoSolved());
            chessTempoSolveObserver.observe(document.body, { childList: true, subtree: true });
            chessTempoKeyInterval = setInterval(refreshChessTempoPuzzleKey, 1000);
            ensureChessTempoAutoStartLoop();

            nextLog('ChessTempo auto-next initialized');
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', setupChessTempoAutoNext);
        } else {
            setupChessTempoAutoNext();
        }
    })();

})();
