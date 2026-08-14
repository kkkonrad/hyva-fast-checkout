define([
    'mage/utils/wrapper',
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function (wrapper, isFastcheckoutActive) {
    'use strict';

    function isTwoStep() {
        var settings = window.checkoutConfig && window.checkoutConfig.fastcheckoutSettings;

        return Boolean(settings && settings.twoStep);
    }

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
        if (!isFastcheckoutActive() || isTwoStep()) {
            return stepNavigator;
        }

        stepNavigator.setHash = wrapper.wrap(
            stepNavigator.setHash,
            function (originalSetHash, hash) {
                removeHash();
            }
        );

        stepNavigator.isProcessed = wrapper.wrap(
            stepNavigator.isProcessed,
            function (originalIsProcessed, code) {
                // One-step layout keeps shipping visible, so Magento never
                // advances past it. Payment/sidebar modules still gate on this.
                if (code === 'shipping') {
                    return true;
                }

                return originalIsProcessed(code);
            }
        );

        stepNavigator.registerStep = wrapper.wrap(
            stepNavigator.registerStep,
            function (originalRegisterStep, code, alias, title, isVisible, navigate, sortOrder) {
                var result = originalRegisterStep(code, alias, title, isVisible, navigate, sortOrder);

                if (stepNavigator.steps) {
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

        removeHash();
        window.addEventListener('hashchange', removeHash);

        return stepNavigator;
    };
});
