define([
    'mage/utils/wrapper',
    'Magento_Checkout/js/model/quote',
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function (wrapper, quote, isFastcheckoutActive) {
    'use strict';

    function rules() {
        var value = window.checkoutConfig &&
            window.checkoutConfig.fastcheckoutSettings &&
            window.checkoutConfig.fastcheckoutSettings.shippingPaymentMapping;

        if (Array.isArray(value)) {
            return value;
        }
        if (value && typeof value === 'object') {
            return Object.keys(value).map(function (key) {
                return value[key];
            });
        }

        return [];
    }

    function shippingCode() {
        var method = quote.shippingMethod && quote.shippingMethod();

        return method && method.carrier_code && method.method_code
            ? method.carrier_code + '_' + method.method_code
            : '';
    }

    function matches(rule, code) {
        var expected = String(rule || '').trim(),
            carrier = code.split('_')[0] || '',
            prefix;

        if (!expected || !code) {
            return false;
        }
        if (expected === '*' || expected === code || expected === carrier) {
            return true;
        }
        if (expected.slice(-1) !== '*') {
            return false;
        }

        prefix = expected.slice(0, -1).replace(/_+$/, '');
        return !!prefix && code.indexOf(prefix + '_') === 0;
    }

    function filterMethods(methods) {
        var mapping = rules(),
            code = shippingCode(),
            allowed = [];

        if (!mapping.length || !code || quote.isVirtual()) {
            return methods;
        }

        mapping.forEach(function (rule) {
            if (rule && matches(rule.shipping_method, code) && rule.payment_method) {
                allowed.push(String(rule.payment_method));
            }
        });

        return methods.filter(function (method) {
            return method && allowed.indexOf(String(method.method || method.code || '')) !== -1;
        });
    }

    return function (paymentService) {
        paymentService.setPaymentMethods = wrapper.wrap(
            paymentService.setPaymentMethods,
            function (originalSetPaymentMethods, methods) {
                var source = Array.isArray(methods) ? methods : [];

                return originalSetPaymentMethods(
                    isFastcheckoutActive() ? filterMethods(source) : source
                );
            }
        );

        return paymentService;
    };
});
