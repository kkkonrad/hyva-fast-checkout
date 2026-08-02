define([], function () {
    'use strict';

    return function (deps) {
        deps = deps || {};

        var quote = deps.quote,
            persistPaymentMethod = typeof deps.persistPaymentMethod === 'function'
                ? deps.persistPaymentMethod
                : function () {},
            lastPersistedPaymentMethodCode = '',
            lockedUserPaymentMethodCode = '',
            paymentSelectionGeneration = 0,
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
            var current = quote && typeof quote.paymentMethod === 'function'
                ? quote.paymentMethod()
                : null;

            return getCode(current);
        }

        function rememberUserPaymentSelection(methodCode) {
            methodCode = methodCode || '';
            if (!methodCode) {
                lockedUserPaymentMethodCode = '';
                paymentSelectionGeneration += 1;
                return paymentSelectionGeneration;
            }

            methodCode = String(methodCode);
            if (methodCode !== lockedUserPaymentMethodCode) {
                paymentSelectionGeneration += 1;
            }
            lockedUserPaymentMethodCode = methodCode;

            return paymentSelectionGeneration;
        }

        function getUserSelectedPaymentMethod() {
            return lockedUserPaymentMethodCode || '';
        }

        function getPaymentSelectionGeneration() {
            return paymentSelectionGeneration;
        }

        /**
         * Keep a fresh shopper choice authoritative while asynchronous KO renderer
         * callbacks for an older method are still completing.
         */
        function isUserPaymentSelectionFresh() {
            return !!lockedUserPaymentMethodCode;
        }

        function clearUserPaymentSelection() {
            lockedUserPaymentMethodCode = '';
            paymentSelectionGeneration += 1;
        }

        function shouldAcceptPaymentSelection(paymentMethod, generation) {
            var methodCode = getCode(paymentMethod);

            if (typeof generation === 'number' && generation !== paymentSelectionGeneration) {
                return false;
            }
            if (!methodCode) {
                return !isUserPaymentSelectionFresh();
            }
            if (isUserPaymentSelectionFresh() && lockedUserPaymentMethodCode) {
                return methodCode === lockedUserPaymentMethodCode;
            }

            return true;
        }

        function setQuoteFromBridge(paymentMethod) {
            var methodCode = getCode(paymentMethod);

            if (!quote || typeof quote.paymentMethod !== 'function') {
                return;
            }
            if (!shouldAcceptPaymentSelection(methodCode)) {
                return;
            }
            if (getQuoteCode() === methodCode) {
                lastPersistedPaymentMethodCode = methodCode;
                return;
            }

            applyingFromBridge = true;
            try {
                quote.paymentMethod(methodCode ? paymentMethod : null);
                lastPersistedPaymentMethodCode = methodCode;
            } finally {
                applyingFromBridge = false;
            }
        }

        /**
         * Persist only Magento checkout-data state. The quote and REST payment
         * actions remain the runtime source of truth.
         */
        function persistSelection(paymentMethod) {
            var methodCode = getCode(paymentMethod);

            if (!shouldAcceptPaymentSelection(methodCode)) {
                return;
            }

            persistPaymentMethod(methodCode || null);
            lastPersistedPaymentMethodCode = methodCode;
        }

        function isSynced(methodCode) {
            methodCode = methodCode || '';

            return getQuoteCode() === methodCode &&
                lastPersistedPaymentMethodCode === methodCode;
        }

        function reassertUserPaymentOnQuote() {
            var methodCode = lockedUserPaymentMethodCode;

            if (
                !isUserPaymentSelectionFresh() ||
                !methodCode ||
                !quote ||
                typeof quote.paymentMethod !== 'function' ||
                getQuoteCode() === methodCode
            ) {
                return;
            }

            applyingFromBridge = true;
            try {
                quote.paymentMethod({ method: methodCode });
            } finally {
                applyingFromBridge = false;
            }
        }

        return {
            getCode: getCode,
            getQuoteCode: getQuoteCode,
            setQuoteFromBridge: setQuoteFromBridge,
            persistSelection: persistSelection,
            rememberUserPaymentSelection: rememberUserPaymentSelection,
            getUserSelectedPaymentMethod: getUserSelectedPaymentMethod,
            getPaymentSelectionGeneration: getPaymentSelectionGeneration,
            isUserPaymentSelectionFresh: isUserPaymentSelectionFresh,
            clearUserPaymentSelection: clearUserPaymentSelection,
            shouldAcceptPaymentSelection: shouldAcceptPaymentSelection,
            reassertUserPaymentOnQuote: reassertUserPaymentOnQuote,
            isApplyingFromBridge: function () {
                return applyingFromBridge;
            },
            isSynced: isSynced,
            markSynced: function (methodCode) {
                methodCode = methodCode || '';

                if (
                    methodCode &&
                    isUserPaymentSelectionFresh() &&
                    lockedUserPaymentMethodCode &&
                    methodCode !== lockedUserPaymentMethodCode
                ) {
                    return;
                }

                lastPersistedPaymentMethodCode = methodCode;
            }
        };
    };
});
