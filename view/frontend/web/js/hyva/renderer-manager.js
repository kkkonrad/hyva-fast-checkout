define([
    'jquery'
], function ($) {
    'use strict';

    return function (config) {
        var rendererComponentMap = config.rendererComponentMap || [],
            rendererComponentsByMethod = {},
            loadedRendererComponents = {},
            loadingRendererComponents = {},
            layoutScripts = config.layoutScripts || [],
            externalScripts = config.layoutExternalScripts || [],
            loadedLayoutScripts = {},
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

        function loadRendererComponent(component) {
            var deferred,
                namespace,
                componentLayoutScripts,
                prerequisite;

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

            namespace = String(component).split('/')[0];
            componentLayoutScripts = layoutScripts.filter(function (scriptModule) {
                return String(scriptModule).split('/')[0] === namespace && !loadedLayoutScripts[scriptModule];
            });
            prerequisite = loadRendererPrerequisites(component, componentLayoutScripts);

            prerequisite.always(function () {
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
            });

            return deferred.promise();
        }

        function loadRendererPrerequisites(component, componentLayoutScripts) {
            var deferred = $.Deferred(),
                isThirdParty = !/^(Magento_|Kkkonrad_)/.test(String(component)),
                pending = isThirdParty ? externalScripts.length : 0;

            function finishExternalScript() {
                pending -= 1;
                if (pending <= 0) {
                    loadComponentLayoutScripts();
                }
            }

            function loadComponentLayoutScripts() {
                if (!componentLayoutScripts.length) {
                    deferred.resolve();
                    return;
                }

                window.require(componentLayoutScripts, function () {
                    componentLayoutScripts.forEach(function (moduleName) {
                        loadedLayoutScripts[moduleName] = true;
                    });
                    deferred.resolve();
                }, function () {
                    deferred.resolve();
                });
            }

            if (!pending) {
                loadComponentLayoutScripts();
                return deferred.promise();
            }

            externalScripts.forEach(function (src) {
                var existing = document.querySelector('script[src="' + src.replace(/"/g, '\\"') + '"]'),
                    script;

                if (existing) {
                    finishExternalScript();
                    return;
                }

                script = document.createElement('script');
                script.src = src;
                script.async = true;
                script.onload = finishExternalScript;
                script.onerror = finishExternalScript;
                document.head.appendChild(script);
            });

            return deferred.promise();
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
                return loadRendererComponent(getRendererComponentForMethod(methodCode));
            },

            ensureRendererForMethod: function (methodCode) {
                return this.loadRendererForMethod(methodCode).then(function () {
                    return true;
                });
            },

            runPatchRenderers: runPatchRenderers,

            runSyncPaymentRenderers: runSyncPaymentRenderers,

            setPatchRenderersHandler: function (handler) {
                patchRenderersHandler = handler;
            },

            setSyncPaymentRenderersHandler: function (handler) {
                syncPaymentRenderersHandler = handler;
            }
        };
    };
});
