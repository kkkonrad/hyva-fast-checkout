define([], function () {
    'use strict';

    return function (deps) {
        deps = deps || {};

        var quote = deps.quote,
            getMagewireComponent = typeof deps.getMagewireComponent === 'function' ? deps.getMagewireComponent : function () { return null; },
            getProperty = typeof deps.getProperty === 'function' ? deps.getProperty : function () { return ''; },
            persistPaymentMethod = typeof deps.persistPaymentMethod === 'function' ? deps.persistPaymentMethod : function () {},
            lastMagewirePaymentMethodCode = '',
            // Shopper-picked payment wins over lagging Magewire / KO renderer boot.
            lockedUserPaymentMethodCode = '',
            lockedUserPaymentAt = 0,
            // Bumps on every shopper payment click so late async callbacks for an
            // older pick (renderer load, selectPaymentMethod XHR) can be ignored.
            paymentSelectionGeneration = 0,
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

        /**
         * Code of the payment radio the shopper can actually see selected, if any.
         * Disallowed methods are rendered disabled by the shipping->payment mapping.
         */
        function getCheckedEnabledPaymentCode() {
            var checked;

            if (typeof document === 'undefined' || !document.querySelector) {
                return '';
            }

            checked = document.querySelector('input[name="payment_method"]:checked:not([disabled])');

            return checked && checked.value ? String(checked.value) : '';
        }

        function rememberUserPaymentSelection(methodCode) {
            methodCode = methodCode || '';
            if (!methodCode) {
                lockedUserPaymentMethodCode = '';
                lockedUserPaymentAt = 0;
                paymentSelectionGeneration += 1;
                return paymentSelectionGeneration;
            }
            methodCode = String(methodCode);
            if (methodCode !== lockedUserPaymentMethodCode) {
                paymentSelectionGeneration += 1;
            }
            lockedUserPaymentMethodCode = methodCode;
            lockedUserPaymentAt = Date.now();
            return paymentSelectionGeneration;
        }

        function getUserSelectedPaymentMethod() {
            return lockedUserPaymentMethodCode || '';
        }

        function getPaymentSelectionGeneration() {
            return paymentSelectionGeneration;
        }

        /**
         * User payment lock is sticky so lagging Livewire / KO callbacks cannot snap
         * the radio back to a previously loading method after a fast re-click.
         * Cleared only on shipping remap or explicit clear — not when wire catches up.
         */
        function isUserPaymentSelectionFresh(maxAgeMs) {
            maxAgeMs = typeof maxAgeMs === 'number' ? maxAgeMs : 15000;
            return !!(
                lockedUserPaymentMethodCode &&
                lockedUserPaymentAt &&
                (Date.now() - lockedUserPaymentAt) < maxAgeMs
            );
        }

        function clearUserPaymentSelection() {
            lockedUserPaymentMethodCode = '';
            lockedUserPaymentAt = 0;
            paymentSelectionGeneration += 1;
        }

        /**
         * True when methodCode is still the intended payment (user lock or no lock).
         * Optional generation: if provided and stale, reject.
         */
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

            // Lagging Magewire/totals payload must not overwrite a fresh shopper pick.
            if (!shouldAcceptPaymentSelection(methodCode)) {
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
            var methodCode = getCode(paymentMethod),
                generation = paymentSelectionGeneration;

            persistPaymentMethod(methodCode || null);

            if (!methodCode) {
                lastMagewirePaymentMethodCode = '';
                if (syncTimer) {
                    window.clearTimeout(syncTimer);
                }
                syncTimer = window.setTimeout(function () {
                    var wire = getMagewireComponent();

                    syncTimer = null;
                    if (!wire || typeof wire.set !== 'function') {
                        return;
                    }

                    // Same guard the non-empty branch below applies before calling
                    // selectPaymentMethod. Without it, a shipping remap that clears a
                    // no-longer-allowed payment (e.g. flatrate/banktransfer ->
                    // tablerate/checkmo, whose mappings are disjoint) left this firing
                    // $set('paymentMethod', '') on an already-empty property on every
                    // message.processed — and each $set is itself a Livewire roundtrip
                    // whose response re-enters here, looping forever.
                    if (String(getProperty(wire, 'paymentMethod') || '') === '') {
                        return;
                    }

                    // A shipping remap rebuilds the KO payment list, and mid-rebuild KO
                    // reports "no method" (onSelectPaymentMethodAction(null)). That is a
                    // transient render artifact, not the shopper deselecting: the server
                    // has already auto-picked the first allowed method and the DOM shows
                    // it. Clearing here wiped that valid selection, leaving Magewire empty
                    // while the radio stayed checked. Only clear when the DOM agrees that
                    // nothing selectable is checked.
                    if (getCheckedEnabledPaymentCode() !== '') {
                        return;
                    }

                    wire.set('paymentMethod', '');
                }, 50);
                return;
            }

            if (!shouldAcceptPaymentSelection(methodCode, generation)) {
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

                // Shopper picked another method while this call was debounced.
                if (!shouldAcceptPaymentSelection(methodCode, generation)) {
                    return;
                }

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
            methodCode = methodCode || '';

            // Pending debounce for the same code still counts as synced — otherwise
            // message.processed re-enters applySelectedMethod and spams selectPaymentMethod.
            if (syncTimer && lastMagewirePaymentMethodCode === methodCode && methodCode !== '') {
                return getQuoteCode() === methodCode || getQuoteCode() === '';
            }

            return getQuoteCode() === methodCode &&
                lastMagewirePaymentMethodCode === methodCode;
        }

        function reassertUserPaymentOnQuote() {
            var methodCode = lockedUserPaymentMethodCode;

            if (
                !isUserPaymentSelectionFresh() ||
                !methodCode ||
                !quote ||
                typeof quote.paymentMethod !== 'function'
            ) {
                return;
            }

            if (getQuoteCode() === methodCode) {
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
            syncToMagewire: syncToMagewire,
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

                // Lagging mark for an older method must not clobber a fresher shopper pick
                // or cancel its debounced Magewire sync.
                if (
                    methodCode &&
                    isUserPaymentSelectionFresh() &&
                    lockedUserPaymentMethodCode &&
                    methodCode !== lockedUserPaymentMethodCode
                ) {
                    return;
                }

                lastMagewirePaymentMethodCode = methodCode;
                if (syncTimer) {
                    window.clearTimeout(syncTimer);
                    syncTimer = null;
                }
            }
        };
    };
});
