define([], function () {
    'use strict';

    return function (deps) {
        deps = deps || {};

        var registry = deps.registry;

        function getListComponent() {
            return window.fastcheckoutHyvaShippingListInstance ||
                (typeof registry !== 'undefined' && registry.get('fastcheckoutHyvaShippingRenderers.shippingList')) ||
                null;
        }

        function clear() {
            var component = getListComponent();

            if (component && typeof component.clearError === 'function') {
                component.clearError();
            }
        }

        function ensureDomFallbackMessage(errorMessage) {
            var root = document.getElementById('fastcheckout-ko-shipping-root') ||
                    document.querySelector('.fastcheckout-shipping-methods, [data-role="shipping-methods"]'),
                box;

            if (!root || !errorMessage) {
                return;
            }

            box = root.querySelector('[data-fastcheckout-shipping-method-error-fallback="1"]');
            if (!box) {
                box = document.createElement('div');
                box.setAttribute('data-fastcheckout-shipping-method-error-fallback', '1');
                box.setAttribute('role', 'alert');
                box.className = 'rounded-lg border border-red-200 bg-red-50 px-3 py-2 mt-2';
                box.innerHTML = '<span class="field-error shipping-field-error text-sm text-red-600 font-medium block"></span>';
                root.appendChild(box);
            }

            box.style.display = '';
            if (box.firstElementChild) {
                box.firstElementChild.textContent = errorMessage;
            } else {
                box.textContent = errorMessage;
            }
        }

        function clearDomFallbackMessage() {
            document.querySelectorAll('[data-fastcheckout-shipping-method-error-fallback="1"]').forEach(function (box) {
                box.style.display = 'none';
                if (box.firstElementChild) {
                    box.firstElementChild.textContent = '';
                }
            });
        }

        function show(methodCode, carrierCode, errorMessage) {
            var component = getListComponent(),
                el,
                errorCode,
                painted = false;

            // No method selected → general list error (not tied to a single rate row).
            if (!methodCode && !carrierCode) {
                errorCode = 'general';
            } else {
                errorCode = String(carrierCode || '') + '_' + String(methodCode || '');
            }

            if (component && typeof component.setError === 'function') {
                component.setError(errorCode, errorMessage);
                painted = true;
            }

            // Always ensure a visible DOM message for general "pick a method" errors,
            // even if the KO list instance is missing or has not re-rendered yet.
            if (errorCode === 'general') {
                ensureDomFallbackMessage(errorMessage);
                painted = true;
            }

            el = document.querySelector('[data-fastcheckout-shipping-method-error="1"], [data-fastcheckout-shipping-method-error-fallback="1"]') ||
                (methodCode || carrierCode
                    ? document.getElementById('label_method_' + methodCode + '_' + carrierCode)
                    : null) ||
                document.getElementById('fastcheckout-ko-shipping-root') ||
                document.querySelector('[name="shipping_method"]') ||
                document.querySelector('[data-role="shipping-methods"], .fastcheckout-shipping-methods');

            if (el && typeof el.scrollIntoView === 'function') {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }

            return painted;
        }

        function clearAll() {
            clear();
            clearDomFallbackMessage();
        }

        return {
            getListComponent: getListComponent,
            clear: clearAll,
            show: show
        };
    };
});
