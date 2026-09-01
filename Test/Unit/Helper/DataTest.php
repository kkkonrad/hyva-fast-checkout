<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Test\Unit\Helper;

use Hyva\Theme\Service\HyvaThemes;
use Kkkonrad\Fastcheckout\Helper\Data;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\App\Helper\Context;
use Magento\Framework\Json\Helper\Data as JsonHelper;
use Magento\Framework\Module\Manager as ModuleManager;
use Magento\Framework\View\DesignInterface;
use Magento\Framework\View\Design\ThemeInterface;
use Magento\Store\Model\ScopeInterface;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class DataTest extends TestCase
{
    public function testInvalidShippingPaymentMappingIsIgnored(): void
    {
        $json = $this->createMock(JsonHelper::class);
        $json->method('jsonDecode')->willThrowException(new \InvalidArgumentException('invalid'));

        self::assertSame([], $this->mappingHelper('{invalid', $json)->getShippingPaymentMapping());

        $json = $this->createMock(JsonHelper::class);
        $json->method('jsonDecode')->willReturn('checkmo');
        self::assertSame([], $this->mappingHelper('"checkmo"', $json)->getShippingPaymentMapping());
    }

    public function testCanUseHyvaNativeCheckoutMemoizesResult(): void
    {
        $context = $this->createMock(Context::class);
        $scopeConfig = $this->createMock(ScopeConfigInterface::class);
        $calls = 0;
        $scopeConfig->method('getValue')->willReturnCallback(function () use (&$calls) {
            $calls++;
            return false;
        });
        $context->method('getScopeConfig')->willReturn($scopeConfig);
        $context->method('getLogger')->willReturn($this->createMock(LoggerInterface::class));

        $helper = new Data(
            $context,
            $this->createMock(JsonHelper::class),
            $this->createMock(DesignInterface::class),
            $this->createMock(HyvaThemes::class)
        );

        $this->assertFalse($helper->canUseHyvaNativeCheckout());
        $afterFirst = $calls;
        $this->assertGreaterThan(0, $afterFirst);
        $this->assertFalse($helper->canUseHyvaNativeCheckout());
        $this->assertSame($afterFirst, $calls, 'canUseHyvaNativeCheckout must not re-read config on subsequent calls');
    }

    public function testCanUseHyvaNativeCheckoutDelegatesChildThemeDetectionToHyvaService(): void
    {
        $context = $this->createMock(Context::class);
        $scopeConfig = $this->createMock(ScopeConfigInterface::class);
        $scopeConfig->method('getValue')->willReturnMap([
            [Data::XML_PATH_ENABLE, 'store', null, true],
        ]);
        $moduleManager = $this->createMock(ModuleManager::class);
        $moduleManager->method('isOutputEnabled')->with('Kkkonrad_Fastcheckout')->willReturn(true);
        $context->method('getScopeConfig')->willReturn($scopeConfig);
        $context->method('getModuleManager')->willReturn($moduleManager);
        $context->method('getLogger')->willReturn($this->createMock(LoggerInterface::class));

        $theme = $this->createMock(ThemeInterface::class);
        $theme->method('getFullPath')->willReturn('frontend/Acme/storefront');
        $design = $this->createMock(DesignInterface::class);
        $design->method('getDesignTheme')->willReturn($theme);
        $hyvaThemes = $this->createMock(HyvaThemes::class);
        $hyvaThemes->expects($this->once())->method('isHyvaTheme')->with($theme)->willReturn(true);

        $helper = new Data(
            $context,
            $this->createMock(JsonHelper::class),
            $design,
            $hyvaThemes
        );

        $this->assertTrue($helper->canUseHyvaNativeCheckout());
    }

    /**
     * @dataProvider checkoutLayoutFlagProvider
     */
    public function testCheckoutLayoutFlagUsesStoreScopedConfiguration(string $path, string $method): void
    {
        $context = $this->createMock(Context::class);
        $scopeConfig = $this->createMock(ScopeConfigInterface::class);
        $scopeConfig->expects($this->once())
            ->method('getValue')
            ->with($path, ScopeInterface::SCOPE_STORE)
            ->willReturn('1');
        $context->method('getScopeConfig')->willReturn($scopeConfig);
        $context->method('getLogger')->willReturn($this->createMock(LoggerInterface::class));

        $helper = new Data(
            $context,
            $this->createMock(JsonHelper::class),
            $this->createMock(DesignInterface::class),
            $this->createMock(HyvaThemes::class)
        );

        $this->assertTrue($helper->{$method}());
    }

    public static function checkoutLayoutFlagProvider(): array
    {
        return [
            [Data::XML_PATH_TWO_STEP, 'isTwoStep'],
            [Data::XML_PATH_SEPARATE_ORDER_ACTIONS, 'isSeparateOrderActions'],
            [Data::XML_PATH_PLACE_ORDER_OUTSIDE_SUMMARY, 'isPlaceOrderOutsideSummary'],
        ];
    }

    private function mappingHelper(string $value, JsonHelper $json): Data
    {
        $context = $this->createMock(Context::class);
        $scopeConfig = $this->createMock(ScopeConfigInterface::class);
        $scopeConfig->method('getValue')->willReturn($value);
        $context->method('getScopeConfig')->willReturn($scopeConfig);
        $context->method('getLogger')->willReturn($this->createMock(LoggerInterface::class));

        return new Data(
            $context,
            $json,
            $this->createMock(DesignInterface::class),
            $this->createMock(HyvaThemes::class)
        );
    }
}
