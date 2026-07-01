define([
    'mage/utils/wrapper',
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function (wrapper, isFastcheckoutActive) {
    'use strict';

    return function (selectShippingAddress) {
        return wrapper.wrap(selectShippingAddress, function (originalSelectShippingAddress, shippingAddress) {
            var result = originalSelectShippingAddress(shippingAddress);

            if (
                isFastcheckoutActive() &&
                window.fastcheckoutHyvaShipping &&
                typeof window.fastcheckoutHyvaShipping.onSelectShippingAddressAction === 'function'
            ) {
                Promise.resolve(window.fastcheckoutHyvaShipping.onSelectShippingAddressAction(shippingAddress))
                    .catch(function (error) {
                        if (window.console && typeof window.console.warn === 'function') {
                            window.console.warn('Fastcheckout: shipping address sync failed.', error);
                        }
                    });
            }

            return result;
        });
    };
});
