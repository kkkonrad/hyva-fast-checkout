define([
    'mage/utils/wrapper'
], function (wrapper) {
    'use strict';

    return function (setBillingAddressAction) {
        return wrapper.wrap(setBillingAddressAction, function (originalAction, messageContainer) {
            if (
                window.fastcheckoutHyvaPayment &&
                typeof window.fastcheckoutHyvaPayment.onSetBillingAddressAction === 'function'
            ) {
                return window.fastcheckoutHyvaPayment.onSetBillingAddressAction(messageContainer, originalAction);
            }

            return originalAction(messageContainer);
        });
    };
});
