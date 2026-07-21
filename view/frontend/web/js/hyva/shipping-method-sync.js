define([], function () {
    'use strict';

    return function (deps) {
        deps = deps || {};

        var quote = deps.quote,
            shippingService = deps.shippingService,
            selectShippingMethodAction = deps.selectShippingMethodAction,
            getMagewireComponent = typeof deps.getMagewireComponent === 'function' ? deps.getMagewireComponent : function () { return null; },
            persistShippingMethod = typeof deps.persistShippingMethod === 'function' ? deps.persistShippingMethod : function () {},
            lastMagewireShippingMethodCode = '',
            lastMagewireShippingPushedAt = 0,
            // Hard lock: once the shopper picks a rate, only another shopper pick
            // (or disappearance of that rate) may change it. No time-based unlock —
            // timed windows still allowed out-of-order Magewire responses to bounce UI.
            lockedUserShippingMethodCode = '',
            shippingLockGeneration = 0,
            syncTimer = null,
            magewirePushInFlight = false,
            magewirePushGeneration = 0;

        function getCode(shippingMethod) {
            if (!shippingMethod) {
                return '';
            }
            if (typeof shippingMethod === 'string') {
                return shippingMethod;
            }
            if (shippingMethod.carrier_code && shippingMethod.method_code) {
                return shippingMethod.carrier_code + '_' + shippingMethod.method_code;
            }
            if (shippingMethod.carrierCode && shippingMethod.methodCode) {
                return shippingMethod.carrierCode + '_' + shippingMethod.methodCode;
            }
            if (shippingMethod.method) {
                return shippingMethod.method;
            }

            return '';
        }

        function splitCode(methodCode) {
            var parts = String(methodCode || '').split('_'),
                carrier = parts.shift() || '';

            return {
                carrier_code: carrier,
                method_code: parts.length ? parts.join('_') : carrier
            };
        }

        function rateExists(methodCode) {
            var rates,
                found = false;

            if (!methodCode || !shippingService || typeof shippingService.getShippingRates !== 'function') {
                return false;
            }

            rates = shippingService.getShippingRates()() || [];
            rates.some(function (rate) {
                if (rate && (rate.carrier_code + '_' + rate.method_code) === methodCode) {
                    found = true;
                    return true;
                }
                return false;
            });

            return found;
        }

        function rememberUserShippingSelection(methodCode) {
            if (!methodCode) {
                return;
            }
            methodCode = String(methodCode);
            if (methodCode !== lockedUserShippingMethodCode) {
                shippingLockGeneration += 1;
            }
            lockedUserShippingMethodCode = methodCode;
        }

        function getShippingLockGeneration() {
            return shippingLockGeneration;
        }

        function getUserSelectedShippingMethod() {
            return lockedUserShippingMethodCode || '';
        }

        function isUserShippingSelectionFresh() {
            // Lock has no TTL — it stays until the next user pick (or rate disappears).
            return !!lockedUserShippingMethodCode;
        }

        function clearUserShippingSelection() {
            lockedUserShippingMethodCode = '';
        }

        /**
         * True when applying methodCode would fight the locked shopper choice.
         */
        function shouldIgnoreKnockoutApply(methodCode) {
            var locked = lockedUserShippingMethodCode;

            if (!locked || !methodCode) {
                return false;
            }
            if (String(methodCode) === locked) {
                return false;
            }
            // If the locked rate vanished from the list, allow Magento/server to pick.
            if (!rateExists(locked)) {
                return false;
            }

            return true;
        }

        function isStaleShippingSelection(methodCode) {
            return shouldIgnoreKnockoutApply(methodCode);
        }

        function findRate(methodCode) {
            var found = null,
                rates;

            if (!methodCode) {
                return null;
            }

            rates = shippingService.getShippingRates()() || [];
            rates.some(function (rate) {
                if (rate && (rate.carrier_code + '_' + rate.method_code) === methodCode) {
                    found = rate;
                    return true;
                }
                return false;
            });

            return found;
        }

        function applyRateToQuote(found) {
            var previousSuppress;

            if (!found) {
                return false;
            }

            previousSuppress = window.fastcheckoutSuppressShippingSync;
            window.fastcheckoutSuppressShippingSync = true;
            try {
                selectShippingMethodAction(found);
            } finally {
                window.fastcheckoutSuppressShippingSync = previousSuppress;
            }

            return true;
        }

        function syncSelectedToKnockout(methodCode) {
            var code = methodCode ? String(methodCode) : '',
                found,
                active;

            if (shouldIgnoreKnockoutApply(code)) {
                // Re-assert the locked rate instead of applying the stale one.
                code = lockedUserShippingMethodCode;
            }

            persistShippingMethod(code);

            if (!code) {
                if (lockedUserShippingMethodCode) {
                    return false;
                }
                quote.shippingMethod(null);
                return true;
            }

            found = findRate(code);
            if (!found) {
                return false;
            }

            active = quote.shippingMethod();
            if (
                active &&
                active.carrier_code === found.carrier_code &&
                active.method_code === found.method_code
            ) {
                return true;
            }

            applyRateToQuote(found);

            if (code === lockedUserShippingMethodCode) {
                lastMagewireShippingMethodCode = code;
            }

            return true;
        }

        function getWireShippingMethod(wire) {
            if (!wire) {
                return '';
            }

            if (typeof wire.get === 'function') {
                try {
                    var fromGet = wire.get('shippingMethod');
                    if (fromGet !== undefined && fromGet !== null && String(fromGet) !== '') {
                        return String(fromGet);
                    }
                } catch (e) {
                    // fall through
                }
            }

            if (wire.shippingMethod !== undefined && wire.shippingMethod !== null && String(wire.shippingMethod) !== '') {
                return String(wire.shippingMethod);
            }

            if (wire.data && wire.data.shippingMethod !== undefined && wire.data.shippingMethod !== null) {
                return String(wire.data.shippingMethod || '');
            }

            if (wire.serverMemo && wire.serverMemo.data && wire.serverMemo.data.shippingMethod) {
                return String(wire.serverMemo.data.shippingMethod);
            }
            if (
                wire.__instance &&
                wire.__instance.serverMemo &&
                wire.__instance.serverMemo.data &&
                wire.__instance.serverMemo.data.shippingMethod
            ) {
                return String(wire.__instance.serverMemo.data.shippingMethod);
            }

            return '';
        }

        function pushToMagewire(methodCode) {
            var wire = getMagewireComponent(),
                current,
                pushGen;

            if (!methodCode || !wire || typeof wire.call !== 'function') {
                return Promise.resolve(false);
            }

            if (isStaleShippingSelection(methodCode)) {
                return Promise.resolve(false);
            }

            current = getWireShippingMethod(wire);
            if (current === methodCode) {
                lastMagewireShippingMethodCode = methodCode;
                lastMagewireShippingPushedAt = Date.now();
                return Promise.resolve(false);
            }

            // Coalesce in-flight / very recent pushes of the same code.
            if (
                magewirePushInFlight &&
                lastMagewireShippingMethodCode === methodCode
            ) {
                return Promise.resolve(false);
            }
            if (
                lastMagewireShippingMethodCode === methodCode &&
                (Date.now() - lastMagewireShippingPushedAt) < 1200
            ) {
                return Promise.resolve(false);
            }

            lastMagewireShippingMethodCode = methodCode;
            lastMagewireShippingPushedAt = Date.now();
            magewirePushInFlight = true;
            pushGen = shippingLockGeneration;
            magewirePushGeneration = pushGen;

            return Promise.resolve(wire.call('selectShippingMethod', methodCode)).then(function (result) {
                // Ignore completion of an outdated push after a newer user pick.
                if (pushGen === shippingLockGeneration) {
                    magewirePushInFlight = false;
                    lastMagewireShippingPushedAt = Date.now();
                } else if (magewirePushGeneration === pushGen) {
                    magewirePushInFlight = false;
                }
                return result;
            }, function (error) {
                if (pushGen === shippingLockGeneration) {
                    magewirePushInFlight = false;
                    if (lastMagewireShippingMethodCode === methodCode) {
                        lastMagewireShippingMethodCode = '';
                        lastMagewireShippingPushedAt = 0;
                    }
                } else if (magewirePushGeneration === pushGen) {
                    magewirePushInFlight = false;
                }
                return Promise.reject(error);
            });
        }

        /**
         * After Livewire message.processed: if a lagging response left wire on the wrong
         * rate, re-assert the locked user rate once. Safe with hard lock (no remember poison).
         */
        function reassertLockedMethodToMagewireIfNeeded() {
            var wire,
                current,
                locked = lockedUserShippingMethodCode;

            if (!locked) {
                return Promise.resolve(false);
            }

            wire = getMagewireComponent();
            current = getWireShippingMethod(wire);
            if (current === locked) {
                return Promise.resolve(false);
            }

            return pushToMagewire(locked);
        }

        function syncToMagewireNow(methodCode) {
            persistShippingMethod(methodCode);

            if (syncTimer) {
                window.clearTimeout(syncTimer);
                syncTimer = null;
            }

            if (!methodCode) {
                return Promise.resolve(false);
            }

            // Do NOT remember here — only trusted user clicks lock intent.
            return pushToMagewire(methodCode);
        }

        function syncToMagewire(methodCode) {
            if (window.fastcheckoutSuppressShippingSync) {
                return;
            }

            persistShippingMethod(methodCode);

            if (!methodCode) {
                return;
            }

            if (isStaleShippingSelection(methodCode)) {
                return;
            }

            if (syncTimer) {
                window.clearTimeout(syncTimer);
            }

            // Debounce to collapse selectAction + quote.subscribe + list write into one call.
            syncTimer = window.setTimeout(function () {
                syncTimer = null;
                pushToMagewire(methodCode);
            }, 50);
        }

        /**
         * Enforce lock at the quote observable level so direct quote.shippingMethod(rate)
         * writes (storage, resolvers, rate processors) cannot bounce the radio.
         */
        function installQuoteGuard() {
            var underlying,
                guarded;

            if (!quote || typeof quote.shippingMethod !== 'function' || quote.shippingMethod.fastcheckoutGuarded) {
                return;
            }

            underlying = quote.shippingMethod;

            if (typeof underlying.subscribe !== 'function') {
                return;
            }

            guarded = function (value) {
                var code;

                if (arguments.length) {
                    code = getCode(value);
                    if (code && shouldIgnoreKnockoutApply(code)) {
                        // Reject stale write; keep current selection.
                        return underlying();
                    }
                    return underlying(value);
                }

                return underlying();
            };

            guarded.subscribe = underlying.subscribe.bind(underlying);
            if (typeof underlying.peek === 'function') {
                guarded.peek = underlying.peek.bind(underlying);
            }
            if (typeof underlying.dispose === 'function') {
                guarded.dispose = underlying.dispose.bind(underlying);
            }
            guarded.fastcheckoutGuarded = true;
            // Preserve KO observable brand for mixins that check it.
            if (underlying.extend) {
                guarded.extend = underlying.extend.bind(underlying);
            }

            quote.shippingMethod = guarded;
        }

        installQuoteGuard();

        return {
            getCode: getCode,
            splitCode: splitCode,
            syncSelectedToKnockout: syncSelectedToKnockout,
            syncToMagewireNow: syncToMagewireNow,
            syncToMagewire: syncToMagewire,
            rememberUserShippingSelection: rememberUserShippingSelection,
            getUserSelectedShippingMethod: getUserSelectedShippingMethod,
            isUserShippingSelectionFresh: isUserShippingSelectionFresh,
            shouldIgnoreKnockoutApply: shouldIgnoreKnockoutApply,
            clearUserShippingSelection: clearUserShippingSelection,
            reassertLockedMethodToMagewireIfNeeded: reassertLockedMethodToMagewireIfNeeded,
            getShippingLockGeneration: getShippingLockGeneration,
            installQuoteGuard: installQuoteGuard
        };
    };
});
