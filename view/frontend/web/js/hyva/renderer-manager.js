define([
    'jquery'
], function ($) {
    'use strict';

    return function (config) {
        var rendererComponents = config.rendererComponents || [],
            rendererComponentMap = config.rendererComponentMap || [],
            rendererComponentsByMethod = {},
            loadedRendererComponents = {},
            loadingRendererComponents = {},
            patchRenderersHandler = null,
            syncPaymentRenderersHandler = null;

        rendererComponentMap.forEach(function (entry) {
            if (entry && entry.method && entry.component) {
                rendererComponentsByMethod[entry.method] = entry.component;
            }
        });

        window.fastcheckoutKoPaymentRendererComponentMap = rendererComponentMap.slice(0);
        window.fastcheckoutKoLoadedPaymentRendererComponents = window.fastcheckoutKoLoadedPaymentRendererComponents || [];

        function rememberLoadedRendererComponent(component) {
            if (!component) {
                return;
            }

            loadedRendererComponents[component] = true;
            if (window.fastcheckoutKoLoadedPaymentRendererComponents.indexOf(component) === -1) {
                window.fastcheckoutKoLoadedPaymentRendererComponents.push(component);
            }
        }

        function getRendererComponentForMethod(methodCode) {
            if (!methodCode) {
                return '';
            }

            return rendererComponentsByMethod[String(methodCode)] || '';
        }

        function runPatchRenderers() {
            if (typeof patchRenderersHandler === 'function') {
                patchRenderersHandler();
            }
        }

        function runSyncPaymentRenderers() {
            if (typeof syncPaymentRenderersHandler === 'function') {
                syncPaymentRenderersHandler();
            }
        }

        return {
            getRendererMap: function () {
                return rendererComponentMap.slice(0);
            },

            getRendererComponentForMethod: getRendererComponentForMethod,

            isLoaded: function (component) {
                return !!loadedRendererComponents[component];
            },

            loadRendererForMethod: function (methodCode) {
                var component = getRendererComponentForMethod(methodCode),
                    deferred;

                if (!component) {
                    return $.Deferred().resolve(false).promise();
                }

                if (loadedRendererComponents[component]) {
                    return $.Deferred().resolve(true).promise();
                }

                if (loadingRendererComponents[component]) {
                    return loadingRendererComponents[component];
                }

                deferred = $.Deferred();
                loadingRendererComponents[component] = deferred.promise();

                window.require([component], function () {
                    rememberLoadedRendererComponent(component);
                    delete loadingRendererComponents[component];
                    runPatchRenderers();
                    runSyncPaymentRenderers();
                    deferred.resolve(true);
                }, function (error) {
                    delete loadingRendererComponents[component];
                    if (window.console && typeof window.console.warn === 'function') {
                        window.console.warn('Kkkonrad Fastcheckout: payment renderer could not be loaded', component, error);
                    }
                    deferred.resolve(false);
                });

                return deferred.promise();
            },

            ensureRendererForMethod: function (methodCode) {
                return this.loadRendererForMethod(methodCode).then(function () {
                    return true;
                });
            },

            runPatchRenderers: runPatchRenderers,

            runSyncPaymentRenderers: runSyncPaymentRenderers,

            loadRendererComponents: function (done) {
                rendererComponents.forEach(function (component) {
                    if (!rendererComponentMap.length && component) {
                        rememberLoadedRendererComponent(component);
                    }
                });
                done();
            },

            setPatchRenderersHandler: function (handler) {
                patchRenderersHandler = handler;
            },

            setSyncPaymentRenderersHandler: function (handler) {
                syncPaymentRenderersHandler = handler;
            }
        };
    };
});
