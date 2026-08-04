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

        /**
         * Ensure a radio option row exists for Magento method-list entries that
         * were not present in the PHP SSR grid (conditional methods after
         * set-shipping-information).
         *
         * @param {Array<{method: string, title?: string}>} methods
         * @returns {Number} number of rows created
         */
        function ensureMethodOptions(methods) {
            var grid = document.querySelector('[data-fastcheckout-payment-methods-grid]'),
                card = document.querySelector('[data-fastcheckout-payment-methods-card]'),
                created = 0,
                list = Array.isArray(methods) ? methods : [];

            if (!list.length) {
                return 0;
            }

            if (!grid && card) {
                grid = document.createElement('div');
                grid.className = 'grid gap-3 relative min-h-[50px]';
                grid.setAttribute('data-fastcheckout-payment-methods-grid', '');
                card.appendChild(grid);
            }

            if (!grid) {
                return 0;
            }

            list.forEach(function (method) {
                var code = method && (method.method || method.code)
                        ? String(method.method || method.code)
                        : '',
                    title = method && method.title ? String(method.title) : code,
                    existing,
                    option,
                    label,
                    input,
                    titleSpan,
                    koTarget;

                if (!code) {
                    return;
                }

                existing = document.querySelector(
                    '[data-fastcheckout-payment-option="' + code.replace(/"/g, '') + '"]'
                );
                if (existing) {
                    // Refresh title if Magento sent a better label.
                    titleSpan = existing.querySelector('label span');
                    if (titleSpan && title && !titleSpan.textContent.trim()) {
                        titleSpan.textContent = title;
                    }

                    return;
                }

                option = document.createElement('div');
                option.className =
                    'border rounded transition-all duration-200 border-gray-200 hover:border-gray-300';
                option.setAttribute('data-fastcheckout-payment-option', code);
                option.setAttribute('data-fastcheckout-payment-allowed', '1');
                option.setAttribute('data-fastcheckout-payment-dynamic', '1');

                label = document.createElement('label');
                label.className = 'flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-50/50 mb-0';

                input = document.createElement('input');
                input.type = 'radio';
                input.className = 'form-radio';
                input.name = 'payment_method';
                input.value = code;
                input.setAttribute('data-fastcheckout-payment-option-input', code);
                input.required = true;

                titleSpan = document.createElement('span');
                titleSpan.className = 'font-medium text-sm text-gray-800';
                titleSpan.textContent = title || code;

                label.appendChild(input);
                label.appendChild(titleSpan);

                koTarget = document.createElement('div');
                koTarget.className =
                    'fastcheckout-payment-method-ko-container border-t border-gray-100 hidden';
                koTarget.style.display = 'none';
                koTarget.setAttribute('data-fastcheckout-payment-method-ko-target', code);

                option.appendChild(label);
                option.appendChild(koTarget);
                grid.appendChild(option);
                created += 1;
            });

            if (created > 0) {
                grid.classList.remove('hidden');
                grid.style.display = '';
            }

            return created;
        }

        /**
         * Magento method-list → DOM radios. Creates missing options; does not
         * remove existing SSR rows (mapping may temporarily hide them).
         *
         * @param {Array} methods
         * @returns {Number}
         */
        function syncFromService(methods) {
            return ensureMethodOptions(methods);
        }

        return {
            getMethods: getMethods,
            hasMethod: hasMethod,
            getCheckedMethod: getCheckedMethod,
            hidePlaceholders: hidePlaceholders,
            clearActivePaymentClasses: clearActivePaymentClasses,
            ensureMethodOptions: ensureMethodOptions,
            syncFromService: syncFromService
        };
    };
});
