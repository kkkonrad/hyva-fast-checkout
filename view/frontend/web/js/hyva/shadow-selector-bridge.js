define([
    'jquery'
], function ($) {
    'use strict';

    return function () {
        if (!$ || !$.fn || typeof $.fn.init !== 'function' || $.fn.init.fastcheckoutPatched) {
            return;
        }

        var originalInit = $.fn.init;

        $.fn.init = function (selector, context, root) {
            var result,
                elements = [];

            if (window.fastcheckoutInsideSelectorOverride) {
                return originalInit.apply(this, arguments);
            }

            result = originalInit.apply(this, arguments);
            if (typeof selector !== 'string' || result.length > 0 || selector.indexOf('<') === 0) {
                return result;
            }

            window.fastcheckoutInsideSelectorOverride = true;
            try {
                document.querySelectorAll('[data-fastcheckout-payment-method-ko-target]').forEach(function (placeholder) {
                    if (placeholder.shadowRoot) {
                        $(placeholder.shadowRoot).find(selector).each(function () {
                            elements.push(this);
                        });
                    }
                });

                if (elements.length > 0) {
                    return originalInit.call(this, elements);
                }
            } finally {
                window.fastcheckoutInsideSelectorOverride = false;
            }

            return result;
        };

        $.fn.init.prototype = $.fn;
        $.fn.init.fastcheckoutPatched = true;
    };
});
