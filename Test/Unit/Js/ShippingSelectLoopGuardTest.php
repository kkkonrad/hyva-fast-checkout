<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Test\Unit\Js;

use PHPUnit\Framework\TestCase;

/**
 * Guards against the XHR loop regression: selecting shipping must not dual-write
 * Magewire + re-estimate rates in a tight loop.
 */
class ShippingSelectLoopGuardTest extends TestCase
{
    private function moduleRoot(): string
    {
        return dirname(__DIR__, 3);
    }

    public function testNativePushCoalescesRepeatedSameMethod(): void
    {
        $js = file_get_contents($this->moduleRoot() . '/view/frontend/web/js/hyva/shipping-method-sync.js');
        $this->assertNotFalse($js);

        // Coalesce window and in-flight guard present in shipped code.
        $this->assertStringContainsString('pushInFlight', $js);
        $this->assertMatchesRegularExpression('/lastPushedCode === methodCode && \(Date\.now\(\) - lastPushedAt\) < \d+/', $js);
        $this->assertStringContainsString('setShippingInformationAction', $js);

        // Must not call Magewire select.
        $this->assertStringNotContainsString("call('selectShippingMethod'", $js);
    }

    public function testRateListLockedDuringSelection(): void
    {
        $js = file_get_contents($this->moduleRoot() . '/view/frontend/web/js/hyva/shipping-method-sync.js');
        $this->assertStringContainsString('fastcheckoutLockShippingRatesList = true', $js);

        $serviceMixin = file_get_contents(
            $this->moduleRoot() . '/view/frontend/web/js/mixin/shipping-service-mixin.js'
        );
        $this->assertNotFalse($serviceMixin);
        $this->assertStringContainsString('fastcheckoutLockShippingRatesList', $serviceMixin);
        // When locked, setShippingRates is a no-op (prevents list rebuild).
        $this->assertStringContainsString('if (window.fastcheckoutLockShippingRatesList)', $serviceMixin);
    }

    public function testRecollectBlockedDuringSelection(): void
    {
        $js = file_get_contents(
            $this->moduleRoot() . '/view/frontend/web/js/mixin/recollect-shipping-rates-mixin.js'
        );
        $this->assertNotFalse($js);
        $this->assertStringContainsString('fastcheckoutSelectingShippingMethod', $js);
    }
}
