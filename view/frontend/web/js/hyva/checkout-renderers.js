define([
    'jquery',
    'Magento_Ui/js/core/app',
    'Magento_Checkout/js/model/quote',
    'Magento_Checkout/js/model/checkout-data-resolver',
    'Magento_Checkout/js/checkout-data',
    'Magento_Customer/js/customer-data',
    'Magento_Checkout/js/model/totals',
    'Magento_Checkout/js/model/payment-service',
    'Magento_Checkout/js/model/payment/method-list',
    'Magento_Checkout/js/action/select-billing-address',
    'Magento_Catalog/js/price-utils',
    'mage/translate',
    'Kkkonrad_Fastcheckout/js/model/shipping-save-coordinator',
    'Kkkonrad_Fastcheckout/js/model/one-step-validator',
    'Kkkonrad_Fastcheckout/js/model/shipping-additional-placement',
    'uiRegistry'
], function (
    $,
    app,
    quote,
    checkoutDataResolver,
    checkoutData,
    customerData,
    totals,
    paymentService,
    paymentMethodList,
    selectBillingAddress,
    priceUtils,
    $t,
    shippingSaveCoordinator,
    oneStepValidator,
    shippingAdditionalPlacement,
    registry
) {
    'use strict';

    var initialized = false,
        paymentDomObserver,
        startupDomObserver,
        validationErrorObserver,
        agreementsPortalObserver,
        agreementsPortalSource,
        agreementsPortalParts = [],
        scrollAnimationTimer,
        shippingSaveTimer,
        billingAddressFollowsShipping = null,
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

    function addStylesheetToHead(link) {
        var duplicate;

        if (!document.head || !link.href) {
            return;
        }

        duplicate = Array.prototype.some.call(
            document.head.querySelectorAll('link[rel~="stylesheet"][href]'),
            function (candidate) {
                return candidate.href === link.href;
            }
        );

        if (duplicate) {
            link.remove();
        } else {
            document.head.appendChild(link);
        }
    }

    function addConfiguredStylesheets(config) {
        Object.keys(config || {}).forEach(function (key) {
            var value = config[key],
                container;

            if (key.toLowerCase() === 'addcss' && typeof value === 'string') {
                container = document.createElement('div');
                container.innerHTML = value;
                container.querySelectorAll('link[rel~="stylesheet"][href]')
                    .forEach(addStylesheetToHead);
            } else if (value && typeof value === 'object') {
                addConfiguredStylesheets(value);
            }
        });
    }

    function hoistCheckoutStylesheets() {
        var root = document.getElementById('fastcheckout-checkout');

        if (root) {
            root.querySelectorAll('link[rel~="stylesheet"][href]')
                .forEach(addStylesheetToHead);
        }
    }

    function isWalletCheckoutControl(node) {
        return Boolean(node && node.closest && node.closest(
            '#paypal-button, .paypal-button, [data-funding-source], ' +
            '.gpay-button, #gpay-button, apple-pay-button, .apple-pay-button, ' +
            '.adyen-checkout__dropin, .adyen-checkout__button, ' +
            '[data-adyen-checkout], .klarna-button'
        ));
    }

    function activePaymentMethodElement() {
        var activeCode = activePaymentCode(),
            found = null;

        document.querySelectorAll(
            '.fastcheckout-ko-payment-root .payment-method'
        ).forEach(function (method) {
            if (!found && paymentCode(method) === activeCode) {
                found = method;
            }
        });

        return found;
    }

    function activeMethodHasOwnCheckoutCta() {
        var method = activePaymentMethodElement();

        if (!method) {
            return false;
        }

        return Array.prototype.some.call(method.querySelectorAll(
            'button, a.action, [role="button"], apple-pay-button, ' +
            '#paypal-button, .paypal-button, .gpay-button, ' +
            '.adyen-checkout__dropin, .adyen-checkout__button, .klarna-button'
        ), function (node) {
            return !node.classList.contains('fastcheckout-native-place-order-hidden') &&
                !node.closest('.checkout-agreements-block') &&
                !node.closest('.payment-method-billing-address') &&
                !node.closest('[data-fastcheckout-newsletter]') &&
                (isWalletCheckoutControl(node) ||
                    node.matches(
                        'apple-pay-button, #paypal-button, .paypal-button, ' +
                        '.gpay-button, .adyen-checkout__button, .klarna-button, ' +
                        '.adyen-checkout__dropin'
                    ));
        });
    }

    function placeOrderButton(method) {
        var buttons = method ? method.querySelectorAll(
            '.payment-method-content [data-role="review-save"], ' +
            '.payment-method-content .action.checkout, ' +
            '.payment-method-content button.checkout, ' +
            '.payment-method-content input.checkout[type="submit"]'
        ) : [];

        return Array.prototype.find.call(buttons, function (button) {
            return !isWalletCheckoutControl(button);
        }) || null;
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
        var activeButton,
            walletOnly;

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
        walletOnly = !activeButton && activeMethodHasOwnCheckoutCta();

        document.querySelectorAll(
            '[data-fastcheckout-place-order-mobile], [data-fastcheckout-place-order-ssr]'
        ).forEach(function (button) {
            button.hidden = walletOnly;
            button.classList.toggle('hidden', walletOnly);
            button.disabled = placeOrderProcessing || walletOnly;
            button.setAttribute('aria-disabled', button.disabled ? 'true' : 'false');
            button.dataset.fastcheckoutNativeTargetReady = activeButton ? '1' : '0';
            if (walletOnly) {
                button.setAttribute('data-fastcheckout-wallet-only', '1');
            } else {
                button.removeAttribute('data-fastcheckout-wallet-only');
            }
        });

        document.querySelectorAll('[data-fastcheckout-place-order-ssr]').forEach(function (button) {
            button.classList.toggle('fastcheckout-place-order-proxy-ready', Boolean(activeButton));
        });
        document.querySelectorAll('.fastcheckout-place-order-section').forEach(function (section) {
            section.classList.toggle('fastcheckout-place-order-wallet-only', walletOnly);
        });
        document.querySelectorAll('[data-fastcheckout-mobile-sticky]').forEach(function (bar) {
            bar.classList.toggle('fastcheckout-place-order-wallet-only', walletOnly);
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
            if (type === 'checkbox' || type === 'radio') {
                proxy.addEventListener('change', function () {
                    if (source.checked !== proxy.checked) {
                        source.click();
                    }
                    if (source.checked && String(source.name || '').indexOf('agreement[') === 0) {
                        $(source).valid();
                    }
                });

                return;
            }
            ['input', 'change'].forEach(function (eventName) {
                proxy.addEventListener(eventName, function () {
                    source.value = proxy.value;
                    source.dispatchEvent(new Event(eventName, {bubbles: true}));
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

    function revealStartupContent() {
        var loader = document.querySelector('[data-fastcheckout-startup-loader]'),
            summaryRoot = document.getElementById('fastcheckout-ko-summary-root'),
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
        }

        return (!loader || loader.hidden) &&
            (!summaryRoot || !summaryRoot.classList.contains('hidden'));
    }

    function syncBillingAddress() {
        var billingComponent = oneStepValidator.getBillingAddressComponent(),
            billingAddress = quote.billingAddress(),
            shippingAddress = quote.shippingAddress(),
            billingType = billingAddress && typeof billingAddress.getType === 'function' ?
                billingAddress.getType() : '';

        if (!quote.isVirtual() && shippingAddress &&
            (!billingAddress || billingAddress.getCacheKey() !== shippingAddress.getCacheKey()) &&
            billingAddressFollowsShipping !== false &&
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
    }

    function syncPaymentContent() {
        hoistCheckoutStylesheets();
        syncBillingAddress();

        syncAgreementsPortal(false);
        wirePlaceOrderButtons();
    }

    function revealNativeContent() {
        revealStartupContent();
        syncPaymentContent();
    }

    function observeNativeContent() {
        var paymentRoot = document.querySelector('.fastcheckout-ko-payment-root'),
            startupRoots = [
                document.querySelector('.fastcheckout-native-shipping-address'),
                document.getElementById('fastcheckout-ko-summary-root')
            ].filter(Boolean);

        if (!window.MutationObserver) {
            return;
        }

        if (paymentRoot) {
            paymentDomObserver = new MutationObserver(function () {
                window.setTimeout(syncPaymentContent, 0);
            });
            paymentDomObserver.observe(paymentRoot, {childList: true, subtree: true});
        }

        if (startupRoots.length && !revealStartupContent()) {
            startupDomObserver = new MutationObserver(function () {
                if (revealStartupContent()) {
                    startupDomObserver.disconnect();
                    startupDomObserver = null;
                }
            });
            startupRoots.forEach(function (root) {
                startupDomObserver.observe(root, {childList: true, subtree: true});
            });
        }
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

    function submitActivePayment() {
        window.setTimeout(function () {
            var active = activePlaceOrderButton(),
                method = active && active.closest('.payment-method'),
                scroller = document.scrollingElement || document.documentElement,
                scrollTop = scroller.scrollTop;

            if (method) {
                method.setAttribute('data-fastcheckout-validation-attempted', 'true');
            }
            if (active && !active.disabled) {
                active.click();
            }
            if (active && !placeOrderProcessing) {
                scroller.scrollTop = scrollTop;
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
            startedAt = Date.now();

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

            progress = Math.min((Date.now() - startedAt) / 300, 1);
            scroller.scrollTop = start + distance * (1 - Math.pow(1 - progress, 3));

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
                '.braintree-hosted-fields-invalid, ' +
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
            document.querySelector('.fastcheckout-native-shipping-address'),
            document.getElementById('checkout-step-shipping_method'),
            document.querySelector('.fastcheckout-ko-payment-root .payment-method._active'),
            document.querySelector('[data-fastcheckout-agreements-summary-host]')
        ].filter(Boolean));
    }

    function validateAndPlaceOrder() {
        var shippingValid,
            scroller = document.scrollingElement || document.documentElement,
            scrollTop = scroller.scrollTop;

        setClientOrderError('');

        if (!activePaymentCode()) {
            shippingValid = oneStepValidator.validateShippingInformation();
            if (shippingValid) {
                validatePaymentMethod();
            }
            scroller.scrollTop = scrollTop;
            window.setTimeout(function () {
                watchForValidationError(document.getElementById('fastcheckout-checkout'));
            }, 0);
            return;
        }

        if (!oneStepValidator.validateBillingAddress()) {
            scroller.scrollTop = scrollTop;
            window.setTimeout(function () {
                watchForValidationError(document.getElementById('fastcheckout-checkout'));
            }, 0);
            return;
        }

        submitActivePayment();
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
                validateAndPlaceOrder();
            });
        });
    }

    function saveShippingWhenMethodChanges() {
        registry.async('checkout.steps.shipping-step.shippingAddress')(function () {
            function queueSave(method) {
                window.clearTimeout(shippingSaveTimer);
                if (!method) {
                    return;
                }

                shippingSaveTimer = window.setTimeout(function () {
                    // Carrier-specific fields are validated by the place-order flow.
                    shippingSaveCoordinator.ensureSaved();
                }, 50);
            }

            quote.shippingMethod.subscribe(queueSave);
            if (quote.shippingMethod() &&
                !paymentService.getAvailablePaymentMethods().length &&
                !(window.checkoutConfig.paymentMethods || []).length) {
                queueSave(quote.shippingMethod());
            }
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
                    billingAddressFollowsShipping = event.target.checked;
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

        addConfiguredStylesheets(window.checkoutConfig);
        customerData.getInitCustomerData().done(function () {
            app(jsLayout);
            checkoutDataResolver.resolveBillingAddress();
            bindPlaceOrderProxies();
            saveShippingWhenMethodChanges();
            shippingAdditionalPlacement.bind();

            quote.paymentMethod.subscribe(function () {
                setClientOrderError('');
                document.querySelectorAll('[data-fastcheckout-validation-attempted]')
                    .forEach(function (method) {
                        method.removeAttribute('data-fastcheckout-validation-attempted');
                    });
                if (validationErrorObserver) {
                    validationErrorObserver.disconnect();
                    validationErrorObserver = null;
                }
                window.setTimeout(function () {
                    syncPaymentContent();
                }, 0);
            });
            quote.shippingAddress.subscribe(function () {
                window.setTimeout(syncBillingAddress, 0);
            });
            quote.billingAddress.subscribe(function () {
                window.setTimeout(syncBillingAddress, 0);
            });
            if (paymentMethodList && typeof paymentMethodList.subscribe === 'function') {
                paymentMethodList.subscribe(function () {
                    window.setTimeout(syncPaymentContent, 0);
                });
            }
            if (totals.totals && typeof totals.totals.subscribe === 'function') {
                totals.totals.subscribe(function () {
                    updateMobileTotal();
                    revealStartupContent();
                });
            }

            window.setTimeout(function () {
                revealNativeContent();
                observeNativeContent();
                updateMobileTotal();
                window.dispatchEvent(new CustomEvent('fastcheckout:ready'));
            }, 0);
        });
    };
});
