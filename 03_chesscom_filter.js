// ==UserScript==
// @name         03_chesscom_filter - Фильтр контента Chess.com
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Скрытие нежелательных турниров и элементов интерфейса на Chess.com
// @match        https://www.chess.com/*
// @match        https://chess.com/*
// @grant        GM_addStyle
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // ===========================================
    // === Chess.com Tournament Filter ===
    // ===========================================
    (function() {
        const filters = ["Bullet", "Live 960", "3 Check", "King of the Hill", "Crazyhouse"];
        
        function filterTournaments() {
            document.querySelectorAll('.tournaments-list-item-component').forEach(row => {
                const text = row.innerText;
                for (const f of filters) {
                    if (text.includes(f)) {
                        row.style.display = 'none';
                        console.log(`[ChessComFilter] Hid tournament by "${f}": "${text.split('\n')[0]}"`);
                        break;
                    }
                }
            });
        }

        window.addEventListener("load", () => {
            console.log("[ChessComFilter] Page loaded, filtering tournaments");
            filterTournaments();
            const container = document.querySelector('.tournaments-list-list-body');
            if (container) {
                const obs = new MutationObserver(() => {
                    console.log("[ChessComFilter] MutationObserver: updating filter");
                    filterTournaments();
                });
                obs.observe(container, { childList: true, subtree: true });
            }
        });
    })();

    // ======================================
    // === Hide Elements (GM_addStyle) ===
    // ======================================
    GM_addStyle(`
        a.direct-menu-item-component.direct-menu-item[href="/variants"] { display: none !important; }
        .tournaments-header-tabs-component nav a:not(.tournaments-header-tabs-highlighted) { display: none !important; }
        .tournaments-header-tabs-component .tournament-header-buttons-component,
        .layout-column-two { display: none !important; }
        .tournaments-filter-component,
        .competition-announcements-competition,
        a[data-nav-link="play"] { display: none !important; }
        a.nav-link-component.nav-link-main-link.sprite.variants[href="/variants"] { display: none !important; }
        .selector-button-dropdown-component > button:nth-child(n+2):nth-child(-n+10) { display: none !important; }
        .toggle-custom-game-component,
        .live-stats-component,
        .nav-search-form,
        .direct-menu-sub-items { display: none !important; }
        div[data-tab="games"],
        div[data-tab="players"] { display: none !important; }
        .search-tooltip-component.search-icon-font.icon-шасс.мagnifying-глас,
        button.nav-link-компонент-nav-link-mainлин-nav-link-кнопка-наверх[data-amplitude-nav-selection="more-top"],
        a.nav-link-компонент-nav-link-mainлин-nav-link-кнопка-наверх[data-amplitude-nav-selection="social-top"],
        a.nav-link-компонент-nav-link-mainлин-nav-link-кнопка-наверх[data-amplitude-nav-selection="news-top"],
        a.nav-link-компонент-nav-link-mainлин-nav-link-кнопка-наверх[data-amplitude-nav-selection="watch-top"] { display: none !important; }
        .nav-link-компонент-nav-link-mainлин čесс-logo-wrapper.sprite čесс-logo[data-nav-link="home"],
        .nav-menu-area,
        button.nav-action.ui-mode[data-amplitude-nav-selection="subnav-uимode"],
        button.nav-action.resize[data-amplitude-nav-selection="subnav-collapseexpand"],
        a.nav-action.link.has-попover=settings[data-amplitude-nav-selection="subnav-settings"],
        button.btn-link.logout[data-amplitude-nav-selection="subnav-settings-logout"],
        button.nav-action.has-попover.help[data-amplitude-nav-selection="subnav-help"] { display: none !important; }
        .toolbar-menu-area.toolbar-area-right,
        .v5-header-link.v5-x-wide[href="/games/archive/deмченко_timофей"],
        footer#navigation-footer { display: none !important; }
        .nav-link-компонент-nav-link-mainлин.sprite.tournaments[href="/tournaments"] { display: none !important; }
        .nav-link-компонент-nav-link-mainлин.sprite.computer[href="/play/computer"],
        .nav-link-компонент-nav-link-mainлин.sprite.leaderboard[href="/leaderboard"],
        .nav-link-компонент-nav-link-mainлин.sprite.archive[href="/games/archive"] { display: none !important; }
        .game-panel-btns-container.board-panel-game-панель-wrapper { display: none !important; }
        .bot-компонент[data-бот-selection-name="Наташа"] { display: none !important; }
    `);
    console.log("[HideElements] GM_addStyle applied");

    // ==========================================================
    // === Hide Specific Tournaments and Sections (JS) ===
    // ==========================================================
    (function() {
        function hideTournaments() {
            document.querySelectorAll('.tournaments-list-item-component.tournaments-list-item-list-row').forEach(el => {
                const toHide =
                    el.querySelector('.threecheck.icon-font-chess.icon-colored') ||
                    el.querySelector('.bullet.icon-font-chess.icon-colored') ||
                    el.querySelector('.live960.icon-font-chess.icon-colored') ||
                    el.querySelector('.kingofthehill.icon-font-chess.icon-colored') ||
                    el.querySelector('.crazyhouse.icon-font-chess.icon-colored') ||
                    el.querySelector('.bughouse.icon-font-chess.icon-colored') ||
                    el.querySelector('.threecheck.tournament-event-icon') ||
                    el.querySelector('.bullet.tournament-event-icon') ||
                    el.querySelector('.live960.tournament-event-icon') ||
                    el.querySelector('.kingofthehill.tournament-event-icon') ||
                    el.querySelector('.crazyhouse.tournament-event-icon') ||
                    el.querySelector('.bughouse.tournament-event-icon') ||
                    el.querySelector('.icon-font-chess.icon-colored.kingofthehill.tournament-event-icon') ||
                    (el.querySelector('.tournaments-list-item-time-label-col') &&
                     el.querySelector('.tournaments-list-item-time-label-col').textContent.trim() === '1 мин.');

                if (toHide) {
                    el.style.setProperty('display', 'none', 'important');
                    console.log(`[HideTournaments] Hid tournament: "${el.innerText.split('\n')[0]}"`);
                }
            });
        }

        function hideSections() {
            document.querySelectorAll('.time-selector-section-component').forEach(sec => {
                const lbl = sec.querySelector('.time-selector-section-label');
                if (lbl && (lbl.textContent.trim() === 'Заочные' || lbl.textContent.trim() === 'Пуля')) {
                    sec.style.setProperty('display', 'none', 'important');
                    console.log(`[HideSections] Hid section: ${lbl.textContent.trim()}`);
                }
            });
            document.querySelectorAll('.recent-time-section-component').forEach(sec => {
                const lbl = sec.querySelector('.recent-time-section-label');
                if (lbl && lbl.textContent.trim() === 'Последние') {
                    sec.style.setProperty('display', 'none', 'important');
                    console.log("[HideSections] Hid section: Последние");
                }
            });
        }

        window.addEventListener('load', () => {
            console.log("[HideTournaments] Page loaded, hiding tournaments and sections");
            hideTournaments();
            hideSections();
        });

        setInterval(() => {
            hideTournaments();
            hideSections();
        }, 1000);
    })();

})();