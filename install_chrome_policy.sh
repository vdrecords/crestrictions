#!/bin/bash
# Браузерный слой родительского контроля: Chrome не даёт даже НАЧАТЬ загрузку
# страниц переписки. Единственный слой, который не зависит от того, успел ли
# Tampermonkey внедрить юзерскрипт (гонка первых 0.5–2 с при перезапуске браузера).
#
# Запуск:   sudo bash install_chrome_policy.sh
# Проверка: chrome://policy → Reload policies → URLBlocklist
# Откат:    sudo bash install_chrome_policy.sh --uninstall
#
# Важно: правила действуют на ВСЕ профили Chrome на этой машине, включая
# родительский. Разделы переписки после установки недоступны и родителю —
# для своей работы используйте другой браузер (Safari / Firefox).

set -euo pipefail

POLICY_DOMAIN="/Library/Managed Preferences/com.google.Chrome"

if [ "$(id -u)" -ne 0 ]; then
    echo "Нужны права root: sudo bash $0" >&2
    exit 1
fi

if [ "${1:-}" = "--uninstall" ]; then
    defaults delete "$POLICY_DOMAIN" URLBlocklist 2>/dev/null || true
    killall cfprefsd 2>/dev/null || true
    echo "URLBlocklist снят. Перезапустите Chrome и проверьте chrome://policy."
    exit 0
fi

# Формат правил Chrome: host/path — совпадает с хостом и его поддоменами.
defaults write "$POLICY_DOMAIN" URLBlocklist -array \
    "lichess.org/inbox" \
    "lichess.org/forum" \
    "lichess.org/team" \
    "lichess.org/msg" \
    "lichess.org/ublog" \
    "lichess.org/coach" \
    "lichess.org/@" \
    "chess.com/messages" \
    "chess.com/forum" \
    "chess.com/clubs" \
    "chess.com/friends" \
    "chess.com/members" \
    "chess.com/coaches"

plutil -convert xml1 "$POLICY_DOMAIN.plist" 2>/dev/null || true
chmod 644 "$POLICY_DOMAIN.plist"
killall cfprefsd 2>/dev/null || true

echo "Готово. Правила:"
defaults read "$POLICY_DOMAIN" URLBlocklist
echo
echo "Перезапустите Chrome и проверьте chrome://policy (Reload policies)."
