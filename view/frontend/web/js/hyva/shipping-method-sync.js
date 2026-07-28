define([
    'jquery',
    'Magento_Checkout/js/model/quote',
    'Magento_Checkout/js/action/set-shipping-information',
    'Magento_Checkout/js/model/shipping-rate-registry'
], function ($, quote, setShippingInformationAction, rateRegistry) {
    'use strict';

    /**
     * Shipping method ownership: Magento KO quote + native set-shipping-information.
     * Payment remapping is client-side only.
     */
    return function (deps) {
        deps = deps || {};

        var shippingService = deps.shippingService,
            selectShippingMethodAction = deps.selectShippingMethodAction,
            persistShippingMethod = typeof deps.persistShippingMethod === 'function'
                ? deps.persistShippingMethod
                : function () {},
            lastPushedCode = '',
            lastPushedAt = 0,
            lockedUserShippingMethodCode = '',
            shippingLockGeneration = 0,
            pushInFlight = false,
            syncTimer = null;

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
            return !!lockedUserShippingMethodCode;
        }

        function clearUserShippingSelection() {
            lockedUserShippingMethodCode = '';
        }

        function shouldIgnoreKnockoutApply(methodCode) {
            var locked = lockedUserShippingMethodCode;

            if (!locked || !methodCode) {
                return false;
            }
            if (String(methodCode) === locked) {
                return false;
            }
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
            return true;
        }

        /**
         * Apply payment visibility from shipping↔payment mapping in checkoutConfig.
         * Does not rebuild shipping rates.
         */
        /**
         * Admin mapping is often stored as an object keyed by row ids, not a plain array.
         */
        function normalizeShippingPaymentMapping(raw) {
            var list = [];

            if (!raw) {
                return list;
            }
            if (Array.isArray(raw)) {
                return raw.filter(function (rule) {
                    return rule && typeof rule === 'object';
                });
            }
            if (typeof raw === 'object') {
                Object.keys(raw).forEach(function (key) {
                    if (raw[key] && typeof raw[key] === 'object') {
                        list.push(raw[key]);
                    }
                });
            }
            return list;
        }

        function applyPaymentRemapForShipping(methodCode) {
            var settings = (window.checkoutConfig && window.checkoutConfig.fastcheckoutSettings) || {},
                mapping = normalizeShippingPaymentMapping(settings.shippingPaymentMapping),
                hasMapping = mapping.length > 0,
                codes = [],
                grid,
                emptyMessage;

            methodCode = methodCode ? String(methodCode) : '';

            if (!hasMapping) {
                // No mapping rules: all payment options stay allowed.
                document.querySelectorAll('[data-fastcheckout-payment-option]').forEach(function (el) {
                    el.setAttribute('data-fastcheckout-payment-allowed', '1');
                    el.style.display = '';
                    el.removeAttribute('aria-hidden');
                    var input = el.querySelector('input[name="payment_method"]');
                    if (input) {
                        input.disabled = false;
                    }
                });
            } else if (!methodCode) {
                // Mapping configured but no shipping yet — hide all payment options.
                document.querySelectorAll('[data-fastcheckout-payment-option]').forEach(function (el) {
                    el.setAttribute('data-fastcheckout-payment-allowed', '0');
                    el.style.display = 'none';
                    el.setAttribute('aria-hidden', 'true');
                    var input = el.querySelector('input[name="payment_method"]');
                    if (input) {
                        input.disabled = true;
                        input.checked = false;
                    }
                });
            } else {
                mapping.forEach(function (rule) {
                    var ruleShip, rulePay, carrier, prefix;

                    if (!rule || typeof rule !== 'object') {
                        return;
                    }
                    ruleShip = String(rule.shipping_method || '').trim();
                    rulePay = String(rule.payment_method || '').trim();
                    if (!ruleShip || !rulePay) {
                        return;
                    }
                    if (ruleShip === '*' || ruleShip === methodCode) {
                        codes.push(rulePay);
                        return;
                    }
                    carrier = methodCode.split('_')[0] || '';
                    if (ruleShip === carrier) {
                        codes.push(rulePay);
                        return;
                    }
                    if (ruleShip.slice(-1) === '*') {
                        prefix = ruleShip.slice(0, -1).replace(/_+$/, '');
                        if (prefix && methodCode.indexOf(prefix + '_') === 0) {
                            codes.push(rulePay);
                        }
                    }
                });

                document.querySelectorAll('[data-fastcheckout-payment-option]').forEach(function (el) {
                    var code = el.getAttribute('data-fastcheckout-payment-option') || '',
                        ok = codes.indexOf(code) !== -1,
                        input = el.querySelector('input[name="payment_method"]');

                    el.setAttribute('data-fastcheckout-payment-allowed', ok ? '1' : '0');
                    if (ok) {
                        el.style.display = '';
                        el.removeAttribute('aria-hidden');
                        if (input) {
                            input.disabled = false;
                        }
                    } else {
                        el.style.display = 'none';
                        el.setAttribute('aria-hidden', 'true');
                        if (input) {
                            input.disabled = true;
                            input.checked = false;
                        }
                    }
                });
            }

            // Always refresh grid and empty-message visibility.
            emptyMessage = document.querySelector('[data-fastcheckout-no-payment-methods]');
            if (emptyMessage) {
                emptyMessage.textContent = emptyMessage.getAttribute(
                    hasMapping && !methodCode
                        ? 'data-fastcheckout-select-shipping-message'
                        : 'data-fastcheckout-no-payment-methods-message'
                ) || emptyMessage.textContent;
            }
            if (window.fastcheckoutHyvaPayment && typeof window.fastcheckoutHyvaPayment.applyPaymentOptionVisibility === 'function') {
                window.fastcheckoutHyvaPayment.applyPaymentOptionVisibility();
            } else {
                grid = document.querySelector('[data-fastcheckout-payment-methods-grid]');
                var anyAllowed = !!document.querySelector(
                    '[data-fastcheckout-payment-option][data-fastcheckout-payment-allowed="1"]'
                );
                if (grid) {
                    if (anyAllowed) {
                        grid.classList.remove('hidden');
                        grid.style.display = '';
                    } else {
                        grid.classList.add('hidden');
                    }
                }
                if (emptyMessage) {
                    if (anyAllowed) {
                        emptyMessage.classList.add('hidden');
                        emptyMessage.style.display = 'none';
                    } else {
                        emptyMessage.classList.remove('hidden');
                        emptyMessage.style.display = '';
                    }
                }
            }
        }

        /**
         * Persist selected rate on the quote via Magento set-shipping-information.
         * Keep a single native request path.
         */
        function pushNativeShippingSelection(methodCode) {
            var found,
                address,
                deferred;

            if (!methodCode) {
                return Promise.resolve(false);
            }

            if (isStaleShippingSelection(methodCode)) {
                return Promise.resolve(false);
            }

            if (pushInFlight && lastPushedCode === methodCode) {
                return Promise.resolve(false);
            }

            if (lastPushedCode === methodCode && (Date.now() - lastPushedAt) < 800) {
                return Promise.resolve(false);
            }

            lastPushedCode = methodCode;
            lastPushedAt = Date.now();
            pushInFlight = true;

            // Keep shipping list stable while totals/payment update.
            window.fastcheckoutLockShippingRatesList = true;
            window.fastcheckoutSelectingShippingMethod = true;

            found = findRate(methodCode);
            if (found) {
                applyRateToQuote(found);
            }

            applyPaymentRemapForShipping(methodCode);
            persistShippingMethod(methodCode);

            address = quote.shippingAddress && quote.shippingAddress();
            // If quote address is only a stub (country only), try not to block UI —
            // set-shipping-information may 400 without firstname/street; still keep
            // KO selection + payment remap so the shopper can finish the form.
            if (!address || !quote.shippingMethod || !quote.shippingMethod()) {
                pushInFlight = false;
                window.setTimeout(function () {
                    window.fastcheckoutLockShippingRatesList = false;
                    window.fastcheckoutSelectingShippingMethod = false;
                }, 250);
                return Promise.resolve(true);
            }

            // Native Magento: shipping-information persists method + refreshes totals.
            try {
                deferred = setShippingInformationAction();
            } catch (e) {
                pushInFlight = false;
                window.fastcheckoutLockShippingRatesList = false;
                window.fastcheckoutSelectingShippingMethod = false;
                applyPaymentRemapForShipping(methodCode);
                return Promise.resolve(true);
            }

            return Promise.resolve(deferred).then(function (result) {
                pushInFlight = false;
                lastPushedAt = Date.now();
                // Re-apply payment remap after shipping-information settles (mapping may
                // depend on server-side payment list, but DOM rows are already seeded).
                applyPaymentRemapForShipping(methodCode);
                return result;
            }, function (error) {
                pushInFlight = false;
                if (lastPushedCode === methodCode) {
                    lastPushedCode = '';
                    lastPushedAt = 0;
                }
                // Still show mapped payments even if set-shipping-information fails
                // (e.g. incomplete address) so the shopper can proceed with UI.
                applyPaymentRemapForShipping(methodCode);
                return Promise.reject(error);
            }).then(function (result) {
                window.setTimeout(function () {
                    window.fastcheckoutLockShippingRatesList = false;
                    window.fastcheckoutSelectingShippingMethod = false;
                }, 250);
                return result;
            }, function (error) {
                window.setTimeout(function () {
                    window.fastcheckoutLockShippingRatesList = false;
                    window.fastcheckoutSelectingShippingMethod = false;
                }, 250);
                return Promise.reject(error);
            });
        }

        function persistSelectionNow(methodCode) {
            persistShippingMethod(methodCode);
            if (syncTimer) {
                window.clearTimeout(syncTimer);
                syncTimer = null;
            }
            if (!methodCode) {
                return Promise.resolve(false);
            }
            return pushNativeShippingSelection(methodCode);
        }

        function persistSelection(methodCode) {
            if (window.fastcheckoutSuppressShippingSync) {
                return;
            }

            persistShippingMethod(methodCode);

            if (!methodCode || isStaleShippingSelection(methodCode)) {
                return;
            }

            if (syncTimer) {
                window.clearTimeout(syncTimer);
            }

            syncTimer = window.setTimeout(function () {
                syncTimer = null;
                pushNativeShippingSelection(methodCode);
            }, 50);
        }

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
            persistSelectionNow: persistSelectionNow,
            persistSelection: persistSelection,
            rememberUserShippingSelection: rememberUserShippingSelection,
            getUserSelectedShippingMethod: getUserSelectedShippingMethod,
            isUserShippingSelectionFresh: isUserShippingSelectionFresh,
            shouldIgnoreKnockoutApply: shouldIgnoreKnockoutApply,
            clearUserShippingSelection: clearUserShippingSelection,
            getShippingLockGeneration: getShippingLockGeneration,
            installQuoteGuard: installQuoteGuard,
            applyPaymentRemapForShipping: applyPaymentRemapForShipping,
            pushNativeShippingSelection: pushNativeShippingSelection
        };
    };
});
