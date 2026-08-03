define([
    'jquery',
    'Magento_Checkout/js/model/quote',
    'Magento_Checkout/js/action/set-shipping-information',
    'Magento_Checkout/js/model/shipping-rate-registry',
    'Magento_Checkout/js/checkout-data'
], function ($, quote, setShippingInformationAction, rateRegistry, checkoutData) {
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

        function applyPaymentRemapForShipping(methodCode, options) {
            var settings = (window.checkoutConfig && window.checkoutConfig.fastcheckoutSettings) || {},
                mapping = normalizeShippingPaymentMapping(settings.shippingPaymentMapping),
                hasMapping = mapping.length > 0,
                codes = [],
                grid,
                emptyMessage;

            options = options || {};
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

            // If the current payment is no longer allowed for this shipping method,
            // drop the selection. Do NOT auto-pick another method or restore the
            // previous one when the shopper switches back — they must choose again.
            // deferPaymentActivation: only update allowed flags / radios UI — used while
            // set-shipping-information is still in flight (see pushNativeShippingSelection).
            if (!options.deferPaymentActivation) {
                clearInvalidPaymentAfterRemap();
            }
        }

        /**
         * Allowed payment radios after the latest shipping→payment remap.
         *
         * @returns {string[]}
         */
        function getAllowedPaymentCodes() {
            var codes = [];

            document.querySelectorAll(
                '[data-fastcheckout-payment-option][data-fastcheckout-payment-allowed="1"]'
            ).forEach(function (el) {
                var input = el.querySelector('input[name="payment_method"]'),
                    code;

                if (!input || input.disabled) {
                    return;
                }
                code = String(input.value || '').trim();
                if (code && codes.indexOf(code) === -1) {
                    codes.push(code);
                }
            });

            return codes;
        }

        // Invalidates in-flight select('') / activate timers so a late empty clear
        // cannot close a panel we just opened for the sole mapped payment.
        var paymentUiActivationToken = 0;

        function isPaymentKoPanelOpen(methodCode) {
            var target;

            if (!methodCode) {
                return false;
            }
            target = document.querySelector(
                '[data-fastcheckout-payment-method-ko-target="' +
                String(methodCode).replace(/"/g, '') + '"]'
            );
            if (!target || target.classList.contains('hidden') || target.style.display === 'none') {
                return false;
            }

            return !!(
                target.querySelector('.payment-method._active, [data-fastcheckout-active="true"]') ||
                target.children.length > 0
            );
        }

        /**
         * Check radio + open KO panel / bind Magento renderer so place-order
         * validation actually runs. Radio-only selection (SSR or Magento resolver)
         * leaves the panel closed and methods like purchaseorder/banktransfer
         * without an active renderer.
         *
         * @param {string} methodCode
         */
        function activatePaymentMethodUi(methodCode) {
            var token,
                delays;

            methodCode = methodCode ? String(methodCode) : '';
            if (!methodCode) {
                return;
            }

            // Cancel any pending select('') from dropPaymentSelectionCompletely.
            paymentUiActivationToken += 1;
            token = paymentUiActivationToken;

            document.querySelectorAll('input[name="payment_method"]').forEach(function (input) {
                input.checked = String(input.value) === methodCode && !input.disabled;
            });

            function tryOpen(attempt) {
                if (token !== paymentUiActivationToken) {
                    return;
                }
                if (
                    !window.fastcheckoutHyvaPayment ||
                    typeof window.fastcheckoutHyvaPayment.selectPaymentMethod !== 'function'
                ) {
                    return;
                }

                if (
                    window.fastcheckoutHyvaPayment &&
                    typeof window.fastcheckoutHyvaPayment.rememberUserPaymentSelection === 'function'
                ) {
                    window.fastcheckoutHyvaPayment.rememberUserPaymentSelection(methodCode);
                }

                // Keep radio sticky across late remap / empty-select races.
                document.querySelectorAll('input[name="payment_method"]').forEach(function (input) {
                    input.checked = String(input.value) === methodCode && !input.disabled;
                });

                window.fastcheckoutHyvaPayment.selectPaymentMethod(methodCode);

                // If renderer was still booting, re-try until panel is really open.
                if (!isPaymentKoPanelOpen(methodCode) && attempt < 6) {
                    window.setTimeout(function () {
                        tryOpen(attempt + 1);
                    }, attempt === 0 ? 50 : 150 * attempt);
                }
            }

            // Immediate attempt + delayed retries (shipping-information / KO mount lag).
            tryOpen(0);
            delays = [120, 350, 800, 1600];
            delays.forEach(function (delay) {
                window.setTimeout(function () {
                    if (token !== paymentUiActivationToken) {
                        return;
                    }
                    if (!isPaymentKoPanelOpen(methodCode)) {
                        tryOpen(1);
                    } else {
                        // Re-assert radio only — panel already open.
                        document.querySelectorAll('input[name="payment_method"]').forEach(function (input) {
                            input.checked = String(input.value) === methodCode && !input.disabled;
                        });
                    }
                }, delay);
            });
        }

        /**
         * After shipping→payment remap:
         *  - payment still allowed for the *new* shipping method → keep it and
         *    fully activate (open panel + Magento select) so validation works
         *  - payment no longer allowed → uncheck, clear quote + checkout-data,
         *    close panels
         *  - if nothing is selected and exactly one payment is allowed for this
         *    shipping method → auto-activate that single option (common mapping:
         *    one payment per carrier)
         *  - when multiple payments are allowed again after a clear, do not
         *    auto-restore a previous multi-choice selection
         */
        function clearInvalidPaymentAfterRemap() {
            var quoteCode = '',
                current,
                stillAllowed = false,
                allowedInput = null,
                pay,
                allowedCodes,
                soleCode;

            if (quote && typeof quote.paymentMethod === 'function') {
                current = quote.paymentMethod();
                quoteCode = current && current.method ? String(current.method) : '';
            }

            if (quoteCode) {
                allowedInput = document.querySelector(
                    'input[name="payment_method"][value="' +
                    quoteCode.replace(/"/g, '') + '"]:not([disabled])'
                );
                if (allowedInput) {
                    pay = allowedInput.closest('[data-fastcheckout-payment-option]');
                    if (!pay || pay.getAttribute('data-fastcheckout-payment-allowed') !== '0') {
                        stillAllowed = true;
                    }
                }
            }

            if (stillAllowed && allowedInput) {
                // Same payment remains valid. Re-open only when the KO panel is down
                // (shipping-information remaps 2–3×; re-closing causes a flash /
                // stuck checked-but-closed state).
                if (!isPaymentKoPanelOpen(quoteCode)) {
                    activatePaymentMethodUi(quoteCode);
                } else {
                    document.querySelectorAll('input[name="payment_method"]').forEach(function (input) {
                        input.checked = String(input.value) === String(quoteCode) && !input.disabled;
                    });
                }
                return;
            }

            allowedCodes = getAllowedPaymentCodes();
            soleCode = allowedCodes.length === 1 ? allowedCodes[0] : '';

            if (soleCode) {
                // shipping-information re-runs remap 2–3×. If the sole method panel is
                // already open, only re-assert radio/quote — do not uncheck or close.
                if (isPaymentKoPanelOpen(soleCode)) {
                    document.querySelectorAll('input[name="payment_method"]').forEach(function (input) {
                        input.checked = String(input.value) === String(soleCode) && !input.disabled;
                    });
                    if (
                        window.fastcheckoutHyvaPayment &&
                        typeof window.fastcheckoutHyvaPayment.selectPaymentMethod === 'function' &&
                        (
                            !quote ||
                            typeof quote.paymentMethod !== 'function' ||
                            !quote.paymentMethod() ||
                            String(quote.paymentMethod().method || '') !== String(soleCode)
                        )
                    ) {
                        window.fastcheckoutHyvaPayment.selectPaymentMethod(soleCode);
                    }
                    return;
                }

                // Clear quote/checkout-data without select('') and without tearing down
                // KO targets — activate opens the sole method.
                dropPaymentSelectionCompletely({ skipSelectEmpty: true, keepPanels: true });
                activatePaymentMethodUi(soleCode);
                return;
            }

            dropPaymentSelectionCompletely();
        }

        /**
         * Uncheck radios, clear quote + Magento checkout-data, close KO panels.
         * Used when the selected payment is not allowed for the current shipping method.
         *
         * @param {{skipSelectEmpty?: boolean}} [options]
         */
        function dropPaymentSelectionCompletely(options) {
            var token;

            options = options || {};

            document.querySelectorAll('input[name="payment_method"]').forEach(function (input) {
                input.checked = false;
            });

            if (quote && typeof quote.paymentMethod === 'function') {
                try {
                    quote.paymentMethod(null);
                } catch (e) {
                    // ignore
                }
            }

            // Prevent Magento resolver / set-shipping-information from re-applying
            // the previous payment when switching shipping methods back and forth.
            try {
                if (checkoutData && typeof checkoutData.setSelectedPaymentMethod === 'function') {
                    checkoutData.setSelectedPaymentMethod(null);
                }
            } catch (e2) {
                // ignore
            }

            if (
                window.fastcheckoutHyvaPayment &&
                typeof window.fastcheckoutHyvaPayment.clearUserPaymentSelection === 'function'
            ) {
                window.fastcheckoutHyvaPayment.clearUserPaymentSelection();
            }

            if (options.skipSelectEmpty) {
                // Caller activates another method immediately — avoid select('') race.
                // Optionally keep KO panel shells mounted (sole-payment remap path).
                if (!options.keepPanels) {
                    document.querySelectorAll('.payment-method._active').forEach(function (el) {
                        el.classList.remove('_active');
                        el.removeAttribute('data-fastcheckout-active');
                    });
                    document.querySelectorAll('[data-fastcheckout-payment-method-ko-target]').forEach(function (el) {
                        el.classList.add('hidden');
                        el.style.display = 'none';
                    });
                }
                return;
            }

            paymentUiActivationToken += 1;
            token = paymentUiActivationToken;

            if (
                window.fastcheckoutHyvaPayment &&
                typeof window.fastcheckoutHyvaPayment.selectPaymentMethod === 'function'
            ) {
                window.setTimeout(function () {
                    if (token !== paymentUiActivationToken) {
                        return;
                    }
                    window.fastcheckoutHyvaPayment.selectPaymentMethod('');
                }, 0);
            } else {
                document.querySelectorAll('.payment-method._active').forEach(function (el) {
                    el.classList.remove('_active');
                    el.removeAttribute('data-fastcheckout-active');
                });
                document.querySelectorAll('[data-fastcheckout-payment-method-ko-target]').forEach(function (el) {
                    el.classList.add('hidden');
                    el.style.display = 'none';
                });
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

            // Remap payment visibility immediately, but do NOT auto-activate sole
            // payment yet — Magento_SalesRule POSTs set-payment-information on every
            // select, and PaymentMethodManagement requires a server-side shipping
            // address with country_id. Activating before set-shipping-information
            // races and intermittently throws "shipping address is missing".
            applyPaymentRemapForShipping(methodCode, { deferPaymentActivation: true });
            persistShippingMethod(methodCode);

            address = quote.shippingAddress && quote.shippingAddress();
            // If quote address is only a stub (country only), try not to block UI —
            // set-shipping-information may 400 without firstname/street; still keep
            // KO selection + payment remap so the shopper can finish the form.
            // Keep payment activation deferred: SalesRule POSTs set-payment-information
            // and Magento rejects when the *server* quote has no shipping country_id.
            if (!address || !quote.shippingMethod || !quote.shippingMethod()) {
                pushInFlight = false;
                applyPaymentRemapForShipping(methodCode, { deferPaymentActivation: true });
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
                window.fastcheckoutServerShippingCountryReady = false;
                applyPaymentRemapForShipping(methodCode, { deferPaymentActivation: true });
                return Promise.resolve(true);
            }

            // Publish before any await so set-payment can wait for this request.
            window.fastcheckoutServerShippingCountryReady = false;
            window.fastcheckoutShippingInformationPromise = Promise.resolve(deferred).then(function (result) {
                pushInFlight = false;
                lastPushedAt = Date.now();
                window.fastcheckoutShippingInformationSettledAt = Date.now();
                // Server quote now has shipping country_id — safe for PaymentMethodManagement.
                window.fastcheckoutServerShippingCountryReady = true;
                // Full remap including sole-payment activate — server address is ready.
                applyPaymentRemapForShipping(methodCode);
                // Re-POST set-payment-information if an earlier select was deferred
                // (select-payment no-ops when the method is already on the quote).
                if (typeof window.fastcheckoutFlushPendingPaymentInformation === 'function') {
                    try {
                        window.fastcheckoutFlushPendingPaymentInformation();
                    } catch (flushErr) {
                        // non-fatal
                    }
                }
                return result;
            }, function (error) {
                pushInFlight = false;
                window.fastcheckoutShippingInformationSettledAt = Date.now();
                window.fastcheckoutServerShippingCountryReady = false;
                if (lastPushedCode === methodCode) {
                    lastPushedCode = '';
                    lastPushedAt = 0;
                }
                // Show mapped payments but do NOT auto-activate sole method: activating
                // would POST set-payment-information against a server quote with no
                // shipping country and Magento shows "Brak adresu wysyłki".
                applyPaymentRemapForShipping(methodCode, { deferPaymentActivation: true });
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

            return window.fastcheckoutShippingInformationPromise;
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
