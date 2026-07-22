define([], function () {
    'use strict';

    return function (deps) {
        deps = deps || {};

        var ko = deps.ko,
            stepNavigator = deps.stepNavigator,
            nativeShippingComponent = deps.nativeShippingComponent === true;

        function findStep(code) {
            var steps = stepNavigator && typeof stepNavigator.steps === 'function'
                ? stepNavigator.steps()
                : [];

            return steps.filter(function (step) {
                return step && step.code === code;
            })[0] || null;
        }

        function addValidCode(code) {
            if (!stepNavigator || !Array.isArray(stepNavigator.validCodes)) {
                return;
            }

            if (stepNavigator.validCodes.indexOf(code) === -1) {
                stepNavigator.validCodes.push(code);
            }
        }

        function addStepCode(code) {
            if (!stepNavigator || !Array.isArray(stepNavigator.stepCodes)) {
                return;
            }

            if (stepNavigator.stepCodes.indexOf(code) === -1) {
                stepNavigator.stepCodes.push(code);
            }
        }

        function createVisibleObservable(isVisible) {
            if (ko && typeof ko.observable === 'function') {
                return ko.observable(isVisible);
            }

            var value = !!isVisible;

            return function (nextValue) {
                if (arguments.length) {
                    value = !!nextValue;
                }

                return value;
            };
        }

        function ensureStep(code, title, sortOrder, isVisible) {
            var step = findStep(code);

            if (!step) {
                step = {
                    code: code,
                    alias: code,
                    title: title,
                    isVisible: createVisibleObservable(isVisible),
                    navigate: function () {
                        this.isVisible(true);
                    },
                    sortOrder: sortOrder
                };

                if (stepNavigator && typeof stepNavigator.steps === 'function' && typeof stepNavigator.steps.push === 'function') {
                    stepNavigator.steps.push(step);
                }
            } else if (typeof step.isVisible !== 'function') {
                step.isVisible = createVisibleObservable(isVisible);
            }

            addValidCode(code);
            addStepCode(code);

            return step;
        }

        function init() {
            if (!stepNavigator || !ko) {
                return;
            }

            if (!nativeShippingComponent) {
                ensureStep('shipping', 'Shipping', 10, true);
            }
            ensureStep('payment', 'Review & Payments', 20, false);
        }

        return {
            init: init,
            ensureStep: ensureStep
        };
    };
});
