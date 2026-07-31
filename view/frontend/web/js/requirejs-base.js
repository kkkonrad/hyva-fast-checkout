/**
 * Runs before Magento's RequireJS bootstrap on the Fastcheckout page.
 */
(function () {
    'use strict';

    var asset = document.querySelector('link[href*="/frontend/"]');
    var match = asset && asset.href.match(/^(.*\/frontend\/[^/]+\/[^/]+\/[^/]+\/)/);

    if (match) {
        window.require = Object.assign(window.require || {}, {baseUrl: match[1]});
    }

    /**
     * Payment renderers written for Luma read window.checkoutConfig.payment.<code>.<key>
     * without guarding the middle level. Hand them an empty config bag instead of
     * letting the checkout die on a TypeError.
     *
     * Only codes the store actually offers are auto-created. Anything else stays
     * undefined, exactly as on the native checkout, so `if (checkoutConfig.payment.x)`
     * keeps working as a feature check and the object does not collect junk keys on
     * every read.
     */
    window.fastcheckoutInitPaymentProxy = function (paymentConfig, paymentMethods) {
        paymentConfig = paymentConfig || {};

        if (paymentConfig.__isProxy || typeof window.Proxy !== 'function') {
            return paymentConfig;
        }

        var knownCodes = {};
        (paymentMethods || []).forEach(function (method) {
            var code = method && (method.code || method.method);

            if (typeof code === 'string' && code !== '') {
                knownCodes[code] = true;
            }
        });

        return new window.Proxy(paymentConfig, {
            get: function (target, prop) {
                if (prop === '__isProxy') {
                    return true;
                }
                if (prop === '__raw__') {
                    return target;
                }
                if (typeof prop === 'string' && knownCodes[prop] === true && !(prop in target)) {
                    target[prop] = {};
                }

                return target[prop];
            }
        });
    };
})();
