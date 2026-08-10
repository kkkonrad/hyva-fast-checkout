define([
    'jquery',
    'ko',
    'Magento_Ui/js/core/app',
    'Magento_Checkout/js/model/quote',
    'Magento_Checkout/js/model/checkout-data-resolver',
    'Magento_Checkout/js/checkout-data',
    'Magento_Customer/js/customer-data',
    'Magento_Checkout/js/model/totals',
    'Magento_Checkout/js/action/set-shipping-information',
    'Magento_Checkout/js/action/select-billing-address',
    'Magento_Catalog/js/price-utils',
    'mage/translate',
    'uiRegistry'
], function (
    $,
    ko,
    app,
    quote,
    checkoutDataResolver,
    checkoutData,
    customerData,
    totals,
    setShippingInformation,
    selectBillingAddress,
    priceUtils,
    $t,
    registry
) {
    'use strict';

    var initialized = false,
        observer,
        validationErrorObserver,
        agreementsPortalObserver,
        agreementsPortalSource,
        agreementsPortalParts = [],
        scrollAnimationTimer,
        shippingSaveTimer,
        shippingSavePending = false,
        shippingSaveQueued = false,
        billingAddressChoiceTouched = false,
        placeOrderProcessing = false;

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
            '.payment-method-content .action.checkout'
        );
    }

    function updatePlaceOrderToolbar(button) {
        var toolbar = button.closest('.actions-toolbar'),
            otherAction;

        if (!toolbar) {
            return;
        }

        otherAction = Array.prototype.some.call(toolbar.querySelectorAll(
            'button, input[type="submit"], [role="button"], a.action'
        ), function (action) {
            return action !== button &&
                !action.classList.contains('fastcheckout-native-place-order-btn');
        });
        toolbar.classList.toggle('fastcheckout-actions-toolbar-hidden', !otherAction);
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
            updatePlaceOrderToolbar(button);
        });

        activeButton = activePlaceOrderButton();

        document.querySelectorAll(
            '[data-fastcheckout-place-order-mobile], [data-fastcheckout-place-order-ssr]'
        ).forEach(function (button) {
            button.disabled = placeOrderProcessing || Boolean(
                activeButton && activeButton.disabled && quote.billingAddress()
            );
            button.setAttribute('aria-disabled', button.disabled ? 'true' : 'false');
            button.dataset.fastcheckoutNativeTargetReady = activeButton ? '1' : '0';
        });

        document.querySelectorAll('[data-fastcheckout-place-order-ssr]').forEach(function (button) {
            button.classList.toggle('fastcheckout-place-order-proxy-ready', Boolean(activeButton));
        });
    }

    function setPlaceOrderProcessing(isProcessing) {
        placeOrderProcessing = Boolean(isProcessing);
        document.body.classList.toggle('checkout-submitting', placeOrderProcessing);
        document.querySelectorAll(
            '[data-fastcheckout-place-order-mobile], [data-fastcheckout-place-order-ssr]'
        ).forEach(function (button) {
            var spinner = button.querySelector('[data-fastcheckout-place-order-spinner]'),
                label = button.querySelector('[data-fastcheckout-place-order-label]'),
                textAttribute = placeOrderProcessing ?
                    'data-fastcheckout-processing-text' : 'data-fastcheckout-ready-text';

            button.disabled = placeOrderProcessing;
            button.setAttribute('aria-disabled', placeOrderProcessing ? 'true' : 'false');
            if (placeOrderProcessing) {
                button.setAttribute('data-fastcheckout-processing', 'true');
                button.setAttribute('aria-busy', 'true');
            } else {
                button.removeAttribute('data-fastcheckout-processing');
                button.removeAttribute('aria-busy');
            }
            if (spinner) {
                spinner.classList.toggle('hidden', !placeOrderProcessing);
                spinner.setAttribute('aria-hidden', placeOrderProcessing ? 'false' : 'true');
            }
            if (label && label.getAttribute(textAttribute)) {
                label.textContent = label.getAttribute(textAttribute);
            }
        });

        if (!placeOrderProcessing) {
            wirePlaceOrderButtons();
        }
    }

    function agreementParts(source) {
        return source ? Array.prototype.filter.call(source.children, function (child) {
            return child.matches(
                '[data-fastcheckout-newsletter], [data-role="checkout-agreements"]'
            );
        }) : [];
    }

    function restoreAgreementPart(part) {
        part.classList.remove('fastcheckout-agreements-native-source');
        part.removeAttribute('aria-hidden');
        part.querySelectorAll('[data-fastcheckout-portal-tabindex]').forEach(function (control) {
            var original = control.getAttribute('data-fastcheckout-portal-tabindex');

            if (original === '') {
                control.removeAttribute('tabindex');
            } else {
                control.setAttribute('tabindex', original);
            }
            control.removeAttribute('data-fastcheckout-portal-tabindex');
        });
    }

    function restoreAgreementSource() {
        if (agreementsPortalObserver) {
            agreementsPortalObserver.disconnect();
        }
        agreementsPortalParts.forEach(restoreAgreementPart);
        agreementsPortalSource = null;
        agreementsPortalParts = [];
    }

    function proxyAgreementControl(source, proxy) {
        var tag = proxy.tagName.toLowerCase(),
            type = String(proxy.type || '').toLowerCase(),
            originalTabindex = proxy.getAttribute('data-fastcheckout-portal-tabindex');

        if (originalTabindex !== null) {
            if (originalTabindex === '') {
                proxy.removeAttribute('tabindex');
            } else {
                proxy.setAttribute('tabindex', originalTabindex);
            }
            proxy.removeAttribute('data-fastcheckout-portal-tabindex');
        }

        if (tag === 'input' || tag === 'select' || tag === 'textarea') {
            if (type === 'checkbox' || type === 'radio') {
                proxy.checked = source.checked;
            } else {
                proxy.value = source.value;
            }
            proxy.disabled = source.disabled;
            proxy.removeAttribute('name');
            proxy.removeAttribute('form');
            proxy.removeAttribute('required');
            proxy.removeAttribute('aria-required');
            proxy.removeAttribute('data-validate');
            proxy.classList.remove('required-entry');
            ['input', 'change'].forEach(function (eventName) {
                proxy.addEventListener(eventName, function () {
                    if (type === 'checkbox' || type === 'radio') {
                        source.checked = proxy.checked;
                    } else {
                        source.value = proxy.value;
                    }
                    source.dispatchEvent(new Event(eventName, {bubbles: true}));
                    if (eventName === 'change' && source.checked &&
                        String(source.name || '').indexOf('agreement[') === 0) {
                        $(source).valid();
                    }
                });
            });
        } else if (tag === 'button' || tag === 'a') {
            proxy.addEventListener('click', function (event) {
                event.preventDefault();
                source.click();
            });
        }
    }

    function agreementProxyPart(sourcePart, partIndex) {
        var clone = sourcePart.cloneNode(true),
            sourceControls,
            cloneControls,
            idMap = {};

        clone.classList.remove('fastcheckout-agreements-native-source');
        clone.removeAttribute('aria-hidden');
        clone.querySelectorAll('#checkout-agreements-modal').forEach(function (modal) {
            modal.remove();
        });

        sourceControls = Array.prototype.filter.call(sourcePart.querySelectorAll(
            'input, select, textarea, button, a'
        ), function (control) {
            return !control.closest('#checkout-agreements-modal');
        });
        cloneControls = clone.querySelectorAll('input, select, textarea, button, a');
        cloneControls.forEach(function (control, index) {
            if (sourceControls[index]) {
                proxyAgreementControl(sourceControls[index], control);
            }
        });

        clone.querySelectorAll('[data-bind]').forEach(function (node) {
            node.removeAttribute('data-bind');
        });
        clone.removeAttribute('data-bind');
        clone.querySelectorAll('[data-fastcheckout-subscribe]').forEach(function (input) {
            input.setAttribute('data-fastcheckout-subscribe-proxy', '1');
            input.removeAttribute('data-fastcheckout-subscribe');
        });
        if (clone.hasAttribute('data-fastcheckout-newsletter')) {
            clone.setAttribute('data-fastcheckout-newsletter-proxy', '1');
            clone.removeAttribute('data-fastcheckout-newsletter');
        }
        if (clone.getAttribute('data-role') === 'checkout-agreements') {
            clone.setAttribute('data-fastcheckout-agreements-proxy-region', '1');
            clone.removeAttribute('data-role');
        }

        Array.prototype.forEach.call(clone.querySelectorAll('[id]'), function (node) {
            var original = node.id;

            node.id = 'fastcheckout-agreements-summary-' + partIndex + '-' + original;
            idMap[original] = node.id;
        });
        clone.querySelectorAll('[for], [aria-describedby], [aria-labelledby], [aria-controls]')
            .forEach(function (node) {
                ['for', 'aria-describedby', 'aria-labelledby', 'aria-controls']
                    .forEach(function (attribute) {
                        var value = node.getAttribute(attribute);

                        if (value) {
                            node.setAttribute(attribute, value.split(/\s+/).map(function (id) {
                                return idMap[id] || id;
                            }).join(' '));
                        }
                    });
            });

        return clone;
    }

    function syncAgreementsPortal(force) {
        var host = document.querySelector('[data-fastcheckout-agreements-summary-host]'),
            sources = document.querySelectorAll(
                '.fastcheckout-ko-payment-root .payment-method._active ' +
                '.checkout-agreements-block'
            ),
            source = Array.prototype.find.call(sources, function (candidate) {
                return agreementParts(candidate).length;
            }),
            parts = agreementParts(source),
            proxy;

        if (!host || !source || !parts.length) {
            restoreAgreementSource();
            if (host) {
                host.textContent = '';
                host.hidden = true;
            }
            return;
        }
        if (!force && source === agreementsPortalSource && !host.hidden) {
            return;
        }
        if (source !== agreementsPortalSource) {
            restoreAgreementSource();
        } else if (agreementsPortalObserver) {
            agreementsPortalObserver.disconnect();
        }

        proxy = document.createElement('div');
        proxy.className = 'checkout-agreements-block';
        proxy.setAttribute('data-fastcheckout-agreements-proxy', '1');
        parts.forEach(function (part, index) {
            proxy.appendChild(agreementProxyPart(part, index));
        });
        host.textContent = '';
        host.appendChild(proxy);
        host.hidden = false;

        agreementsPortalParts.forEach(function (part) {
            if (parts.indexOf(part) === -1) {
                restoreAgreementPart(part);
            }
        });
        parts.forEach(function (part) {
            part.classList.add('fastcheckout-agreements-native-source');
            part.setAttribute('aria-hidden', 'true');
            part.querySelectorAll('input, select, textarea, button, a, [tabindex]')
                .forEach(function (control) {
                    if (!control.hasAttribute('data-fastcheckout-portal-tabindex')) {
                        control.setAttribute(
                            'data-fastcheckout-portal-tabindex',
                            control.hasAttribute('tabindex') ? control.getAttribute('tabindex') : ''
                        );
                    }
                    control.setAttribute('tabindex', '-1');
                });
        });
        agreementsPortalSource = source;
        agreementsPortalParts = parts;

        if (window.MutationObserver) {
            agreementsPortalObserver = agreementsPortalObserver || new MutationObserver(function () {
                syncAgreementsPortal(true);
            });
            agreementsPortalObserver.observe(source, {
                attributes: true,
                attributeFilter: [
                    'aria-invalid',
                    'checked',
                    'disabled',
                    'data-fastcheckout-automatic-agreement'
                ],
                characterData: true,
                childList: true,
                subtree: true
            });
        }
    }

    function revealNativeContent() {
        var loader = document.querySelector('[data-fastcheckout-startup-loader]'),
            summaryRoot = document.getElementById('fastcheckout-ko-summary-root'),
            summaryFallback = document.querySelector('[data-fastcheckout-summary-ssr]'),
            nativeSummary = summaryRoot && summaryRoot.querySelector('.fastcheckout-native-summary'),
            billingComponent = activeBillingAddressComponent(),
            billingAddress = quote.billingAddress(),
            shippingAddress = quote.shippingAddress(),
            billingType = billingAddress && typeof billingAddress.getType === 'function' ?
                billingAddress.getType() : '';

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

        if (!quote.isVirtual() && shippingAddress &&
            (!billingAddress || billingAddress.getCacheKey() !== shippingAddress.getCacheKey()) &&
            !billingAddressChoiceTouched &&
            !checkoutData.getSelectedBillingAddress() &&
            (!billingAddress || billingType === 'new-customer-address' ||
                billingType === 'new-customer-billing-address')) {
            selectBillingAddress(shippingAddress);
            billingAddress = quote.billingAddress();
        }

        if (billingComponent && typeof billingComponent.isAddressSameAsShipping === 'function') {
            billingComponent.isAddressSameAsShipping(Boolean(
                !quote.isVirtual() && billingAddress && shippingAddress &&
                billingAddress.getCacheKey() === shippingAddress.getCacheKey()
            ));
        }

        syncAgreementsPortal(false);
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
        var component = activeBillingAddressComponent();

        if (component && component.isAddressSameAsShipping &&
            component.isAddressSameAsShipping() && quote.shippingAddress()) {
            selectBillingAddress(quote.shippingAddress());

            return true;
        }

        if (quote.billingAddress()) {
            return true;
        }

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
            if (active) {
                window.setTimeout(watchForPaymentError, 0);
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

    function smoothScrollTo(scrollTop) {
        var scroller = document.scrollingElement || document.documentElement,
            target = Math.max(0, Math.min(
                scrollTop,
                scroller.scrollHeight - window.innerHeight
            )),
            start = scroller.scrollTop,
            distance = target - start,
            startedAt = Date.now(),
            lastApplied = start;

        if (scrollAnimationTimer) {
            window.clearInterval(scrollAnimationTimer);
        }
        if (!distance || window.matchMedia(
            '(prefers-reduced-motion: reduce)'
        ).matches) {
            scroller.scrollTop = target;
            return;
        }

        scrollAnimationTimer = window.setInterval(function () {
            var progress;

            if (Math.abs(scroller.scrollTop - lastApplied) > 2) {
                window.clearInterval(scrollAnimationTimer);
                scrollAnimationTimer = null;
                return;
            }

            progress = Math.min((Date.now() - startedAt) / 300, 1);
            lastApplied = start + distance * (1 - Math.pow(1 - progress, 3));
            scroller.scrollTop = lastApplied;

            if (progress === 1) {
                window.clearInterval(scrollAnimationTimer);
                scrollAnimationTimer = null;
            }
        }, 16);
    }

    function scrollToFirstVisibleError(scope) {
        var root = scope || document.getElementById('fastcheckout-checkout'),
            errors = root && root.querySelectorAll(
                '[data-fastcheckout-shipping-method-error], ' +
                '.field-error, ' +
                '.mage-error:not(input):not(select):not(textarea), ' +
                '.msg__error, ' +
                '.message-error, ' +
                '.message.error, ' +
                '[aria-invalid="true"], ' +
                '[role="alert"]'
            ),
            error = errors && Array.prototype.find.call(errors, function (element) {
                return !element.closest('.fastcheckout-agreements-native-source') &&
                    element.getClientRects().length &&
                    window.getComputedStyle(element).visibility !== 'hidden';
            }),
            box,
            scrollTop;

        if (error) {
            box = error.getBoundingClientRect();
            scrollTop = window.pageYOffset + box.top -
                (window.innerHeight - box.height) / 2;
            smoothScrollTo(scrollTop);

            return true;
        }

        return false;
    }

    function watchForValidationError(scope, errorScopes) {
        var scopes = errorScopes || [scope],
            scrollToError = function () {
                return scopes.some(function (errorScope) {
                    return scrollToFirstVisibleError(errorScope);
                });
            };

        if (validationErrorObserver) {
            validationErrorObserver.disconnect();
            validationErrorObserver = null;
        }
        if (!scope || scrollToError() || !window.MutationObserver) {
            return;
        }
        validationErrorObserver = new MutationObserver(function () {
            if (scrollToError()) {
                validationErrorObserver.disconnect();
                validationErrorObserver = null;
            }
        });
        validationErrorObserver.observe(scope, {
            attributes: true,
            characterData: true,
            childList: true,
            subtree: true
        });
    }

    function watchForPaymentError() {
        var root = document.getElementById('fastcheckout-checkout');

        watchForValidationError(root, [
            document.querySelector('.fastcheckout-ko-payment-root .payment-method._active'),
            document.querySelector('[data-fastcheckout-agreements-summary-host]')
        ].filter(Boolean));
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
        paymentValid = !shippingValid || validatePaymentMethod();

        if (!emailValid) {
            email.trigger('focus');
        } else if (!addressValid && typeof shipping.focusInvalid === 'function') {
            shipping.focusInvalid();
        }
        if (!addressValid || !emailValid || !shippingValid || !paymentValid) {
            window.setTimeout(function () {
                watchForValidationError(
                    addressValid && emailValid && !shippingValid
                        ? document.getElementById('fastcheckout-ko-shipping-root')
                        : document.getElementById('fastcheckout-checkout')
                );
            }, 0);
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
        document.addEventListener('fastcheckout:order-submit-started', function () {
            setPlaceOrderProcessing(true);
        });
        document.addEventListener('fastcheckout:order-submit-failed', function () {
            setPlaceOrderProcessing(false);
        });
        window.addEventListener('pageshow', function (event) {
            if (event.persisted) {
                setPlaceOrderProcessing(false);
            }
        });
        document.querySelectorAll(
            '[data-fastcheckout-place-order-mobile], [data-fastcheckout-place-order-ssr]'
        ).forEach(function (proxy) {
            proxy.addEventListener('click', function () {
                if (placeOrderProcessing) {
                    return;
                }
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
        function saveLatestShippingInformation() {
            if (shippingSavePending) {
                return;
            }

            window.clearTimeout(shippingSaveTimer);
            shippingSaveQueued = false;
            shippingSavePending = true;
            if (quote.guestEmail) {
                quote.shippingAddress().email = quote.guestEmail;
            }
            setShippingInformation().always(function () {
                shippingSavePending = false;
                if (shippingSaveQueued) {
                    saveLatestShippingInformation();
                }
            });
        }

        registry.async('checkout.steps.shipping-step.shippingAddress')(function () {
            quote.shippingMethod.subscribe(function (method) {
                window.clearTimeout(shippingSaveTimer);
                if (!method) {
                    shippingSaveQueued = false;
                    return;
                }

                shippingSaveQueued = true;
                shippingSaveTimer = window.setTimeout(function () {
                    // Carrier-specific fields are validated by the place-order flow.
                    saveLatestShippingInformation();
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

        if (root) {
            root.addEventListener('click', function (event) {
                var method,
                    radio;

                if (event.target.matches && event.target.matches(
                    'input[name="billing-address-same-as-shipping"]'
                )) {
                    billingAddressChoiceTouched = true;
                }

                if (!event.target.closest || event.target.closest(
                    'a, button, input, label, select, textarea, [role="button"], ' +
                    '[contenteditable="true"]'
                )) {
                    return;
                }

                method = event.target.closest('.payment-method:not(._active)');
                if (!method || !method.closest('.fastcheckout-ko-payment-root')) {
                    return;
                }

                radio = method.querySelector(
                    'input[type="radio"][name="payment[method]"], input[type="radio"]'
                );
                if (radio && !radio.disabled) {
                    radio.click();
                }
            }, true);
        }

        app(jsLayout);
        customerData.getInitCustomerData().done(function () {
            checkoutDataResolver.resolveBillingAddress();
            bindPlaceOrderProxies();
            saveShippingWhenMethodChanges();

            quote.paymentMethod.subscribe(function () {
                setClientOrderError('');
                if (validationErrorObserver) {
                    validationErrorObserver.disconnect();
                    validationErrorObserver = null;
                }
                window.setTimeout(function () {
                    revealNativeContent();
                }, 0);
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
        });
    };
});
