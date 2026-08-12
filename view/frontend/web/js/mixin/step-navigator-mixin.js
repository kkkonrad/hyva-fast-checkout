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

        stepNavigator.isProcessed = wrapper.wrap(
            stepNavigator.isProcessed,
            function (originalIsProcessed, code) {
                // One-step layout keeps shipping visible, so Magento never
                // advances past it. Payment/sidebar modules still gate on this.
                if (isFastcheckoutActive() && code === 'shipping') {
                    return true;
                }

                return originalIsProcessed(code);
            }
        );

        stepNavigator.registerStep = wrapper.wrap(
            stepNavigator.registerStep,
            function (originalRegisterStep, code, alias, title, isVisible, navigate, sortOrder) {
                var result = originalRegisterStep(code, alias, title, isVisible, navigate, sortOrder);

                if (isFastcheckoutActive() && stepNavigator.steps) {
                    // registerStep hides every non-active step. Shipping may
                    // register after payment and would otherwise hide it.
                    stepNavigator.steps().forEach(function (step) {
                        if ((step.code === 'shipping' || step.code === 'payment') &&
                            step.isVisible && typeof step.isVisible === 'function') {
                            step.isVisible(true);
                        }
                    });
                }

                return result;
            }
        );

        if (isFastcheckoutActive()) {
            removeHash();
            window.addEventListener('hashchange', removeHash);
        }

        return stepNavigator;
    };
});
