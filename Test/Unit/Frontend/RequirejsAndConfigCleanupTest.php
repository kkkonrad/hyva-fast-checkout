<?php
declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Test\Unit\Frontend;

use PHPUnit\Framework\TestCase;

/**
 * Point 2: passthrough mixins removed; ConfigProvider sortOrder present.
 */
class RequirejsAndConfigCleanupTest extends TestCase
{
    public function testRequirejsConfigDoesNotRegisterPurePassthroughMixins(): void
    {
        $path = dirname(__DIR__, 3) . '/view/frontend/requirejs-config.js';
        $this->assertFileExists($path);
        $src = file_get_contents($path);

        $this->assertStringNotContainsString(
            'set-shipping-information-mixin',
            $src,
            'Pure passthrough set-shipping-information mixin must be unregistered'
        );
        $this->assertStringNotContainsString(
            "'Kkkonrad_Fastcheckout/js/mixin/set-payment-information-mixin'",
            $src,
            'Pure passthrough set-payment-information mixin must be unregistered'
        );
        // Still register mixins that do real work.
        $this->assertStringContainsString('get-payment-information-mixin', $src);
        $this->assertStringContainsString('place-order-mixin', $src);
        $this->assertStringContainsString('shipping-view-mixin', $src);
    }

    public function testConfigProviderHasExplicitSortOrder(): void
    {
        $path = dirname(__DIR__, 3) . '/etc/frontend/di.xml';
        $xml = file_get_contents($path);
        $this->assertStringContainsString('fastcheckout_extended_checkout_config', $xml);
        $this->assertMatchesRegularExpression(
            '/fastcheckout_extended_checkout_config[^>]*sortOrder="1000"/',
            $xml
        );
    }

    public function testInPostUiHookIsOptionalInShippingViewMixin(): void
    {
        $path = dirname(__DIR__, 3) . '/view/frontend/web/js/mixin/shipping-view-mixin.js';
        $src = file_get_contents($path);
        $this->assertStringContainsString('isInPostModuleAvailable', $src);
        $this->assertStringContainsString('inPostPaczkomaty', $src);
        $this->assertStringContainsString('// Module path exists but failed to load — fail silently.', $src);
    }
}
