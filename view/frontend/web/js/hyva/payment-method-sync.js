define([], function () {
    'use strict';

    return function (deps) {
        deps = deps || {};

        var quote = deps.quote,
            getMagewireComponent = typeof deps.getMagewireComponent === 'function' ? deps.getMagewireComponent : function () { return null; },
            getProperty = typeof deps.getProperty === 'function' ? deps.getProperty : function () { return ''; },
            persistPaymentMethod = typeof deps.persistPaymentMethod === 'function' ? deps.persistPaymentMethod : function () {},
            lastMagewirePaymentMethodCode = '',
            syncTimer = null,
            applyingFromBridge = false;

        function getCode(paymentMethod) {
            if (!paymentMethod) {
                return '';
            }
            if (typeof paymentMethod === 'string') {
                return paymentMethod;
            }

            return paymentMethod.method || '';
        }

        function getQuoteCode() {
            var current = quote && typeof quote.paymentMethod === 'function' ? quote.paymentMethod() : null;

            return getCode(current);
        }

        function setQuoteFromBridge(paymentMethod) {
            var methodCode = getCode(paymentMethod);

            if (!quote || typeof quote.paymentMethod !== 'function') {
                return;
            }

            if (getQuoteCode() === methodCode) {
                lastMagewirePaymentMethodCode = methodCode;
                return;
            }

            applyingFromBridge = true;
            try {
                quote.paymentMethod(methodCode ? paymentMethod : null);
                lastMagewirePaymentMethodCode = methodCode;
            } finally {
                applyingFromBridge = false;
            }
        }

        function syncToMagewire(paymentMethod) {
            var methodCode = getCode(paymentMethod);

            persistPaymentMethod(methodCode || null);

            if (!methodCode) {
                lastMagewirePaymentMethodCode = '';
                if (syncTimer) {
                    window.clearTimeout(syncTimer);
                }
                syncTimer = window.setTimeout(function () {
                    var wire = getMagewireComponent();

                    syncTimer = null;
                    if (wire && typeof wire.set === 'function') {
                        wire.set('paymentMethod', '');
                    }
                }, 50);
                return;
            }

            if (methodCode === lastMagewirePaymentMethodCode) {
                return;
            }

            lastMagewirePaymentMethodCode = methodCode;

            if (syncTimer) {
                window.clearTimeout(syncTimer);
            }

            syncTimer = window.setTimeout(function () {
                var wire = getMagewireComponent(),
                    currentMethod;

                syncTimer = null;

                if (!wire || typeof wire.call !== 'function') {
                    return;
                }

                currentMethod = getProperty(wire, 'paymentMethod');
                if (currentMethod !== methodCode) {
                    wire.call('selectPaymentMethod', methodCode);
                }
            }, 50);
        }

        function isSynced(methodCode) {
            return getQuoteCode() === methodCode &&
                lastMagewirePaymentMethodCode === methodCode &&
                !syncTimer;
        }

        return {
            getCode: getCode,
            getQuoteCode: getQuoteCode,
            setQuoteFromBridge: setQuoteFromBridge,
            syncToMagewire: syncToMagewire,
            isApplyingFromBridge: function () {
                return applyingFromBridge;
            },
            isSynced: isSynced,
            markSynced: function (methodCode) {
                lastMagewirePaymentMethodCode = methodCode || '';
            }
        };
    };
});
