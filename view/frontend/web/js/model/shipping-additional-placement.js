define([
    'ko',
    'Magento_Checkout/js/model/quote',
    'Magento_Checkout/js/model/shipping-service'
], function (ko, quote, shippingService) {
    'use strict';

    var fallbackId = 'onepage-checkout-shipping-method-additional-load',
        bound = false;

    function fallback() {
        return document.getElementById(fallbackId);
    }

    function additionalHost(method) {
        if (!method || !method.method_code || !method.carrier_code) {
            return null;
        }

        return document.getElementById(
            'label_method_' + method.method_code + '_' + method.carrier_code + '_additional'
        );
    }

    function collectParts() {
        var parts = [],
            seen = [];

        document.querySelectorAll(
            '#' + fallbackId + ', [id^="label_method_"][id$="_additional"]'
        ).forEach(function (container) {
            Array.prototype.forEach.call(container.children, function (child) {
                if (seen.indexOf(child) === -1) {
                    seen.push(child);
                    parts.push(child);
                }
            });
        });

        return parts;
    }

    function markPart(part) {
        if (part.nodeType !== 1 || part.hasAttribute('data-fastcheckout-additional-placed')) {
            return;
        }
        part.setAttribute('data-fastcheckout-additional-placed', '1');
        part.addEventListener('click', function (event) {
            event.stopPropagation();
        });
    }

    function restore() {
        var root = fallback();

        if (!root) {
            return;
        }
        collectParts().forEach(function (part) {
            if (part.parentNode !== root) {
                root.appendChild(part);
            }
        });
    }

    function place() {
        var method = quote.shippingMethod && quote.shippingMethod(),
            root = fallback(),
            host = additionalHost(method),
            target = host || root;

        if (!target) {
            return;
        }
        collectParts().forEach(function (part) {
            markPart(part);
            if (part.parentNode !== target) {
                target.appendChild(part);
            }
        });
    }

    function schedule() {
        if (ko.tasks && typeof ko.tasks.schedule === 'function') {
            ko.tasks.schedule(place);
        } else {
            window.setTimeout(place, 0);
        }
    }

    function bind() {
        if (bound || !document.getElementById('fastcheckout-checkout')) {
            return;
        }
        bound = true;
        quote.shippingMethod.subscribe(schedule);
        shippingService.getShippingRates().subscribe(restore, null, 'beforeChange');
        shippingService.getShippingRates().subscribe(schedule);
        schedule();
    }

    return {
        bind: bind,
        place: place,
        restore: restore
    };
});
