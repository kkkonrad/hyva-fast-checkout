define([
    'jquery',
    'ko',
    'Magento_Ui/js/core/app',
    'Magento_Checkout/js/model/quote',
    'Magento_Checkout/js/model/checkout-data-resolver',
    'Magento_Checkout/js/model/totals',
    'Magento_Checkout/js/action/set-shipping-information',
    'Magento_Catalog/js/price-utils',
    'mage/translate',
    'uiRegistry'
], function (
    $,
    ko,
    app,
    quote,
    checkoutDataResolver,
    totals,
    setShippingInformation,
    priceUtils,
    $t,
    registry
) {
    'use strict';

    var initialized = false,
        observer,
        shippingSaveTimer,
        shippingSavePending = false;

    function paymentCode(method) {
        var input = method.querySelector(
            'input[type="radio"][name="payment[method]"], input[type="radio"]'
        );

        return input ? String(input.value || input.id || '') : '';
    }

    function activePaymentCode() {
        var method = quote.paymentMethod && quote.paymentMethod();

        return method && method.method ? String(method.method) : '';
    }

    function placeOrderButton(method) {
        return method && method.querySelector(
            '.payment-method-content [data-role="review-save"], ' +
            '.payment-method-content .action.checkout, ' +
            '.payment-method-content > .actions-toolbar button, ' +
            '.payment-method-content > .actions-toolbar input[type="submit"], ' +
            '.payment-method-content > .actions-toolbar [role="button"]'
        );
    }

    function activePlaceOrderButton() {
        var activeCode = activePaymentCode(),
            activeButton = null;

        document.querySelectorAll(
            '.fastcheckout-ko-payment-root .payment-method'
        ).forEach(function (method) {
            if (!activeButton && paymentCode(method) === activeCode) {
                activeButton = placeOrderButton(method);
            }
        });

        return activeButton;
    }

    function wirePlaceOrderButtons() {
        var activeButton;

        document.querySelectorAll(
            '.fastcheckout-ko-payment-root .payment-method'
        ).forEach(function (method) {
            var code = paymentCode(method),
                button = placeOrderButton(method);

            if (!code || !button) {
                return;
            }

            button.classList.add(
                'fastcheckout-native-place-order-btn',
                'fastcheckout-native-place-order-hidden'
            );
        });

        activeButton = activePlaceOrderButton();

        document.querySelectorAll(
            '[data-fastcheckout-place-order-mobile], [data-fastcheckout-place-order-ssr]'
        ).forEach(function (button) {
            button.disabled = Boolean(
                activeButton && activeButton.disabled && quote.billingAddress()
            );
            button.dataset.fastcheckoutNativeTargetReady = activeButton ? '1' : '0';
        });

        document.querySelectorAll('[data-fastcheckout-place-order-ssr]').forEach(function (button) {
            button.classList.toggle('fastcheckout-place-order-proxy-ready', Boolean(activeButton));
        });
    }

    function revealNativeContent() {
        var loader = document.querySelector('[data-fastcheckout-startup-loader]'),
            summaryRoot = document.getElementById('fastcheckout-ko-summary-root'),
            summaryFallback = document.querySelector('[data-fastcheckout-summary-ssr]'),
            nativeSummary = summaryRoot && summaryRoot.querySelector('.fastcheckout-native-summary');

        if (loader && document.querySelector(
            '.fastcheckout-native-shipping-address input[name="firstname"]'
        )) {
            loader.hidden = true;
            loader.style.display = 'none';
        }

        if (nativeSummary &&
            nativeSummary.querySelector('.product-item') &&
            nativeSummary.querySelector('.table-totals tr')) {
            summaryRoot.classList.remove('hidden');
            if (summaryFallback) {
                summaryFallback.hidden = true;
            }
        }

        wirePlaceOrderButtons();
    }

    function updateMobileTotal() {
        var target = document.querySelector('[data-fastcheckout-mobile-grand-total]'),
            data = totals.totals && totals.totals(),
            amount = data && data.grand_total;

        if (target && typeof amount !== 'undefined') {
            target.textContent = priceUtils.formatPriceLocale(amount, quote.getPriceFormat());
        }
    }

    function setClientOrderError(message) {
        document.querySelectorAll('[data-fastcheckout-client-order-error]').forEach(function (node) {
            node.textContent = message || '';
            node.classList.toggle('hidden', !message);
        });
    }

    function activeBillingAddressComponent() {
        var root = document.querySelector(
            '.payment-method._active .checkout-billing-address, ' +
            '.fastcheckout-payment-after-methods .checkout-billing-address'
        );

        return root ? ko.dataFor(root) : null;
    }

    function validateBillingAddress() {
        var component;

        if (quote.billingAddress()) {
            return true;
        }

        component = activeBillingAddressComponent();
        if (!component) {
            return false;
        }

        if (component.isAddressSameAsShipping && component.isAddressSameAsShipping()) {
            component.useShippingAddress();
        } else if (typeof component.updateAddress === 'function') {
            component.updateAddress();
        }

        return Boolean(quote.billingAddress());
    }

    function submitActivePayment() {
        window.setTimeout(function () {
            var active = activePlaceOrderButton();

            if (active && !active.disabled) {
                active.click();
            }
        }, 0);
    }

    function validatePaymentMethod() {
        if (activePaymentCode()) {
            return true;
        }

        setClientOrderError(
            $t('The payment method is missing. Select the payment method and try again.')
        );

        return false;
    }

    function validateAndPlaceOrder(shipping) {
        var source = shipping.source,
            email = $('form[data-role=email-with-possible-login] input[name=username]'),
            emailValid = true,
            addressValid = true,
            shippingValid,
            paymentValid;

        setClientOrderError('');

        if (source && typeof shipping.triggerShippingDataValidateEvent === 'function') {
            source.set('params.invalid', false);
            shipping.triggerShippingDataValidateEvent();
            addressValid = !source.get('params.invalid');
        }

        if (email.length) {
            email.closest('form').validation();
            emailValid = Boolean(email.valid());
        }

        shippingValid = shipping.validateShippingInformation();
        addressValid = source ? !source.get('params.invalid') : addressValid;
        paymentValid = validatePaymentMethod();

        if (!emailValid) {
            email.trigger('focus');
        } else if (!addressValid && typeof shipping.focusInvalid === 'function') {
            shipping.focusInvalid();
        }
        if (!addressValid || !emailValid || !shippingValid || !paymentValid) {
            return;
        }
        if (!validateBillingAddress()) {
            return;
        }

        submitActivePayment();
    }

    function validateVirtualAndPlaceOrder() {
        setClientOrderError('');
        if (validatePaymentMethod() && validateBillingAddress()) {
            submitActivePayment();
        }
    }

    function bindPlaceOrderProxies() {
        document.querySelectorAll(
            '[data-fastcheckout-place-order-mobile], [data-fastcheckout-place-order-ssr]'
        ).forEach(function (proxy) {
            proxy.addEventListener('click', function () {
                if (quote.isVirtual && quote.isVirtual()) {
                    validateVirtualAndPlaceOrder();
                    return;
                }
                registry.async('checkout.steps.shipping-step.shippingAddress')(
                    validateAndPlaceOrder
                );
            });
        });
    }

    function saveShippingWhenMethodChanges() {
        registry.async('checkout.steps.shipping-step.shippingAddress')(function (shipping) {
            quote.shippingMethod.subscribe(function (method) {
                window.clearTimeout(shippingSaveTimer);
                if (!method || shippingSavePending) {
                    return;
                }

                shippingSaveTimer = window.setTimeout(function () {
                    if (!shipping.validateShippingInformation()) {
                        return;
                    }

                    quote.billingAddress(null);
                    checkoutDataResolver.resolveBillingAddress();
                    shippingSavePending = true;
                    setShippingInformation().always(function () {
                        shippingSavePending = false;
                    });
                }, 50);
            });
        });
    }

    return function (jsLayout) {
        var root = document.getElementById('fastcheckout-checkout');

        if (initialized || !jsLayout || !jsLayout.components) {
            return;
        }
        initialized = true;

        app(jsLayout);
        registry.async(
            'checkout.steps.billing-step.payment.afterMethods.billing-address-form'
        )(function () {
            checkoutDataResolver.resolveBillingAddress();
        });
        bindPlaceOrderProxies();
        saveShippingWhenMethodChanges();

        quote.paymentMethod.subscribe(function () {
            setClientOrderError('');
            window.setTimeout(wirePlaceOrderButtons, 0);
        });
        if (totals.totals && typeof totals.totals.subscribe === 'function') {
            totals.totals.subscribe(updateMobileTotal);
        }

        if (root && window.MutationObserver) {
            observer = new MutationObserver(function () {
                window.setTimeout(revealNativeContent, 0);
            });
            observer.observe(root, {childList: true, subtree: true});
        }

        window.setTimeout(function () {
            revealNativeContent();
            updateMobileTotal();
            window.dispatchEvent(new CustomEvent('fastcheckout:ready'));
        }, 0);
    };
});
