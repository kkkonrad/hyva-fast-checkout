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

    public function testGetPaymentListChildrenReturnsEmptyWhenDepsNull(): void
    {
        $this->assertEquals([], $this->checkoutBlock->getPaymentListChildren());
    }

    public function testGetPaymentRegionChildrenReturnsEmptyWhenDepsNull(): void
    {
        $this->assertEquals([], $this->checkoutBlock->getPaymentRegionChildren());
    }

    public function testGetShippingListChildrenReturnsEmptyWhenDepsNull(): void
    {
        $this->assertEquals([], $this->checkoutBlock->getShippingListChildren());
    }

    public function testGetShippingAddressChildrenReturnsEmptyWhenDepsNull(): void
    {
        $this->assertEquals([], $this->checkoutBlock->getShippingAddressChildren());
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
                    'method' => 'gateway-group',
                    'component' => 'Vendor_Module/js/view/payment/gateway',
                    'matchPrefix' => true,
                    'matchContains' => true
                ],
                [
                    'method' => 'gateway_one',
                    'component' => 'Vendor_Module/js/view/payment/gateway',
                    'matchPrefix' => true
                ],
                [
                    'method' => 'standalone',
                    'component' => 'Vendor_Module/js/view/payment/standalone',
                    'matchPrefix' => true,
                    'matchContains' => true
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

    public function testGetPaymentListChildrenKeepsBeforePlaceOrderComponents(): void
    {
        $moduleDir = sys_get_temp_dir() . '/fastcheckout-payment-list-' . uniqid('', true);
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
                                                        <item name="payments-list" xsi:type="array">
                                                            <item name="children" xsi:type="array">
                                                                <item name="before-place-order" xsi:type="array">
                                                                    <item name="component" xsi:type="string">uiComponent</item>
                                                                    <item name="displayArea" xsi:type="string">before-place-order</item>
                                                                    <item name="config" xsi:type="array">
                                                                        <item name="template" xsi:type="string">Magento_Checkout/payment/before-place-order</item>
                                                                    </item>
                                                                    <item name="children" xsi:type="array">
                                                                        <item name="agreements" xsi:type="array">
                                                                            <item name="component" xsi:type="string">Magento_CheckoutAgreements/js/view/checkout-agreements</item>
                                                                            <item name="sortOrder" xsi:type="string">100</item>
                                                                            <item name="displayArea" xsi:type="string">before-place-order</item>
                                                                            <item name="dataScope" xsi:type="string">checkoutAgreements</item>
                                                                            <item name="provider" xsi:type="string">checkoutProvider</item>
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
                        </item>
                    </item>
                </argument>
            </arguments>
        </referenceBlock>
    </body>
</page>
XML
        );

        $contextMock = $this->createMock(Context::class);
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
                'before-place-order' => [
                    'component' => 'uiComponent',
                    'displayArea' => 'before-place-order',
                    'config' => [
                        'template' => 'Magento_Checkout/payment/before-place-order'
                    ],
                    'children' => [
                        'agreements' => [
                            'component' => 'Magento_CheckoutAgreements/js/view/checkout-agreements',
                            'sortOrder' => '100',
                            'displayArea' => 'before-place-order',
                            'dataScope' => 'checkoutAgreements',
                            'provider' => 'checkoutProvider'
                        ]
                    ]
                ]
            ], $block->getPaymentListChildren());
        } finally {
            @unlink($layoutDir . '/checkout_index_index.xml');
            @rmdir($layoutDir);
            @rmdir($moduleDir . '/view/frontend');
            @rmdir($moduleDir . '/view');
            @rmdir($moduleDir);
        }
    }

    public function testGetPaymentRegionChildrenKeepsPaymentLevelRegions(): void
    {
        $moduleDir = sys_get_temp_dir() . '/fastcheckout-payment-region-' . uniqid('', true);
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
                                                        <item name="place-order-captcha" xsi:type="array">
                                                            <item name="component" xsi:type="string">Magento_Checkout/js/view/checkout/placeOrderCaptcha</item>
                                                            <item name="displayArea" xsi:type="string">place-order-captcha</item>
                                                            <item name="formId" xsi:type="string">payment_processing_request</item>
                                                        </item>
                                                        <item name="afterMethods" xsi:type="array">
                                                            <item name="component" xsi:type="string">uiComponent</item>
                                                            <item name="displayArea" xsi:type="string">afterMethods</item>
                                                            <item name="children" xsi:type="array">
                                                                <item name="discount" xsi:type="array">
                                                                    <item name="component" xsi:type="string">Magento_SalesRule/js/view/payment/discount</item>
                                                                    <item name="children" xsi:type="array">
                                                                        <item name="captcha" xsi:type="array">
                                                                            <item name="component" xsi:type="string">Magento_SalesRule/js/view/payment/captcha</item>
                                                                            <item name="displayArea" xsi:type="string">captcha</item>
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
                        </item>
                    </item>
                </argument>
            </arguments>
        </referenceBlock>
    </body>
</page>
XML
        );

        $contextMock = $this->createMock(Context::class);
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
                'place-order-captcha' => [
                    'component' => 'Magento_Checkout/js/view/checkout/placeOrderCaptcha',
                    'displayArea' => 'place-order-captcha',
                    'formId' => 'payment_processing_request'
                ],
                'afterMethods' => [
                    'component' => 'uiComponent',
                    'displayArea' => 'afterMethods',
                    'children' => [
                        'discount' => [
                            'component' => 'Magento_SalesRule/js/view/payment/discount',
                            'children' => [
                                'captcha' => [
                                    'component' => 'Magento_SalesRule/js/view/payment/captcha',
                                    'displayArea' => 'captcha'
                                ]
                            ]
                        ]
                    ]
                ]
            ], $block->getPaymentRegionChildren());
        } finally {
            @unlink($layoutDir . '/checkout_index_index.xml');
            @rmdir($layoutDir);
            @rmdir($moduleDir . '/view/frontend');
            @rmdir($moduleDir . '/view');
            @rmdir($moduleDir);
        }
    }

    public function testGetShippingListChildrenKeepsShippingMethodRegions(): void
    {
        $moduleDir = sys_get_temp_dir() . '/fastcheckout-shipping-list-' . uniqid('', true);
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
                                        <item name="shipping-step" xsi:type="array">
                                            <item name="children" xsi:type="array">
                                                <item name="shippingAddress" xsi:type="array">
                                                    <item name="children" xsi:type="array">
                                                        <item name="before-shipping-method-form" xsi:type="array">
                                                            <item name="component" xsi:type="string">uiComponent</item>
                                                            <item name="displayArea" xsi:type="string">before-shipping-method-form</item>
                                                            <item name="children" xsi:type="array">
                                                                <item name="shipping_policy" xsi:type="array">
                                                                    <item name="component" xsi:type="string">Magento_Shipping/js/view/checkout/shipping/shipping-policy</item>
                                                                </item>
                                                            </item>
                                                        </item>
                                                        <item name="shippingAdditional" xsi:type="array">
                                                            <item name="component" xsi:type="string">uiComponent</item>
                                                            <item name="displayArea" xsi:type="string">shippingAdditional</item>
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

        $contextMock = $this->createMock(Context::class);
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
                'before-shipping-method-form' => [
                    'component' => 'uiComponent',
                    'displayArea' => 'before-shipping-method-form',
                    'children' => [
                        'shipping_policy' => [
                            'component' => 'Magento_Shipping/js/view/checkout/shipping/shipping-policy'
                        ]
                    ]
                ],
                'shippingAdditional' => [
                    'component' => 'uiComponent',
                    'displayArea' => 'shippingAdditional'
                ]
            ], $block->getShippingListChildren());
        } finally {
            @unlink($layoutDir . '/checkout_index_index.xml');
            @rmdir($layoutDir);
            @rmdir($moduleDir . '/view/frontend');
            @rmdir($moduleDir . '/view');
            @rmdir($moduleDir);
        }
    }

    public function testGetShippingAddressChildrenKeepsAddressExtensionRegions(): void
    {
        $moduleDir = sys_get_temp_dir() . '/fastcheckout-shipping-address-' . uniqid('', true);
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
                                        <item name="shipping-step" xsi:type="array">
                                            <item name="children" xsi:type="array">
                                                <item name="shippingAddress" xsi:type="array">
                                                    <item name="children" xsi:type="array">
                                                        <item name="before-form" xsi:type="array">
                                                            <item name="component" xsi:type="string">uiComponent</item>
                                                            <item name="displayArea" xsi:type="string">before-form</item>
                                                            <item name="children" xsi:type="array">
                                                                <item name="address_hint" xsi:type="array">
                                                                    <item name="component" xsi:type="string">Vendor_Module/js/view/address-hint</item>
                                                                </item>
                                                            </item>
                                                        </item>
                                                        <item name="before-fields" xsi:type="array">
                                                            <item name="component" xsi:type="string">uiComponent</item>
                                                            <item name="displayArea" xsi:type="string">before-fields</item>
                                                        </item>
                                                        <item name="address-list-additional-addresses" xsi:type="array">
                                                            <item name="component" xsi:type="string">uiComponent</item>
                                                            <item name="displayArea" xsi:type="string">address-list-additional-addresses</item>
                                                        </item>
                                                        <item name="shipping-address-fieldset" xsi:type="array">
                                                            <item name="component" xsi:type="string">uiComponent</item>
                                                            <item name="displayArea" xsi:type="string">additional-fieldsets</item>
                                                            <item name="children" xsi:type="array">
                                                                <item name="postcode" xsi:type="array">
                                                                    <item name="component" xsi:type="string">Magento_Ui/js/form/element/post-code</item>
                                                                </item>
                                                                <item name="delivery_note" xsi:type="array">
                                                                    <item name="component" xsi:type="string">Magento_Ui/js/form/element/abstract</item>
                                                                    <item name="label" xsi:type="string">Delivery Note</item>
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

        $contextMock = $this->createMock(Context::class);
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
                'before-form' => [
                    'component' => 'uiComponent',
                    'displayArea' => 'before-form',
                    'children' => [
                        'address_hint' => [
                            'component' => 'Vendor_Module/js/view/address-hint'
                        ]
                    ]
                ],
                'before-fields' => [
                    'component' => 'uiComponent',
                    'displayArea' => 'before-fields'
                ],
                'address-list-additional-addresses' => [
                    'component' => 'uiComponent',
                    'displayArea' => 'address-list-additional-addresses'
                ],
                'shipping-address-fieldset' => [
                    'component' => 'uiComponent',
                    'displayArea' => 'additional-fieldsets',
                    'children' => [
                        'delivery_note' => [
                            'component' => 'Magento_Ui/js/form/element/abstract',
                            'label' => 'Delivery Note',
                            'provider' => 'checkoutProvider',
                            'dataScope' => 'shippingAddress.custom_attributes.delivery_note',
                            'customScope' => 'shippingAddress.custom_attributes',
                            'config' => [
                                'template' => 'ui/form/field',
                                'elementTmpl' => 'ui/form/element/input'
                            ]
                        ]
                    ]
                ]
            ], $block->getShippingAddressChildren());
        } finally {
            @unlink($layoutDir . '/checkout_index_index.xml');
            @rmdir($layoutDir);
            @rmdir($moduleDir . '/view/frontend');
            @rmdir($moduleDir . '/view');
            @rmdir($moduleDir);
        }
    }
}
