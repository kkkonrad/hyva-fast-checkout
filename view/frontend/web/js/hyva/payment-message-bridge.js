define([], function () {
    'use strict';

    return function (deps) {
        deps = deps || {};

        var registry = deps.registry,
            Messages = deps.Messages,
            globalMessageList = deps.globalMessageList,
            errorProcessor = deps.errorProcessor,
            fullScreenLoader = deps.fullScreenLoader,
            translate = typeof deps.translate === 'function' ? deps.translate : function (message) { return message; },
            bridgeMessageContainer = typeof Messages === 'function' ? new Messages() : null,
            localTranslations = {
                'Please complete shipping information.': 'Uzupełnij informacje dotyczące dostawy.',
                'Please select a payment method.': 'Wybierz metodę płatności.',
                'Please select a shipping method.': 'Wybierz metodę dostawy.',
                'Please select a shipping method and try again.': 'Wybierz metodę dostawy i spróbuj ponownie.',
                'Please check the shipping address and try again.': 'Sprawdź adres dostawy i spróbuj ponownie.',
                'Please check the billing address and try again.': 'Sprawdź adres rozliczeniowy i spróbuj ponownie.',
                'Checkout session is not ready. Please refresh the page and try again.': 'Sesja checkoutu nie jest gotowa. Odśwież stronę i spróbuj ponownie.',
                'Please check the selected payment method and try again.': 'Sprawdź wybraną metodę płatności i spróbuj ponownie.',
                'The selected payment method is not ready. Please try again.': 'Wybrana metoda płatności nie jest jeszcze gotowa. Spróbuj ponownie.',
                'The selected payment method did not start order placement. Please try again.': 'Wybrana metoda płatności nie rozpoczęła składania zamówienia. Spróbuj ponownie.',
                'We could not place your order. Please try again.': 'Nie udało się złożyć zamówienia. Spróbuj ponownie.',
                'Something went wrong while processing your order. Please try again later.': 'Coś poszło nie tak podczas przetwarzania zamówienia. Spróbuj ponownie później.',
                'This is a required field.': 'To jest wymagane pole.',
                'The order was not placed.': 'Zamówienie nie zostało złożone.',
                'Checkout is not ready.': 'Proces zamówienia nie jest jeszcze gotowy.',
                'Could not estimate shipping rates.': 'Nie udało się obliczyć stawek dostawy.',
                'Shipping estimate modules unavailable': 'Moduły wyceny dostawy są niedostępne.',
                'Please select a pickup point': 'Wybierz punkt odbioru'
            };

        function isPolishLocale() {
            var locale = (window.LOCALE || (window.checkoutConfig && window.checkoutConfig.locale) || '').toLowerCase();

            return locale.indexOf('pl') === 0;
        }

        function translateMessage(message) {
            var translated;

            if (!message) {
                return '';
            }

            translated = translate(message);
            if (translated !== message) {
                return translated;
            }

            if (isPolishLocale() && localTranslations[message]) {
                return localTranslations[message];
            }

            return translated;
        }

        function getMessageText(message) {
            if (!message) {
                return '';
            }

            if (typeof message === 'string') {
                return translateMessage(message);
            }

            if (message.message) {
                return translateMessage(message.message);
            }

            if (message.responseJSON && message.responseJSON.message) {
                return translateMessage(message.responseJSON.message);
            }

            return String(message);
        }

        function normalizeMessage(message) {
            return getMessageText(message)
                .replace(/<[^>]*>/g, ' ')
                .replace(/&nbsp;/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
        }

        function getPaymentInlineErrorTarget(methodCode) {
            var target = methodCode ? document.querySelector(
                '[data-fastcheckout-payment-method-ko-target="' + String(methodCode).replace(/"/g, '') + '"]'
            ) : document.querySelector(
                '[data-fastcheckout-payment-method-ko-target]:not(.hidden)'
            );

            if (
                !target ||
                target.style.display === 'none' ||
                (target.classList && target.classList.contains('hidden'))
            ) {
                return null;
            }

            return target;
        }

        /**
         * Collect visible inline payment errors (PayU .payu-msg, Magento messages, alerts).
         *
         * @param {String} [methodCode]
         * @returns {String}
         */
        function getInlineErrorText(methodCode) {
            var target = getPaymentInlineErrorTarget(methodCode),
                texts = [],
                seen = {};

            if (!target) {
                return '';
            }

            Array.prototype.forEach.call(target.querySelectorAll(
                '.payu-msg, .msg__error, .message-error, .message.error, .field-error, [role="alert"]'
            ), function (element) {
                var inlineText,
                    style,
                    hiddenParent;

                if (!element || element.nodeType !== 1) {
                    return;
                }

                // Skip nested .msg__error when the parent .payu-msg is already collected.
                if (
                    element.classList &&
                    element.classList.contains('msg__error') &&
                    element.closest &&
                    element.closest('.payu-msg')
                ) {
                    return;
                }

                style = window.getComputedStyle ? window.getComputedStyle(element) : null;
                if (
                    style &&
                    (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')
                ) {
                    return;
                }

                if (element.offsetParent === null && style && style.position !== 'fixed') {
                    return;
                }

                hiddenParent = element.closest && element.closest('.hidden, [hidden]');
                if (hiddenParent) {
                    return;
                }

                inlineText = normalizeMessage(element.innerText || element.textContent || '');
                if (inlineText && !seen[inlineText]) {
                    seen[inlineText] = true;
                    texts.push(inlineText);
                }
            });

            return texts.join(' ').trim();
        }

        function hasInlineError(methodCode, message) {
            var text = normalizeMessage(message),
                inlineText = getInlineErrorText(methodCode);

            if (!inlineText) {
                return false;
            }

            // Any visible gateway error counts when the caller has no specific message yet.
            if (!text) {
                return true;
            }

            return inlineText.indexOf(text) !== -1 || text.indexOf(inlineText) !== -1;
        }

        function watchErrors(messageContainer, callback) {
            if (
                !messageContainer ||
                typeof callback !== 'function' ||
                typeof messageContainer.errorMessages !== 'function' ||
                typeof messageContainer.errorMessages.subscribe !== 'function'
            ) {
                return null;
            }

            return messageContainer.errorMessages.subscribe(function (messages) {
                if (messages && messages.length) {
                    callback(messages[messages.length - 1]);
                }
            });
        }

        function observeFailure(result, callback) {
            if (!result || typeof callback !== 'function') {
                return;
            }

            if (typeof result.fail === 'function') {
                result.fail(callback);
            } else if (typeof result.catch === 'function') {
                result.catch(callback);
            }
        }

        function dispatch(type, message) {
            var text = getMessageText(message);

            if (!text) {
                return;
            }

            document.dispatchEvent(new CustomEvent('fastcheckout:payment-message', {
                detail: {
                    type: type,
                    message: text
                }
            }));

            if (type === 'error') {
                document.dispatchEvent(new CustomEvent('fastcheckout:payment-error', {
                    detail: {
                        message: text
                    }
                }));
            }
        }

        function subscribe(messageContainer) {
            if (!messageContainer || messageContainer.fastcheckoutHyvaSubscribed) {
                return messageContainer;
            }

            messageContainer.fastcheckoutHyvaSubscribed = true;

            watchErrors(messageContainer, function (message) {
                dispatch('error', message);
            });

            if (
                typeof messageContainer.successMessages === 'function' &&
                typeof messageContainer.successMessages.subscribe === 'function'
            ) {
                messageContainer.successMessages.subscribe(function (messages) {
                    if (messages && messages.length) {
                        dispatch('success', messages[messages.length - 1]);
                    }
                });
            }

            return messageContainer;
        }

        function getBridgeMessageContainer() {
            return subscribe(bridgeMessageContainer);
        }

        function getCheckoutErrorsComponent() {
            var component;

            try {
                component = registry.get('checkout.errors');
            } catch (e) {
                component = null;
            }

            if (!component) {
                component = {
                    name: 'checkout.errors',
                    index: 'checkout.errors',
                    messageContainer: getBridgeMessageContainer()
                };

                try {
                    registry.set('checkout.errors', component);
                } catch (e) {
                    if (window.console && typeof window.console.warn === 'function') {
                        window.console.warn('Kkkonrad Fastcheckout: could not register fallback checkout.errors component.', e);
                    }
                }
            } else if (!component.messageContainer) {
                component.messageContainer = getBridgeMessageContainer();
            } else {
                subscribe(component.messageContainer);
            }

            return component;
        }

        function clear() {
            if (bridgeMessageContainer && typeof bridgeMessageContainer.clear === 'function') {
                bridgeMessageContainer.clear();
            }
            if (globalMessageList && typeof globalMessageList.clear === 'function') {
                globalMessageList.clear();
            }
        }

        function hasMessages(messageContainer) {
            return !!(
                messageContainer &&
                typeof messageContainer.hasMessages === 'function' &&
                messageContainer.hasMessages()
            );
        }

        function handleError(error, messageContainer, methodCode) {
            var container = subscribe(messageContainer) || getBridgeMessageContainer(),
                message = error && error.message
                    ? translateMessage(error.message)
                    : translateMessage('Something went wrong while processing your order. Please try again later.');

            if (fullScreenLoader && typeof fullScreenLoader.stopLoader === 'function') {
                fullScreenLoader.stopLoader(true);
            }

            if (hasInlineError(methodCode, message)) {
                return true;
            }

            if (error && (error.responseText || error.status)) {
                try {
                    errorProcessor.process(error, container);
                    return false;
                } catch (e) {}
            }

            if (hasMessages(container)) {
                return false;
            }

            if (container && typeof container.addErrorMessage === 'function') {
                container.addErrorMessage({ message: message });
            } else {
                dispatch('error', message);
            }

            return false;
        }

        return {
            translate: translateMessage,
            getText: getMessageText,
            normalize: normalizeMessage,
            hasInlineError: hasInlineError,
            getInlineErrorText: getInlineErrorText,
            dispatch: dispatch,
            subscribe: subscribe,
            getContainer: getBridgeMessageContainer,
            getCheckoutErrorsComponent: getCheckoutErrorsComponent,
            clear: clear,
            hasMessages: hasMessages,
            watchErrors: watchErrors,
            observeFailure: observeFailure,
            handleError: handleError
        };
    };
});
