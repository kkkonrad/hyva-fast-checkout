<?php
declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Test\Unit\Frontend;

use PHPUnit\Framework\TestCase;

/**
 * Point 5: OPC jsLayout/assets still collected and KO bridge still hosted.
 */
class OpcAssetsSurfacingTest extends TestCase
{
    public function testCheckoutLayoutCollectorMergesOpcHandle(): void
    {
        $path = dirname(__DIR__, 3) . '/Model/CheckoutLayoutCollector.php';
        $this->assertFileExists($path);
        $src = file_get_contents($path);
        $this->assertStringContainsString('collectViaMagentoLayout', $src);
        $this->assertStringContainsString('checkout_index_index', $src);
        $this->assertStringContainsString('checkout.root', $src);
        $this->assertStringContainsString('collectViaModuleFiles', $src);
    }

    public function testFastcheckoutLayoutHostsKoBridgeWithoutLiveOpcUpdate(): void
    {
        $path = dirname(__DIR__, 3) . '/view/frontend/layout/fastcheckout_index_index.xml';
        $xml = file_get_contents($path);
        $this->assertDoesNotMatchRegularExpression(
            '/^\s*<update\s+handle="checkout_index_index"\s*\/>/m',
            $xml
        );
        $this->assertStringContainsString('ko_checkout_bridge', $xml);
        $this->assertStringContainsString('checkout-renderers.phtml', $xml);
    }

    public function testBridgeStillBootstrapsPaymentAndShippingExtensionRegions(): void
    {
        $bridge = dirname(__DIR__, 3) . '/view/frontend/templates/hyva/knockout/checkout-bridge.phtml';
        $src = file_get_contents($bridge);
        $this->assertStringContainsString('rendererComponents', $src);
        $this->assertStringContainsString('shippingListChildren', $src);
        // shipping list template holds shippingAdditional region
        $list = dirname(__DIR__, 3) . '/view/frontend/web/template/hyva/shipping-list.html';
        $listSrc = file_get_contents($list);
        $this->assertStringContainsString("getRegion('shippingAdditional')", $listSrc);
        $this->assertStringContainsString("getRegion('before-shipping-method-form')", $listSrc);
    }
}
