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
use Magento\Theme\Model\ThemeFactory;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class DataTest extends TestCase
{
    public function testGetShippingPaymentMappingReturnsEmptyArrayWhenJsonIsInvalid(): void
    {
        $logger = $this->createMock(LoggerInterface::class);
        $jsonHelper = $this->createMock(JsonHelper::class);
        $jsonHelper->method('jsonDecode')->willThrowException(new \InvalidArgumentException('invalid json'));

        $helper = $this->createHelper('{invalid json', $jsonHelper, $logger);

        $this->assertSame([], $helper->getShippingPaymentMapping());
    }

    public function testGetShippingPaymentMappingReturnsEmptyArrayWhenJsonDoesNotDecodeToArray(): void
    {
        $jsonHelper = $this->createMock(JsonHelper::class);
        $jsonHelper->method('jsonDecode')->willReturn('checkmo');

        $helper = $this->createHelper('"checkmo"', $jsonHelper);

        $this->assertSame([], $helper->getShippingPaymentMapping());
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
            $this->createMock(ThemeFactory::class),
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
            $this->createMock(ThemeFactory::class),
            $hyvaThemes
        );

        $this->assertTrue($helper->canUseHyvaNativeCheckout());
    }

    private function createHelper(
        string $configValue,
        JsonHelper $jsonHelper,
        LoggerInterface $logger = null
    ): Data {
        $context = $this->createMock(Context::class);
        $scopeConfig = $this->createMock(ScopeConfigInterface::class);
        $scopeConfig->method('getValue')->willReturn($configValue);
        $context->method('getScopeConfig')->willReturn($scopeConfig);
        $context->method('getLogger')->willReturn($logger ?: $this->createMock(LoggerInterface::class));

        return new Data(
            $context,
            $jsonHelper,
            $this->createMock(DesignInterface::class),
            $this->createMock(ThemeFactory::class),
            $this->createMock(HyvaThemes::class)
        );
    }
}
