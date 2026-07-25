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
        $this->assertNotFalse($js);
        $this->assertStringNotContainsString("call('placeOrder'", $js);
        $this->assertStringNotContainsString('$wire.call', $js);
        $this->assertStringContainsString('placeOrderViaKo', $js);
        $this->assertStringContainsString("Magento_Checkout/js/action/place-order", $js);
    }

    public function testMagewireCheckoutNoLongerExtendsMagewireComponent(): void
    {
        $php = file_get_contents($this->moduleRoot() . '/Magewire/Checkout.php');
        $this->assertNotFalse($php);
        $this->assertStringNotContainsString('Magewirephp\\Magewire\\Component', $php);
        $this->assertStringContainsString('extends ComponentStub', $php);
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
}
