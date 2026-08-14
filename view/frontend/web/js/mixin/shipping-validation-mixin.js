define([
    'jquery',
    'Magento_Checkout/js/model/quote',
    'Kkkonrad_Fastcheckout/js/model/one-step-validator',
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function ($, quote, validator, isFastcheckoutActive) {
    'use strict';

    return function (Component) {
        return Component.extend({
            validateShippingInformation: function () {
                var scroller,
                    scrollTop,
                    isValid,
                    nativeFocus,
                    addressRoot;

                if (!isFastcheckoutActive()) {
                    return this._super();
                }

                scroller = document.scrollingElement || document.documentElement;
                scrollTop = scroller.scrollTop;
                addressRoot = document.querySelector('.fastcheckout-native-shipping-address');

                if (window.HTMLElement && addressRoot) {
                    nativeFocus = window.HTMLElement.prototype.focus;
                    window.HTMLElement.prototype.focus = function (options) {
                        return nativeFocus.call(this, addressRoot.contains(this) ? Object.assign(
                            {},
                            options || {},
                            {preventScroll: true}
                        ) : options);
                    };
                }
                try {
                    if ((!quote.shippingMethod || !quote.shippingMethod()) &&
                        !validator.validateShippingAddress(this)) {
                        this.errorValidationMessage(false);
                        isValid = false;
                    } else {
                        isValid = this._super();
                    }
                } finally {
                    if (nativeFocus) {
                        window.HTMLElement.prototype.focus = nativeFocus;
                    }
                }

                if (!isValid) {
                    $('html, body').stop(true);
                    scroller.scrollTop = scrollTop;
                    document.dispatchEvent(new Event(
                        'fastcheckout:shipping-validation-failed'
                    ));
                }

                return isValid;
            }
        });
    };
});
