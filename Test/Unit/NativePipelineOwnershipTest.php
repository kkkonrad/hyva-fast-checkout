<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Test\Unit;

use PHPUnit\Framework\TestCase;

/**
 * Structural ownership checks for the KO/REST pipeline migration.
 * These assert shipped source (not reimplemented logic).
 */
class NativePipelineOwnershipTest extends TestCase
{
    private function moduleRoot(): string
    {
        return dirname(__DIR__, 2);
    }

    public function testModuleXmlDoesNotSequenceMagewire(): void
    {
        $xml = file_get_contents($this->moduleRoot() . '/etc/module.xml');
        $this->assertNotFalse($xml);
        $this->assertStringNotContainsString('Magewirephp_Magewire', $xml);
    }

    public function testComposerDoesNotRequireMagewire(): void
    {
        $json = file_get_contents($this->moduleRoot() . '/composer.json');
        $this->assertNotFalse($json);
        $this->assertStringNotContainsString('magewirephp/magewire', $json);
    }

    public function testLayoutDoesNotInjectMagewireArgument(): void
    {
        $xml = file_get_contents($this->moduleRoot() . '/view/frontend/layout/fastcheckout_index_index.xml');
        $this->assertNotFalse($xml);
        $this->assertStringNotContainsString('name="magewire"', $xml);
        $this->assertStringNotContainsString('Kkkonrad\\Fastcheckout\\Magewire\\Checkout', $xml);
    }

    public function testCheckoutTemplateHasNoAlpineInitCheckoutOrchestrator(): void
    {
        $phtml = file_get_contents($this->moduleRoot() . '/view/frontend/templates/hyva/checkout.phtml');
        $this->assertNotFalse($phtml);
        $this->assertStringNotContainsString('x-data="initCheckout"', $phtml);
        $this->assertStringNotContainsString('initCheckout', $phtml);
        $this->assertStringContainsString('id="fastcheckout-checkout"', $phtml);
        $this->assertStringContainsString('shipping-address.phtml', $phtml);
        $this->assertStringContainsString('shipping-methods.phtml', $phtml);
        $this->assertStringContainsString('payment-methods.phtml', $phtml);
        $this->assertStringContainsString('summary.phtml', $phtml);
    }

    public function testOrderSummaryMountsNativeMagentoSidebarSummary(): void
    {
        $summary = file_get_contents(
            $this->moduleRoot() . '/view/frontend/templates/hyva/checkout/summary.phtml'
        );
        $bridge = file_get_contents(
            $this->moduleRoot() . '/view/frontend/web/js/hyva/checkout-bridge.js'
        );
        $block = file_get_contents($this->moduleRoot() . '/Block/Hyva/Checkout.php');
        $require = file_get_contents(
            $this->moduleRoot() . '/view/frontend/requirejs-config.js'
        );

        $this->assertNotFalse($summary);
        $this->assertNotFalse($bridge);
        $this->assertNotFalse($block);
        $this->assertNotFalse($require);

        $this->assertStringContainsString("scope: 'checkout.sidebar.summary'", $summary);
        $this->assertStringContainsString('data-fastcheckout-native-summary', $summary);
        $this->assertStringContainsString('data-fastcheckout-summary-ssr', $summary);
        $this->assertStringContainsString('function getCheckoutSidebarSummary', $block);
        $this->assertStringContainsString('startNativeSummaryComponents', $bridge);
        $this->assertStringContainsString("'checkout.sidebar.summary'", $bridge);
        $this->assertStringContainsString('Kkkonrad_Fastcheckout/hyva/summary', $bridge);
        $this->assertStringContainsString('summary-total-mixin', $require);
        $this->assertStringContainsString('summary-shipping-mixin', $require);
        $this->assertStringContainsString('summary-cart-items-mixin', $require);
        $this->assertStringContainsString('summary-item-details-mixin', $require);
        $this->assertStringContainsString('summary-item-thumbnail-mixin', $require);
        $this->assertStringContainsString('payment-discount-mixin', $require);
        $this->assertStringContainsString('startNativeDiscountComponent', $bridge);
        $this->assertStringContainsString('startOrderCommentComponent', $bridge);
        $this->assertStringContainsString('getPaymentDiscountComponent', $block);
        $this->assertFileExists(
            $this->moduleRoot() . '/view/frontend/web/template/hyva/payment/discount.html'
        );
        $this->assertFileExists(
            $this->moduleRoot() . '/view/frontend/web/template/hyva/order-comment.html'
        );
        $this->assertFileExists(
            $this->moduleRoot() . '/view/frontend/web/js/view/order-comment.js'
        );
        $this->assertFileExists(
            $this->moduleRoot() . '/view/frontend/web/template/hyva/summary.html'
        );
        $this->assertFileExists(
            $this->moduleRoot() . '/view/frontend/web/template/hyva/summary/cart-items.html'
        );
        $this->assertFileExists(
            $this->moduleRoot() . '/view/frontend/web/template/hyva/summary/item/details.html'
        );
        $this->assertFileExists(
            $this->moduleRoot() . '/view/frontend/web/template/hyva/summary/item/thumbnail.html'
        );
        $this->assertFileExists(
            $this->moduleRoot() . '/view/frontend/web/js/mixin/summary-total-mixin.js'
        );
        $this->assertFileExists(
            $this->moduleRoot() . '/view/frontend/web/js/mixin/summary-shipping-mixin.js'
        );

        // RequireJS baseUrl must resolve Magento_Tax/template/... (not /_view/ or missing /).
        $bridgeTpl = file_get_contents(
            $this->moduleRoot() . '/view/frontend/templates/hyva/knockout/checkout-bridge.phtml'
        );
        $this->assertNotFalse($bridgeTpl);
        $this->assertStringContainsString('function resolveStaticBaseUrl', $bridgeTpl);
        $this->assertStringContainsString('/_view/', $bridgeTpl);
        $this->assertStringContainsString('resolveStaticBaseUrl()', $bridgeTpl);
    }

    public function testStorageMixinDoesNotRouteRestToMagewire(): void
    {
        $js = file_get_contents($this->moduleRoot() . '/view/frontend/web/js/mixin/storage-mixin.js');
        $this->assertNotFalse($js);
        $this->assertStringNotContainsString('wire.call', $js);
        $this->assertStringNotContainsString('handleIntercept', $js);
        $this->assertStringContainsString('injectGuestEmail', $js);
    }

    public function testShippingMethodSyncUsesNativeSetShippingInformation(): void
    {
        $js = file_get_contents($this->moduleRoot() . '/view/frontend/web/js/hyva/shipping-method-sync.js');
        $this->assertNotFalse($js);
        $this->assertStringNotContainsString("wire.call('selectShippingMethod'", $js);
        $this->assertStringContainsString('set-shipping-information', $js);
        $this->assertStringContainsString('pushNativeShippingSelection', $js);
        $this->assertStringContainsString('applyPaymentRemapForShipping', $js);
    }

    public function testPlaceOrderScriptDoesNotCallMagewirePlaceOrder(): void
    {
        $js = file_get_contents($this->moduleRoot() . '/view/frontend/templates/hyva/checkout/script.phtml');
        $bridge = file_get_contents($this->moduleRoot() . '/view/frontend/web/js/hyva/checkout-bridge.js');
        $placeOrderMixin = file_get_contents(
            $this->moduleRoot() . '/view/frontend/web/js/mixin/place-order-mixin.js'
        );
        $this->assertNotFalse($js);
        $this->assertNotFalse($bridge);
        $this->assertNotFalse($placeOrderMixin);
        $this->assertStringNotContainsString("call('placeOrder'", $js);
        $this->assertStringNotContainsString('$wire.call', $js);
        $this->assertStringContainsString('placeOrderViaKo', $js);
        $this->assertStringNotContainsString("Magento_Checkout/js/action/place-order", $js);
        $this->assertStringNotContainsString("Magento_Checkout/js/action/place-order", $bridge);
        $this->assertStringContainsString('component.placeOrder({}, fakeEvent)', $bridge);
        $this->assertStringContainsString('function invokeRendererPlaceOrder', $bridge);
        $this->assertStringContainsString('return invokeRendererPlaceOrder(component, methodCode)', $bridge);
        $this->assertStringContainsString('settleFalsePlaceOrderResult', $bridge);
        $this->assertStringContainsString('prepareForPlaceOrder', $placeOrderMixin);
        $this->assertStringNotContainsString('validateActivePaymentFields', $bridge);
        $this->assertStringNotContainsString('getPurchaseOrderNumber', $bridge);
        $this->assertFileDoesNotExist(
            $this->moduleRoot() . '/view/frontend/web/js/hyva/checkout-agreements-fallback.js'
        );
    }

    public function testPaymentRegistrationModulesLoadRendererListPushers(): void
    {
        $bridge = file_get_contents($this->moduleRoot() . '/view/frontend/web/js/hyva/checkout-bridge.js');
        $paymentList = file_get_contents($this->moduleRoot() . '/view/frontend/web/js/hyva/payment-list.js');
        $this->assertNotFalse($bridge);
        $this->assertNotFalse($paymentList);
        $this->assertStringContainsString('function loadPaymentRegistrationModules()', $bridge);
        $this->assertStringContainsString('loadPaymentRegistrationModules();', $bridge);
        $this->assertStringContainsString(
            "Magento_OfflinePayments/js/view/payment/offline-payments",
            $bridge
        );
        $this->assertStringContainsString(
            "Magento_Payment/js/view/payment/payments",
            $bridge
        );
        $this->assertStringContainsString('config.rendererComponents', $bridge);
        $this->assertStringContainsString('syncRenderers', $paymentList);
        // Stateful gateways (PayU Secure Form) must not be destroyed on temporary remap.
        $this->assertStringContainsString('removeRenderer: function ()', $paymentList);
        $this->assertMatchesRegularExpression(
            '/removeRenderer:\s*function\s*\(\)\s*\{\s*return this;\s*\}/',
            $paymentList
        );
    }

    public function testSolePaymentRemapActivatesPanelWithoutRestoringMultiChoice(): void
    {
        $sync = file_get_contents($this->moduleRoot() . '/view/frontend/web/js/hyva/shipping-method-sync.js');
        $this->assertNotFalse($sync);
        $this->assertStringContainsString('function activatePaymentMethodUi(methodCode)', $sync);
        $this->assertStringContainsString('function clearInvalidPaymentAfterRemap()', $sync);
        $this->assertStringContainsString('soleCode = allowedCodes.length === 1', $sync);
        $this->assertStringContainsString('activatePaymentMethodUi(soleCode)', $sync);
        $this->assertStringContainsString('dropPaymentSelectionCompletely()', $sync);
        // Multi-method path must clear rather than auto-restore a previous choice.
        $this->assertStringContainsString(
            'when multiple payments are allowed again after a clear, do not',
            $sync
        );
    }

    public function testNativePaymentRendererOwnsSelection(): void
    {
        $js = file_get_contents($this->moduleRoot() . '/view/frontend/web/js/hyva/checkout-bridge.js');
        $this->assertNotFalse($js);
        $this->assertStringNotContainsString('component.selectPaymentMethod = function', $js);
        $this->assertStringContainsString('renderer.selectPaymentMethod();', $js);
    }

    public function testShippingViewOwnsShopperSelection(): void
    {
        $js = file_get_contents($this->moduleRoot() . '/view/frontend/web/js/mixin/shipping-view-mixin.js');
        $this->assertNotFalse($js);
        $this->assertStringContainsString('shipping.selectShippingMethod(found);', $js);
        $this->assertStringContainsString('self.selectShippingMethod(found);', $js);
    }

    public function testLegacyMagewireComponentWasRemoved(): void
    {
        $this->assertFileDoesNotExist($this->moduleRoot() . '/Magewire/Checkout.php');
        $this->assertFileDoesNotExist($this->moduleRoot() . '/Magewire/ComponentStub.php');
    }

    public function testHelperGateDoesNotRequireMagewireClass(): void
    {
        $php = file_get_contents($this->moduleRoot() . '/Helper/Data.php');
        $this->assertNotFalse($php);
        $this->assertStringNotContainsString(
            'Magewirephp\\Magewire\\Component',
            $php,
            'canUseHyvaNativeCheckout must not hard-depend on Magewire'
        );
        $this->assertStringContainsString('Hyva\\Theme\\ViewModel\\HyvaCsp', $php);
    }

    public function testRateProcessorBridgeUsesNativeOriginalGetRates(): void
    {
        $js = file_get_contents(
            $this->moduleRoot() . '/view/frontend/web/js/mixin/shipping-rate-processor-bridge.js'
        );
        $this->assertNotFalse($js);
        $this->assertStringContainsString('return originalGetRates(address)', $js);
        $this->assertStringNotContainsString('onEstimateShippingRatesAction(address)', $js);
    }

    public function testResolveShippingRatesEstimatePostsToNativeEstimateEndpoint(): void
    {
        $js = file_get_contents(
            $this->moduleRoot() . '/view/frontend/web/js/hyva/checkout-bridge.js'
        );
        $this->assertNotFalse($js);
        $this->assertStringContainsString('getUrlForEstimationShippingMethodsForNewAddress', $js);
        $this->assertStringContainsString('storage.post(serviceUrl, payload', $js);
        // Dead Magewire save path must not be the estimate writer.
        $this->assertStringNotContainsString(
            "wire.call('saveShippingAddress', true, true, true)",
            $js
        );
    }

    public function testPlaceOrderKeepsSavedShippingAddressMagentoOwned(): void
    {
        $js = file_get_contents(
            $this->moduleRoot() . '/view/frontend/web/js/hyva/checkout-bridge.js'
        );
        $this->assertNotFalse($js);

        $start = strpos($js, 'function ensureQuoteShippingAddressForPlaceOrder()');
        $end = strpos($js, 'function ensureQuoteShippingMethodForPlaceOrder()', $start);
        $this->assertNotFalse($start);
        $this->assertNotFalse($end);

        $function = substr($js, $start, $end - $start);
        $guard = strpos($function, "currentType !== 'new-customer-address'");
        $formMerge = strpos($function, 'formData = collectShippingAddressDataForPlaceOrder()');

        $this->assertNotFalse($guard);
        $this->assertNotFalse($formMerge);
        $this->assertLessThan($formMerge, $guard);
        $this->assertStringContainsString(
            'checkoutData.setSelectedShippingAddress(currentKey);',
            $function
        );
    }

    public function testPaymentUiStartsAfterShippingAddressFieldsAreReady(): void
    {
        $js = file_get_contents(
            $this->moduleRoot() . '/view/frontend/web/js/hyva/checkout-bridge.js'
        );
        $this->assertNotFalse($js);
        $this->assertStringContainsString('function scheduleDeferredPaymentComponents()', $js);
        $this->assertStringContainsString(
            "window.addEventListener(\n" .
            "                        'fastcheckout:address-fields-ready',\n" .
            '                        queueAfterShippingPaint,',
            $js
        );
        $this->assertStringContainsString(
            'window.fastcheckoutDeferredPaymentComponentsStarted = true;',
            $js
        );
    }

    public function testShippingBootstrapLoadsBeforeTheFullCheckoutBridge(): void
    {
        $template = file_get_contents(
            $this->moduleRoot() . '/view/frontend/templates/hyva/knockout/checkout-bridge.phtml'
        );
        $bootstrap = file_get_contents(
            $this->moduleRoot() . '/view/frontend/web/js/hyva/shipping-address-bootstrap.js'
        );
        $this->assertNotFalse($template);
        $this->assertNotFalse($bootstrap);

        $this->assertStringContainsString(
            "['Kkkonrad_Fastcheckout/js/hyva/shipping-address-bootstrap']",
            $template
        );
        $this->assertStringContainsString(
            "['Kkkonrad_Fastcheckout/js/hyva/checkout-renderers']",
            $template
        );
        $this->assertStringContainsString('initShippingAddress(config);', $template);
        $this->assertStringContainsString(
            "'fastcheckout:address-fields-ready',\n" .
            '                    startFullBridge,',
            $template
        );
        $this->assertStringContainsString(
            'window.fastcheckoutShippingComponentsStarted = true;',
            $bootstrap
        );
    }

    public function testCheckoutConfigIsSerializedOnlyOnce(): void
    {
        $template = file_get_contents(
            $this->moduleRoot() . '/view/frontend/templates/hyva/knockout/checkout-bridge.phtml'
        );
        $this->assertNotFalse($template);
        $this->assertStringNotContainsString("'checkoutConfig' => \$checkoutConfig", $template);
        $this->assertStringContainsString(
            'config.checkoutConfig = window.checkoutConfig;',
            $template
        );
    }

    public function testSharedBillingAddressHasVisibleAfterMethodsDestination(): void
    {
        $paymentTemplate = file_get_contents(
            $this->moduleRoot() . '/view/frontend/templates/hyva/checkout/payment-methods.phtml'
        );
        $bridgeTemplate = file_get_contents(
            $this->moduleRoot() . '/view/frontend/templates/hyva/knockout/checkout-bridge.phtml'
        );
        $bridge = file_get_contents(
            $this->moduleRoot() . '/view/frontend/web/js/hyva/checkout-bridge.js'
        );

        $this->assertNotFalse($paymentTemplate);
        $this->assertNotFalse($bridgeTemplate);
        $this->assertNotFalse($bridge);
        $this->assertStringContainsString(
            'data-fastcheckout-shared-billing-target',
            $paymentTemplate
        );
        $this->assertStringContainsString(
            'data-fastcheckout-ko-after-methods-region',
            $bridgeTemplate
        );
        $this->assertStringContainsString(
            'function mountSharedAfterMethodsRegion()',
            $bridge
        );
        $this->assertStringContainsString('target.appendChild(billingAddress);', $bridge);
        $this->assertStringNotContainsString('target.appendChild(region);', $bridge);
        $this->assertStringContainsString(
            "component.dataScopePrefix === 'billingAddressshared'",
            $bridge
        );
    }

    public function testCheckoutReusesConfiguredPaymentMethodsForInitialRender(): void
    {
        $template = file_get_contents(
            $this->moduleRoot() . '/view/frontend/templates/hyva/checkout.phtml'
        );
        $this->assertNotFalse($template);
        $this->assertStringContainsString(
            'getAvailablePaymentMethods()',
            $template
        );
        $this->assertStringNotContainsString('getShippingMethods()', $template);

        // The configured list comes from the (memoized) checkout config, so the initial
        // render never repeats the payment-method quote API call.
        $block = file_get_contents($this->moduleRoot() . '/Block/Hyva/Checkout.php');
        $this->assertNotFalse($block);
        $this->assertStringContainsString(
            "\$this->getCheckoutConfig()['paymentMethods']",
            $block
        );
    }

    public function testStartupLoaderCoversOnlyTheNativeKoFormBootstrap(): void
    {
        $template = file_get_contents(
            $this->moduleRoot() . '/view/frontend/templates/hyva/checkout/shipping-address.phtml'
        );
        $bootstrap = file_get_contents(
            $this->moduleRoot() . '/view/frontend/web/js/hyva/shipping-address-bootstrap.js'
        );
        $this->assertNotFalse($template);
        $this->assertNotFalse($bootstrap);
        $this->assertStringContainsString('data-fastcheckout-startup-loader', $template);
        $this->assertStringContainsString(
            'class="fastcheckout-native-shipping-address"',
            $template
        );
        $this->assertStringNotContainsString('data-fastcheckout-ssr-shipping', $template);
        $this->assertStringNotContainsString('data-fastcheckout-ssr-target', $template);
        $this->assertStringContainsString('function hideStartupLoader()', $bootstrap);
        $this->assertStringContainsString('hideStartupLoader();', $bootstrap);
    }
}
