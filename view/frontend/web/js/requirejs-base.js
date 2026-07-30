(function () {
    'use strict';

    var asset = document.querySelector('link[href*="/frontend/"]');
    var match = asset && asset.href.match(/^(.*\/frontend\/[^/]+\/[^/]+\/[^/]+\/)/);

    if (match) {
        window.require = Object.assign(window.require || {}, {baseUrl: match[1]});
    }
})();
