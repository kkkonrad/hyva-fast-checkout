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
                'Checkout session is not ready. Please refresh the page and try again.': 'Sesja checkoutu nie jest gotowa. Odśwież stronę i spróbuj ponownie.',
                'Please check the selected payment method and try again.': 'Sprawdź wybraną metodę płatności i spróbuj ponownie.',
                'The selected payment method is not ready. Please try again.': 'Wybrana metoda płatności nie jest jeszcze gotowa. Spróbuj ponownie.',
                'The selected payment method did not start order placement. Please try again.': 'Wybrana metoda płatności nie rozpoczęła składania zamówienia. Spróbuj ponownie.',
                'We could not place your order. Please try again.': 'Nie udało się złożyć zamówienia. Spróbuj ponownie.',
                'Something went wrong while processing your order. Please try again later.': 'Coś poszło nie tak podczas przetwarzania zamówienia. Spróbuj ponownie później.',
                'This is a required field.': 'To jest wymagane pole.'
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

            return String(message);
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

            if (
                typeof messageContainer.errorMessages === 'function' &&
                typeof messageContainer.errorMessages.subscribe === 'function'
            ) {
                messageContainer.errorMessages.subscribe(function (messages) {
                    if (messages && messages.length) {
                        dispatch('error', messages[messages.length - 1]);
                    }
                });
            }

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

        function handleError(error, messageContainer) {
            var container = subscribe(messageContainer) || getBridgeMessageContainer(),
                message = error && error.message
                    ? translateMessage(error.message)
                    : translateMessage('Something went wrong while processing your order. Please try again later.');

            if (fullScreenLoader && typeof fullScreenLoader.stopLoader === 'function') {
                fullScreenLoader.stopLoader(true);
            }

            if (error && (error.responseText || error.status)) {
                try {
                    errorProcessor.process(error, container);
                    return;
                } catch (e) {}
            }

            if (hasMessages(container)) {
                return;
            }

            if (container && typeof container.addErrorMessage === 'function') {
                container.addErrorMessage({ message: message });
            } else {
                dispatch('error', message);
            }
        }

        return {
            translate: translateMessage,
            getText: getMessageText,
            dispatch: dispatch,
            subscribe: subscribe,
            getContainer: getBridgeMessageContainer,
            getCheckoutErrorsComponent: getCheckoutErrorsComponent,
            clear: clear,
            hasMessages: hasMessages,
            handleError: handleError
        };
    };
});
