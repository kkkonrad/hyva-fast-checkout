define([
    'mage/utils/wrapper',
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function (wrapper, isFastcheckoutActive) {
    'use strict';

    function removeHash() {
        if (isFastcheckoutActive() && window.location.hash) {
            window.history.replaceState(
                window.history.state,
                document.title,
                window.location.pathname + window.location.search
            );
        }
    }

    return function (stepNavigator) {
        stepNavigator.setHash = wrapper.wrap(
            stepNavigator.setHash,
            function (originalSetHash, hash) {
                if (!isFastcheckoutActive()) {
                    return originalSetHash(hash);
                }

                removeHash();
            }
        );

        if (isFastcheckoutActive()) {
            removeHash();
            window.addEventListener('hashchange', removeHash);
        }

        return stepNavigator;
    };
});
