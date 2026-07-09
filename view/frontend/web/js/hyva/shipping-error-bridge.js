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

        function show(methodCode, carrierCode, errorMessage) {
            var component = getListComponent(),
                el;

            if (component && typeof component.setError === 'function') {
                component.setError(carrierCode + '_' + methodCode, errorMessage);
            }

            el = document.getElementById('label_method_' + methodCode + '_' + carrierCode) ||
                document.getElementById('fastcheckout-ko-shipping-root') ||
                document.querySelector('[name="shipping_method"]');

            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }

        return {
            getListComponent: getListComponent,
            clear: clear,
            show: show
        };
    };
});
