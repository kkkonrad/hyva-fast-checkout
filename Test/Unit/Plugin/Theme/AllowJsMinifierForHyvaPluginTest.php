<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Test\Unit\Plugin\Theme;

use Hyva\Theme\Service\HyvaThemes;
use Kkkonrad\Fastcheckout\Helper\Data as Helper;
use Kkkonrad\Fastcheckout\Plugin\Theme\AllowJsMinifierForHyvaPlugin;
use Magento\Framework\View\Asset\PreProcessor\Chain;
use Magento\Framework\View\Asset\PreProcessor\Minify;
use PHPUnit\Framework\TestCase;

class AllowJsMinifierForHyvaPluginTest extends TestCase
{
    public function testAllowsJavaScriptMinificationForHyvaTheme(): void
    {
        $hyvaThemes = $this->createMock(HyvaThemes::class);
        $hyvaThemes->method('isHyvaThemeCode')->with('frontend/Hyva/default')->willReturn(true);
        $helper = $this->createMock(Helper::class);
        $helper->method('isEnable')->willReturn(true);
        $helper->method('isModuleOutputEnabled')->with('Kkkonrad_Fastcheckout')->willReturn(true);

        $chain = $this->createMock(Chain::class);
        $chain->method('getTargetAssetPath')->willReturn('frontend/Hyva/default/example.js');

        $calls = 0;
        (new AllowJsMinifierForHyvaPlugin($hyvaThemes, $helper))->aroundProcess(
            $this->createMock(Minify::class),
            static function () use (&$calls): void {
                $calls++;
            },
            $chain
        );

        $this->assertSame(1, $calls);
    }

    public function testKeepsCssMinificationDisabledForHyvaTheme(): void
    {
        $hyvaThemes = $this->createMock(HyvaThemes::class);
        $hyvaThemes->method('isHyvaThemeCode')->with('frontend/Hyva/default')->willReturn(true);
        $helper = $this->createMock(Helper::class);

        $chain = $this->createMock(Chain::class);
        $chain->method('getTargetAssetPath')->willReturn('frontend/Hyva/default/styles.css');

        $calls = 0;
        (new AllowJsMinifierForHyvaPlugin($hyvaThemes, $helper))->aroundProcess(
            $this->createMock(Minify::class),
            static function () use (&$calls): void {
                $calls++;
            },
            $chain
        );

        $this->assertSame(0, $calls);
    }

    public function testKeepsJavaScriptMinificationDisabledWhenFastcheckoutIsDisabled(): void
    {
        $hyvaThemes = $this->createMock(HyvaThemes::class);
        $hyvaThemes->method('isHyvaThemeCode')->with('frontend/Hyva/default')->willReturn(true);
        $helper = $this->createMock(Helper::class);
        $helper->method('isEnable')->willReturn(false);

        $chain = $this->createMock(Chain::class);
        $chain->method('getTargetAssetPath')->willReturn('frontend/Hyva/default/example.js');

        $calls = 0;
        (new AllowJsMinifierForHyvaPlugin($hyvaThemes, $helper))->aroundProcess(
            $this->createMock(Minify::class),
            static function () use (&$calls): void {
                $calls++;
            },
            $chain
        );

        $this->assertSame(0, $calls);
    }

    public function testLeavesNonHyvaAssetsToMagento(): void
    {
        $hyvaThemes = $this->createMock(HyvaThemes::class);
        $hyvaThemes->method('isHyvaThemeCode')->with('frontend/Magento/luma')->willReturn(false);
        $helper = $this->createMock(Helper::class);

        $chain = $this->createMock(Chain::class);
        $chain->method('getTargetAssetPath')->willReturn('frontend/Magento/luma/example.js');

        $calls = 0;
        (new AllowJsMinifierForHyvaPlugin($hyvaThemes, $helper))->aroundProcess(
            $this->createMock(Minify::class),
            static function () use (&$calls): void {
                $calls++;
            },
            $chain
        );

        $this->assertSame(1, $calls);
    }
}
