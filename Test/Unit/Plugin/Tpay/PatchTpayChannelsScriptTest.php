<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Test\Unit\Plugin\Tpay;

use Kkkonrad\Fastcheckout\Helper\Data as Helper;
use Kkkonrad\Fastcheckout\Plugin\Tpay\PatchTpayChannelsScript;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class PatchTpayChannelsScriptTest extends TestCase
{
    private const SCRIPT = "ShowChannelsCombo(); checkBlikInput(); setBlikInputAction(); payButton.addClass('disabled');";

    public function testPatchesTpayOnlyForHyvaFastcheckout(): void
    {
        $helper = $this->createMock(Helper::class);
        $helper->method('canUseHyvaNativeCheckout')->willReturn(true);

        $result = (new PatchTpayChannelsScript(
            $this->createMock(LoggerInterface::class),
            $helper
        ))->afterShowChannels(new \stdClass(), self::SCRIPT);

        self::assertStringContainsString('function tryInitTpay()', $result);
    }

    public function testLeavesOtherCheckoutsUntouched(): void
    {
        $helper = $this->createMock(Helper::class);
        $helper->method('canUseHyvaNativeCheckout')->willReturn(false);

        $result = (new PatchTpayChannelsScript(
            $this->createMock(LoggerInterface::class),
            $helper
        ))->afterShowChannels(new \stdClass(), self::SCRIPT);

        self::assertSame(self::SCRIPT, $result);
    }
}
