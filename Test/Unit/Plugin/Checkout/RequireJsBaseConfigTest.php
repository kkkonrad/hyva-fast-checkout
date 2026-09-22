<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Test\Unit\Plugin\Checkout;

use Kkkonrad\Fastcheckout\Helper\Data;
use Kkkonrad\Fastcheckout\Plugin\Checkout\RequireJsBaseConfig;
use Magento\Framework\App\Request\Http;
use Magento\Framework\View\Asset\GroupedCollection;
use Magento\Framework\View\Asset\PropertyGroup;
use Magento\Framework\View\Asset\Remote;
use Magento\Framework\View\Asset\Repository;
use Magento\Framework\View\Helper\SecureHtmlRenderer;
use PHPUnit\Framework\TestCase;

class RequireJsBaseConfigTest extends TestCase
{
    public function testPreservesSriWhileRestoringNativeScriptOrder(): void
    {
        $helper = $this->createMock(Data::class);
        $helper->method('canUseHyvaNativeCheckout')->willReturn(true);
        $request = $this->createMock(Http::class);
        $request->method('getFullActionName')->willReturn('checkout_index_index');
        $plugin = new RequireJsBaseConfig(
            $helper,
            $request,
            $this->createMock(Repository::class),
            $this->createMock(SecureHtmlRenderer::class)
        );
        $assets = [];
        $groups = [];
        foreach (['require', 'resolver', 'map', 'mixins', 'config', 'carrier'] as $name) {
            $assets[$name] = new Remote($name . '.js', 'js');
            $groups[$name] = new PropertyGroup([
                'content_type' => 'js', 'attributes' => ['integrity' => 'sha256-' . $name]
            ]);
            $groups[$name]->add($name, $assets[$name]);
        }
        $collection = $this->createMock(GroupedCollection::class);
        $collection->method('getAll')->willReturn($assets);
        $scrambled = array_map(static fn($key) => $groups[$key], [
            'require', 'carrier', 'config', 'mixins', 'resolver', 'map'
        ]);
        self::assertSame(array_values($groups), $plugin->afterGetGroups($collection, $scrambled));
    }
}
