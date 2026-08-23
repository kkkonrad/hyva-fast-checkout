define([
    'Magento_Checkout/js/model/quote',
    'Magento_Checkout/js/model/step-navigator',
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function (quote, stepNavigator, isFastcheckoutActive) {
    'use strict';

    function isTwoStep() {
        var settings = window.checkoutConfig && window.checkoutConfig.fastcheckoutSettings;

        return Boolean(settings && settings.twoStep);
    }

    function previewValue(component, field) {
        var method,
            value;

        // Keep the binding subscribed so the server value replaces the preview after Next.
        component.totals();
        method = quote.shippingMethod && quote.shippingMethod();

        if (!isFastcheckoutActive() || !isTwoStep() ||
            stepNavigator.isProcessed('shipping') || !method) {
            return null;
        }

        value = typeof method[field] === 'undefined' ? method.amount : method[field];

        return typeof value === 'undefined' ? null : component.getFormattedPrice(value);
    }

    function valueOrSuper(component, field) {
        var preview = previewValue(component, field);

        return preview === null ? component._super() : preview;
    }

    return function (Component) {
        var extension = {
            getValue: function () {
                return valueOrSuper(this, 'price_excl_tax');
            }
        };

        if (Component.prototype && typeof Component.prototype.getIncludingValue === 'function') {
            extension.getIncludingValue = function () {
                return valueOrSuper(this, 'price_incl_tax');
            };
            extension.getExcludingValue = function () {
                return valueOrSuper(this, 'price_excl_tax');
            };
        }

        return Component.extend(extension);
    };
});
