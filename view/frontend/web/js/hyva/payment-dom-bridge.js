define([], function () {
    'use strict';

    return function (deps) {
        deps = deps || {};

        var compareMethodCodes = typeof deps.compareMethodCodes === 'function'
            ? deps.compareMethodCodes
            : function (candidateCode, selectedCode) {
                return String(candidateCode || '') === String(selectedCode || '');
            };

        function getMethods() {
            var methods = [];

            document.querySelectorAll('input[name="payment_method"]').forEach(function (input) {
                var label = input.closest('label'),
                    titleElement = label ? label.querySelector('span') : null;

                methods.push({
                    method: input.value,
                    title: titleElement ? titleElement.textContent.trim() : '',
                    checked: !!input.checked,
                    disabled: !!input.disabled
                });
            });

            return methods;
        }

        function hasMethod(methodCode) {
            var found = false;

            if (!methodCode) {
                return false;
            }

            getMethods().forEach(function (method) {
                if (
                    !method.disabled &&
                    (
                        compareMethodCodes(method.method, methodCode) ||
                        compareMethodCodes(methodCode, method.method)
                    )
                ) {
                    found = true;
                }
            });

            return found;
        }

        function getCheckedMethod() {
            var selected = document.querySelector('input[name="payment_method"]:checked:not(:disabled)');

            return selected ? selected.value : '';
        }

        function hidePlaceholders(exceptMethodCode) {
            document.querySelectorAll('.fastcheckout-payment-method-ko-container').forEach(function (placeholder) {
                var targetMethod = placeholder.getAttribute('data-fastcheckout-payment-method-ko-target');

                // Keep the active method container visible when re-applying the same selection
                // (avoids open → close → open flicker after shipping changes).
                if (
                    exceptMethodCode &&
                    targetMethod &&
                    compareMethodCodes(targetMethod, exceptMethodCode)
                ) {
                    return;
                }

                placeholder.classList.add('hidden');
                placeholder.style.display = 'none';
            });
        }

        function clearActivePaymentClasses() {
            document.querySelectorAll('.payment-method._active, [data-fastcheckout-active="true"]').forEach(function (element) {
                element.classList.remove('_active');
                element.removeAttribute('data-fastcheckout-active');
            });
        }

        return {
            getMethods: getMethods,
            hasMethod: hasMethod,
            getCheckedMethod: getCheckedMethod,
            hidePlaceholders: hidePlaceholders,
            clearActivePaymentClasses: clearActivePaymentClasses
        };
    };
});
