define([
    'mage/utils/wrapper',
    'Magento_Customer/js/customer-data',
    'mage/url',
    'mage/translate',
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function (wrapper, customerData, url, $t, isFastcheckoutActive) {
    'use strict';

    function errorData(response) {
        if (response && response.responseJSON) {
            return response.responseJSON;
        }

        try {
            return JSON.parse(response && response.responseText || '{}');
        } catch (exception) {
            return {};
        }
    }

    function isMissingQuote(response) {
        var data = errorData(response),
            parameters = data.parameters || {},
            message = String(data.message || ''),
            status = Number(response && response.status);

        return status === 401 && parameters.resources === 'self' ||
            status === 404 && (
                String(parameters.fieldName || '').toLowerCase() === 'cartid' ||
                message === 'Current customer does not have an active cart.' ||
                message === $t('Current customer does not have an active cart.')
            );
    }

    return function (errorProcessor) {
        errorProcessor.process = wrapper.wrap(
            errorProcessor.process,
            function (originalProcess, response, messageContainer) {
                if (!isFastcheckoutActive() || !isMissingQuote(response)) {
                    return originalProcess(response, messageContainer);
                }

                try {
                    customerData.invalidate(['cart', 'checkout-data']);
                } catch (exception) {
                    // A damaged browser cache must not prevent recovery.
                }
                errorProcessor.redirectTo(url.build('checkout/cart/'));
            }
        );

        return errorProcessor;
    };
});
