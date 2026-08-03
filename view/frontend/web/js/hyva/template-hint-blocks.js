/**
 * Przelewy24 instalment simulator on Fastcheckout summary.
 *
 * Magento summary renders #przelewy24-instalment-trigger (and related
 * calculator / mini-widget nodes). Wrap each in a spacing div with bottom
 * margin. KO re-renders can undo wraps — re-scan via MutationObserver + short
 * retry window. CSS also spaces the raw selectors as a fallback.
 */
define([], function () {
    'use strict';

    var observer = null,
        scheduled = false,
        retriesLeft = 0,
        retryTimer = null,
        WRAP_CLASS = 'fc-przelewy24-instalment-block';

    function isAlreadyWrapped(el) {
        return !!(el && el.parentElement && el.parentElement.classList.contains(WRAP_CLASS));
    }

    function shouldSkip(el) {
        if (!el || !el.id) {
            return false;
        }
        // Modal portal targets — wrapping breaks fixed overlays.
        return el.id === 'przelewy24-instalment-calculator-modal' ||
            el.id === 'installment-calculator-modal' ||
            String(el.id).indexOf('installment-calculator-modal') === 0;
    }

    function wrapOne(el) {
        var wrap;

        if (!el || !el.parentNode || shouldSkip(el)) {
            return;
        }
        if (isAlreadyWrapped(el)) {
            return;
        }

        wrap = document.createElement('div');
        wrap.className = WRAP_CLASS;
        el.parentNode.insertBefore(wrap, el);
        wrap.appendChild(el);
    }

    function findCandidates(scope) {
        var list = [],
            seen = typeof WeakSet === 'function' ? new WeakSet() : null;

        function add(el) {
            if (!el || shouldSkip(el) || (seen && seen.has(el))) {
                return;
            }
            if (seen) {
                seen.add(el);
            }
            list.push(el);
        }

        if (!scope || typeof scope.querySelectorAll !== 'function') {
            return list;
        }

        Array.prototype.slice.call(
            scope.querySelectorAll(
                '#przelewy24-instalment-trigger, ' +
                '#installment-mini-totals, ' +
                '[id^="przelewy24-instalment-"], ' +
                '.przelewy24-instalment-trigger, ' +
                '[data-przelewy24-instalment]'
            )
        ).forEach(add);

        return list;
    }

    function wrapAll(root) {
        var scope = root && root.querySelectorAll
            ? root
            : document.getElementById('fastcheckout-checkout') || document;

        findCandidates(scope).forEach(wrapOne);
    }

    function scheduleWrap(root) {
        if (scheduled) {
            return;
        }
        scheduled = true;
        window.setTimeout(function () {
            scheduled = false;
            wrapAll(root);
        }, 0);
    }

    function startRetries() {
        retriesLeft = 20; // ~10s at 500ms
        if (retryTimer) {
            return;
        }
        retryTimer = window.setInterval(function () {
            wrapAll(document);
            retriesLeft -= 1;
            if (retriesLeft <= 0) {
                window.clearInterval(retryTimer);
                retryTimer = null;
            }
        }, 500);
    }

    function start() {
        wrapAll(document);
        startRetries();

        if (observer || typeof window.MutationObserver !== 'function') {
            return;
        }

        observer = new MutationObserver(function () {
            scheduleWrap(document);
        });

        observer.observe(document.documentElement || document.body, {
            childList: true,
            subtree: true
        });
    }

    return {
        start: start,
        wrapAll: wrapAll
    };
});
