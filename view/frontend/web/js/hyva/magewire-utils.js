define([
    'jquery'
], function ($) {
    'use strict';

    function getProperty(wire, name) {
        if (!wire) {
            return '';
        }
        if (typeof wire.get === 'function') {
            return wire.get(name);
        }
        if (typeof wire[name] !== 'undefined') {
            return wire[name];
        }
        if (wire.data && typeof wire.data[name] !== 'undefined') {
            return wire.data[name];
        }

        return '';
    }

    function getComponent() {
        var magewireEl = document.querySelector('[wire\\:id]'),
            livewire = window.Livewire || window.Magewire;

        if (magewireEl && magewireEl.__livewire) {
            return magewireEl.__livewire;
        }

        if (
            magewireEl &&
            livewire &&
            typeof livewire.find === 'function' &&
            magewireEl.getAttribute('wire:id')
        ) {
            return livewire.find(magewireEl.getAttribute('wire:id'));
        }

        return null;
    }

    function isEmptyObjectLike(value) {
        if (!value || typeof value !== 'object') {
            return false;
        }

        return Object.keys(value).length === 0;
    }

    function setValue(wire, field, value, deferUpdate) {
        var currentValue;

        if (!wire || typeof wire.set !== 'function' || typeof value === 'undefined' || value === null) {
            return null;
        }

        currentValue = getProperty(wire, field);
        if (isEmptyObjectLike(currentValue) && isEmptyObjectLike(value)) {
            return null;
        }
        if (
            (typeof currentValue === 'object' || typeof value === 'object') &&
            JSON.stringify(currentValue || {}) === JSON.stringify(value || {})
        ) {
            return null;
        }
        if (
            typeof currentValue !== 'object' &&
            typeof value !== 'object' &&
            String(currentValue || '') === String(value || '')
        ) {
            return null;
        }

        return wire.set(field, value, deferUpdate === true);
    }

    function resolveAsKoDeferred(promise, messageContainer, handleError, handleSuccess) {
        var deferred = $.Deferred();

        Promise.resolve(promise)
            .then(function (result) {
                if (typeof handleSuccess === 'function') {
                    handleSuccess(result, messageContainer);
                }
                deferred.resolve(result);
            })
            .catch(function (error) {
                if (typeof handleError === 'function') {
                    handleError(error, messageContainer);
                }
                deferred.reject(error);
            });

        return deferred.promise();
    }

    return {
        getProperty: getProperty,
        getComponent: getComponent,
        setValue: setValue,
        resolveAsKoDeferred: resolveAsKoDeferred
    };
});
