define([
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function (isFastcheckoutActive) {
    'use strict';

    var manualMode = 1;

    return function (Component) {
        return Component.extend({
            isAgreementRequired: function (agreement) {
                return isFastcheckoutActive() ? true : this._super(agreement);
            },

            initModal: function (elements) {
                var element = elements && elements.nodeType === 1
                        ? elements
                        : Array.prototype.find.call(elements || [], function (node) {
                            return node.nodeType === 1;
                        }),
                    root = element && element.closest('[data-role="checkout-agreements"]'),
                    modal,
                    modes = {};

                this._super(elements);
                if (!isFastcheckoutActive()) {
                    return;
                }
                modal = element && element.closest('.agreements-modal');
                if (modal && typeof modal.addEventListener === 'function' &&
                    !modal.hasAttribute('data-fastcheckout-close-fallback')) {
                    modal.setAttribute('data-fastcheckout-close-fallback', '1');
                    modal.addEventListener('click', function (event) {
                        if (!event.target.closest(
                            '[data-role="closeBtn"], .action-hide-popup'
                        )) {
                            return;
                        }
                        window.setTimeout(function () {
                            if (!modal.classList.contains('_show')) {
                                modal.dispatchEvent(new Event('transitionend', {bubbles: true}));
                            }
                        }, 350);
                    });
                }

                (this.agreements || []).forEach(function (agreement) {
                    modes[String(agreement.agreementId)] = Number(agreement.mode);
                });
                if (!root) {
                    return;
                }

                root.querySelectorAll('input[name^="agreement["]').forEach(function (input) {
                    if (modes[String(input.value)] !== manualMode) {
                        input.checked = true;
                        input.disabled = true;
                        input.setAttribute('aria-disabled', 'true');
                        input.setAttribute('data-fastcheckout-automatic-agreement', '1');
                        input.classList.remove('required-entry');
                    }
                });
            }
        });
    };
});
