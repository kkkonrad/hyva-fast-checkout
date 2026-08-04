<?php
declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Test\Unit\Layout;

use PHPUnit\Framework\TestCase;

/**
 * PR #4: Fastcheckout hosts KO bridge; OPC jsLayout/assets come from
 * CheckoutLayoutCollector (isolated Magento merge of checkout_index_index),
 * not a live <update handle> that would pull Hyvä "no checkout" chrome.
 */
class FastcheckoutHandleTest extends TestCase
{
    public function testFastcheckoutLayoutHostsKoBridgeWithoutLiveOpcUpdateHandle(): void
    {
        $path = dirname(__DIR__, 3) . '/view/frontend/layout/fastcheckout_index_index.xml';
        $this->assertFileExists($path);

        $xml = file_get_contents($path);
        $this->assertNotFalse($xml);

        // Must NOT pull Hyvä OPC empty-state / Luma chrome onto the FC route.
        $this->assertDoesNotMatchRegularExpression(
            '/^\s*<update\s+handle="checkout_index_index"\s*\/>/m',
            $xml,
            'Live update of checkout_index_index breaks Hyvä + Fastcheckout shell'
        );
        $this->assertStringContainsString(
            'kkkonrad.fastcheckout.hyva.checkout',
            $xml
        );
        $this->assertStringContainsString(
            'kkkonrad.fastcheckout.hyva.checkout.ko_checkout_bridge',
            $xml
        );
        $this->assertStringContainsString(
            'Kkkonrad_Fastcheckout::hyva/knockout/checkout-renderers.phtml',
            $xml
        );
        $this->assertStringContainsString(
            'Kkkonrad_Fastcheckout::js/requirejs-base.js',
            $xml
        );
        $this->assertStringContainsString(
            'name="checkout.root" remove="true"',
            $xml,
            'Defensive remove of checkout.root if a theme injects it'
        );
    }

    public function testCollectorIsTheOpcMergePath(): void
    {
        $collector = dirname(__DIR__, 3) . '/Model/CheckoutLayoutCollector.php';
        $this->assertFileExists($collector);
        $src = file_get_contents($collector);
        $this->assertStringContainsString('collectViaMagentoLayout', $src);
        $this->assertStringContainsString('checkout_index_index', $src);
        $this->assertStringContainsString('checkout.root', $src);
    }

    public function testCheckoutBridgeStillUsesPaymentHostBridgeWithoutLateAppendChildInActivatePath(): void
    {
        $bridge = dirname(__DIR__, 3) . '/view/frontend/web/js/hyva/checkout-bridge.js';
        $host = dirname(__DIR__, 3) . '/view/frontend/web/js/hyva/payment-host-bridge.js';
        $this->assertFileExists($bridge);
        $this->assertFileExists($host);

        $bridgeSrc = file_get_contents($bridge);
        $hostSrc = file_get_contents($host);

        $this->assertStringContainsString('payment-host-bridge', $bridgeSrc);
        $this->assertStringContainsString('activateMethodInHost', $bridgeSrc);
        $this->assertStringContainsString('adoptRendererOnce', $hostSrc);
        $this->assertStringContainsString('data-fastcheckout-host-mounted', $hostSrc);

        if (preg_match(
            '/function updateActiveRendererClass\([\s\S]*?\n                function /',
            $bridgeSrc,
            $m
        )) {
            $body = $m[0];
            $this->assertStringNotContainsString(
                'target.appendChild(activeElement)',
                $body,
                'updateActiveRendererClass must not late-appendChild payment renderers'
            );
            $this->assertStringContainsString('activateMethodInHost', $body);
        } else {
            $this->fail('Could not locate updateActiveRendererClass in checkout-bridge.js');
        }
    }
}
