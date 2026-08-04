/**
 * Stable per-method hosts for Magento KO payment renderers.
 *
 * Contract:
 *  - adoptRendererOnce() may reparent a .payment-method into its permanent host
 *    at most once (before SDK init).
 *  - activateMethodInHost() only toggles visibility / _active; never appendChild
 *    after the node is marked data-fastcheckout-host-mounted="1".
 */
define([], function () {
    'use strict';

    var HOST_ATTR = 'data-fastcheckout-payment-method-ko-target',
        MOUNTED_ATTR = 'data-fastcheckout-host-mounted',
        METHOD_MOUNTED_ATTR = 'data-fastcheckout-method-mounted';

    /**
     * @param {Function|null} compareMethodCodes
     * @returns {Object}
     */
    return function (deps) {
        deps = deps || {};

        var compareMethodCodes = typeof deps.compareMethodCodes === 'function'
            ? deps.compareMethodCodes
            : function (a, b) {
                return String(a || '') === String(b || '');
            };

        /**
         * @param {String} methodCode
         * @returns {Element|null}
         */
        function getMethodHost(methodCode) {
            var code = methodCode ? String(methodCode) : '';

            if (!code || typeof document === 'undefined') {
                return null;
            }

            return document.querySelector(
                '[' + HOST_ATTR + '="' + code.replace(/"/g, '') + '"]'
            );
        }

        /**
         * @param {Element} element
         * @param {String} methodCode
         * @param {String} [activeCode]
         * @returns {Boolean}
         */
        function elementMatchesMethod(element, methodCode, activeCode) {
            var inputs,
                matches = false,
                code = methodCode || '',
                alt = activeCode || methodCode || '';

            if (!element) {
                return false;
            }

            if (
                compareMethodCodes(element.id, code) ||
                compareMethodCodes(element.id, alt)
            ) {
                return true;
            }

            if (element.getAttribute && element.getAttribute(METHOD_MOUNTED_ATTR)) {
                if (
                    compareMethodCodes(element.getAttribute(METHOD_MOUNTED_ATTR), code) ||
                    compareMethodCodes(element.getAttribute(METHOD_MOUNTED_ATTR), alt)
                ) {
                    return true;
                }
            }

            inputs = element.querySelectorAll
                ? element.querySelectorAll('input')
                : [];
            Array.prototype.forEach.call(inputs, function (input) {
                if (matches) {
                    return;
                }
                matches = compareMethodCodes(input.id, code) ||
                    compareMethodCodes(input.id, alt) ||
                    compareMethodCodes(input.value, code) ||
                    compareMethodCodes(input.value, alt) ||
                    compareMethodCodes(input.getAttribute && input.getAttribute('value'), code) ||
                    compareMethodCodes(input.getAttribute && input.getAttribute('value'), alt);
            });

            return matches;
        }

        /**
         * @param {Element} element
         * @returns {Boolean}
         */
        function isPermanentlyMounted(element) {
            return !!(
                element &&
                element.getAttribute &&
                element.getAttribute(MOUNTED_ATTR) === '1'
            );
        }

        /**
         * One-time adopt into the permanent Fastcheckout host.
         * Returns true if the element ends under the host (moved or already there).
         * Never moves a node that is already permanently mounted elsewhere.
         *
         * @param {Element} element
         * @param {String} methodCode
         * @returns {{adopted: Boolean, moved: Boolean, host: Element|null}}
         */
        function adoptRendererOnce(element, methodCode) {
            var host = getMethodHost(methodCode),
                moved = false;

            if (!element || !host) {
                return { adopted: false, moved: false, host: host };
            }

            if (isPermanentlyMounted(element)) {
                // Already claimed — do not reparent even if host differs.
                return {
                    adopted: element.parentNode === host,
                    moved: false,
                    host: host
                };
            }

            if (element.parentNode !== host) {
                host.appendChild(element);
                moved = true;
            }

            element.setAttribute(MOUNTED_ATTR, '1');
            element.setAttribute(METHOD_MOUNTED_ATTR, String(methodCode || ''));

            return { adopted: true, moved: moved, host: host };
        }

        /**
         * Find a .payment-method for the code (prefer one already in host).
         *
         * @param {String} methodCode
         * @param {String} [activeCode]
         * @returns {Element|null}
         */
        function findPaymentMethodElement(methodCode, activeCode) {
            var host = getMethodHost(methodCode),
                inHost,
                all,
                found = null;

            if (host) {
                inHost = host.querySelector('.payment-method');
                if (inHost && elementMatchesMethod(inHost, methodCode, activeCode)) {
                    return inHost;
                }
                // Light offline content without .payment-method wrapper
                if (host.children && host.children.length && !inHost) {
                    return null;
                }
            }

            all = document.querySelectorAll
                ? document.querySelectorAll('.payment-method')
                : [];
            Array.prototype.forEach.call(all, function (element) {
                if (!found && elementMatchesMethod(element, methodCode, activeCode)) {
                    found = element;
                }
            });

            return found;
        }

        /**
         * Activate method UI without late reparent of an already-mounted renderer.
         *
         * @param {String} methodCode
         * @param {Object} options
         * @param {String} [options.activeCode]
         * @param {Function} [options.hasVisibleContent]
         * @param {Function} [options.annotate]
         * @param {Function} [options.onRadios]
         * @returns {{opened: Boolean, moved: Boolean, parentUnchanged: Boolean, element: Element|null}}
         */
        function activateMethodInHost(methodCode, options) {
            var opts = options || {},
                activeCode = opts.activeCode || methodCode,
                host = getMethodHost(methodCode),
                element = findPaymentMethodElement(methodCode, activeCode),
                parentBefore = element ? element.parentNode : null,
                adoptResult,
                moved = false,
                opened = false,
                hasVisibleContent = typeof opts.hasVisibleContent === 'function'
                    ? opts.hasVisibleContent
                    : function () {
                        return true;
                    };

            if (!methodCode) {
                return {
                    opened: false,
                    moved: false,
                    parentUnchanged: true,
                    element: null
                };
            }

            if (!element) {
                // Host may still have non-.payment-method content (notes).
                if (host && host.children && host.children.length && hasVisibleContent(host)) {
                    host.classList.remove('hidden');
                    host.style.display = 'block';
                    if (typeof opts.onRadios === 'function') {
                        opts.onRadios(methodCode, activeCode);
                    }
                    return {
                        opened: true,
                        moved: false,
                        parentUnchanged: true,
                        element: null
                    };
                }

                return {
                    opened: false,
                    moved: false,
                    parentUnchanged: true,
                    element: null
                };
            }

            if (!hasVisibleContent(element) && !(host && host.contains && host.contains(element))) {
                return {
                    opened: false,
                    moved: false,
                    parentUnchanged: true,
                    element: element
                };
            }

            // One-time permanent adopt only when not yet mounted.
            if (!isPermanentlyMounted(element) && host) {
                adoptResult = adoptRendererOnce(element, methodCode);
                moved = !!adoptResult.moved;
            } else if (
                isPermanentlyMounted(element) &&
                host &&
                element.parentNode !== host
            ) {
                // Already permanently mounted under another parent — never steal.
                moved = false;
            }

            element.classList.add('_active');
            element.setAttribute('data-fastcheckout-active', 'true');
            if (typeof opts.annotate === 'function') {
                opts.annotate(element);
            }

            if (typeof opts.onRadios === 'function') {
                opts.onRadios(methodCode, activeCode);
            }

            if (host) {
                host.classList.remove('hidden');
                host.style.display = 'block';
                opened = true;
            } else {
                opened = true;
            }

            // Deactivate siblings without moving them.
            Array.prototype.forEach.call(
                document.querySelectorAll
                    ? document.querySelectorAll('.payment-method')
                    : [],
                function (node) {
                    if (!elementMatchesMethod(node, methodCode, activeCode)) {
                        node.classList.remove('_active');
                        node.removeAttribute('data-fastcheckout-active');
                    }
                }
            );

            // Hide other method hosts (visibility only).
            Array.prototype.forEach.call(
                document.querySelectorAll
                    ? document.querySelectorAll('[' + HOST_ATTR + ']')
                    : [],
                function (slot) {
                    var slotMethod = slot.getAttribute(HOST_ATTR);

                    if (
                        compareMethodCodes(slotMethod, methodCode) ||
                        compareMethodCodes(slotMethod, activeCode)
                    ) {
                        return;
                    }
                    if (slot.getAttribute('data-fastcheckout-soft-removed') === '1') {
                        return;
                    }
                    slot.classList.add('hidden');
                    slot.style.display = 'none';
                }
            );

            return {
                opened: opened,
                moved: moved,
                parentUnchanged: !element || element.parentNode === parentBefore ||
                    (isPermanentlyMounted(element) && !moved),
                element: element
            };
        }

        return {
            HOST_ATTR: HOST_ATTR,
            MOUNTED_ATTR: MOUNTED_ATTR,
            getMethodHost: getMethodHost,
            isPermanentlyMounted: isPermanentlyMounted,
            adoptRendererOnce: adoptRendererOnce,
            findPaymentMethodElement: findPaymentMethodElement,
            elementMatchesMethod: elementMatchesMethod,
            activateMethodInHost: activateMethodInHost
        };
    };
});
