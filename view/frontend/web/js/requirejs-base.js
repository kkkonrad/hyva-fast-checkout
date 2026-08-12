/**
 * Runs before Magento's RequireJS bootstrap on the Fastcheckout page.
 */
(function () {
    'use strict';

    var asset = document.querySelector('link[href*="/frontend/"]'),
        match = asset && asset.href.match(/^(.*\/frontend\/[^/]+\/[^/]+\/[^/]+\/)/),
        storageKeys = [
            'mage-cache-storage',
            'mage-cache-storage-section-invalidation'
        ];

    storageKeys.forEach(function (storageKey) {
        try {
            var data = JSON.parse(window.localStorage.getItem(storageKey));

            if (!data || Array.isArray(data) || typeof data !== 'object') {
                window.localStorage.setItem(storageKey, '{}');
            }
        } catch (error) {
            try {
                window.localStorage.setItem(storageKey, '{}');
            } catch (storageError) {
                // Native customer-data will handle unavailable browser storage.
            }
        }
    });

    if (match) {
        window.require = Object.assign(window.require || {}, {baseUrl: match[1]});
    }

})();
