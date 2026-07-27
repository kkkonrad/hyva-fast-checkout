<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Test\Unit\Plugin\Theme;

use Hyva\Theme\Service\HyvaThemes;
use Kkkonrad\Fastcheckout\Plugin\Theme\AllowJsMinifierForHyvaPlugin;
use Magento\Framework\View\Asset\PreProcessor\Chain;
use Magento\Framework\View\Asset\PreProcessor\Minify;
use PHPUnit\Framework\TestCase;

class AllowJsMinifierForHyvaPluginTest extends TestCase
{
    public function testAllowsJavaScriptMinificationForHyvaTheme(): void
    {
        $hyvaThemes = $this->createMock(HyvaThemes::class);
        $hyvaThemes->expects($this->never())->method('isHyvaThemeCode');

        $chain = $this->createMock(Chain::class);
        $chain->method('getTargetAssetPath')->willReturn('frontend/Hyva/default/example.js');

        $calls = 0;
        (new AllowJsMinifierForHyvaPlugin($hyvaThemes))->aroundProcess(
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

        $chain = $this->createMock(Chain::class);
        $chain->method('getTargetAssetPath')->willReturn('frontend/Hyva/default/styles.css');

        $calls = 0;
        (new AllowJsMinifierForHyvaPlugin($hyvaThemes))->aroundProcess(
            $this->createMock(Minify::class),
            static function () use (&$calls): void {
                $calls++;
            },
            $chain
        );

        $this->assertSame(0, $calls);
    }
}
