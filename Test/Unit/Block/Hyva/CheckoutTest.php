<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Test\Unit\Block\Hyva;

use Kkkonrad\Fastcheckout\Block\Hyva\Checkout;
use Kkkonrad\Fastcheckout\Helper\Data as Helper;
use Hyva\Theme\Model\ViewModelRegistry;
use Magento\Catalog\Helper\Image as ImageHelper;
use Magento\Catalog\Helper\Product\Configuration as ProductConfiguration;
use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Framework\Component\ComponentRegistrarInterface;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\Module\ModuleListInterface;
use Magento\Framework\Pricing\Helper\Data as PricingHelper;
use Magento\Framework\View\Element\Template\Context;
use Magento\Quote\Model\Quote;
use Magento\Quote\Model\Quote\Item;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

class CheckoutTest extends TestCase
{
    /**
     * @var Checkout
     */
    private $checkoutBlock;

    /**
     * @var Context|MockObject
     */
    private $contextMock;

    /**
     * @var CheckoutSession|MockObject
     */
    private $checkoutSessionMock;

    /**
     * @var PricingHelper|MockObject
     */
    private $pricingHelperMock;

    /**
     * @var ImageHelper|MockObject
     */
    private $imageHelperMock;

    /**
     * @var ProductConfiguration|MockObject
     */
    private $productConfigurationMock;

    /**
     * @var ViewModelRegistry|MockObject
     */
    private $viewModelRegistryMock;

    /**
     * @var Helper|MockObject
     */
    private $helperMock;

    /**
     * @var Quote|MockObject
     */
    private $quoteMock;

    protected function setUp(): void
    {
        $this->contextMock = $this->createMock(Context::class);
        
        $this->checkoutSessionMock = $this->getMockBuilder(CheckoutSession::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['getQuote'])
            ->getMock();
            
        $this->pricingHelperMock = $this->createMock(PricingHelper::class);
        $this->imageHelperMock = $this->createMock(ImageHelper::class);
        $this->productConfigurationMock = $this->createMock(ProductConfiguration::class);
        $this->viewModelRegistryMock = $this->createMock(ViewModelRegistry::class);
        $this->helperMock = $this->createMock(Helper::class);
        $this->quoteMock = $this->createMock(Quote::class);

        $this->checkoutSessionMock->expects($this->any())
            ->method('getQuote')
            ->willReturn($this->quoteMock);

        $this->checkoutBlock = new Checkout(
            $this->contextMock,
            $this->checkoutSessionMock,
            $this->pricingHelperMock,
            $this->imageHelperMock,
            $this->productConfigurationMock,
            $this->viewModelRegistryMock,
            $this->helperMock,
            null,
            null,
            null,
            null,
            []
        );
    }

    public function testGetQuote(): void
    {
        $this->assertSame($this->quoteMock, $this->checkoutBlock->getQuote());
    }

    public function testGetVisibleItems(): void
    {
        $itemMock = $this->createMock(Item::class);
        $this->quoteMock->expects($this->once())
            ->method('getAllVisibleItems')
            ->willReturn([$itemMock]);

        $this->assertSame([$itemMock], $this->checkoutBlock->getVisibleItems());
    }

    public function testGetItemsQty(): void
    {
        $this->quoteMock->expects($this->once())
            ->method('getItemsQty')
            ->willReturn(5.0);

        $this->assertEquals(5.0, $this->checkoutBlock->getItemsQty());
    }

    public function testFormatPrice(): void
    {
        $this->pricingHelperMock->expects($this->once())
            ->method('currency')
            ->with(100.0, true, false)
            ->willReturn('$100.00');

        $this->assertEquals('$100.00', $this->checkoutBlock->formatPrice(100));
    }

    public function testGetCheckoutLayoutAssetsReturnsEmptyWhenDepsNull(): void
    {
        $this->assertEquals(['css' => [], 'scripts' => []], $this->checkoutBlock->getCheckoutLayoutAssets());
    }

    public function testGetCheckoutLayoutScriptsReturnsEmptyWhenDepsNull(): void
    {
        $this->assertEquals(['modules' => [], 'external' => []], $this->checkoutBlock->getCheckoutLayoutScripts());
    }

    public function testGetPaymentValidationComponentsReturnsEmptyWhenDepsNull(): void
    {
        $this->assertEquals([], $this->checkoutBlock->getPaymentValidationComponents());
    }

    public function testGetPaymentRendererComponentMapUsesMethodCodesFromCheckoutLayout(): void
    {
        $moduleDir = sys_get_temp_dir() . '/fastcheckout-layout-' . uniqid('', true);
        $layoutDir = $moduleDir . '/view/frontend/layout';
        mkdir($layoutDir, 0777, true);
        file_put_contents($layoutDir . '/checkout_index_index.xml', <<<'XML'
<?xml version="1.0"?>
<page>
    <body>
        <referenceBlock name="checkout.root">
            <arguments>
                <argument name="jsLayout" xsi:type="array" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
                    <item name="components" xsi:type="array">
                        <item name="checkout" xsi:type="array">
                            <item name="children" xsi:type="array">
                                <item name="steps" xsi:type="array">
                                    <item name="children" xsi:type="array">
                                        <item name="billing-step" xsi:type="array">
                                            <item name="children" xsi:type="array">
                                                <item name="payment" xsi:type="array">
                                                    <item name="children" xsi:type="array">
                                                        <item name="renders" xsi:type="array">
                                                            <item name="children" xsi:type="array">
                                                                <item name="gateway-group" xsi:type="array">
                                                                    <item name="component" xsi:type="string">Vendor_Module/js/view/payment/gateway</item>
                                                                    <item name="methods" xsi:type="array">
                                                                        <item name="gateway_one" xsi:type="array"/>
                                                                        <item name="gateway_disabled" xsi:type="array"/>
                                                                    </item>
                                                                </item>
                                                                <item name="standalone" xsi:type="array">
                                                                    <item name="component" xsi:type="string">Vendor_Module/js/view/payment/standalone</item>
                                                                </item>
                                                            </item>
                                                        </item>
                                                    </item>
                                                </item>
                                            </item>
                                        </item>
                                    </item>
                                </item>
                            </item>
                        </item>
                    </item>
                </argument>
            </arguments>
        </referenceBlock>
    </body>
</page>
XML
        );

        $scopeConfigMock = $this->createMock(ScopeConfigInterface::class);
        $scopeConfigMock->method('getValue')->willReturnCallback(static function ($path) {
            return $path === 'payment/gateway_disabled/active' ? '0' : '1';
        });

        $contextMock = $this->createMock(Context::class);
        $contextMock->method('getScopeConfig')->willReturn($scopeConfigMock);

        $moduleListMock = $this->createMock(ModuleListInterface::class);
        $moduleListMock->method('getNames')->willReturn(['Vendor_Module']);

        $componentRegistrarMock = $this->createMock(ComponentRegistrarInterface::class);
        $componentRegistrarMock->method('getPath')->willReturn($moduleDir);

        $block = new Checkout(
            $contextMock,
            $this->checkoutSessionMock,
            $this->pricingHelperMock,
            $this->imageHelperMock,
            $this->productConfigurationMock,
            $this->viewModelRegistryMock,
            $this->helperMock,
            null,
            $moduleListMock,
            $componentRegistrarMock,
            null,
            []
        );

        try {
            $this->assertSame([
                [
                    'method' => 'gateway_one',
                    'component' => 'Vendor_Module/js/view/payment/gateway'
                ],
                [
                    'method' => 'standalone',
                    'component' => 'Vendor_Module/js/view/payment/standalone'
                ]
            ], $block->getPaymentRendererComponentMap());
        } finally {
            @unlink($layoutDir . '/checkout_index_index.xml');
            @rmdir($layoutDir);
            @rmdir($moduleDir . '/view/frontend');
            @rmdir($moduleDir . '/view');
            @rmdir($moduleDir);
        }
    }
}
