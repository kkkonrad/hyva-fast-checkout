<?php
declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Test\Unit\Model;

use Kkkonrad\Fastcheckout\Model\CheckoutLayoutCollector;
use Magento\Framework\Component\ComponentRegistrarInterface;
use Magento\Framework\Module\ModuleListInterface;
use Magento\Framework\View\Element\AbstractBlock;
use Magento\Framework\View\Layout\ProcessorInterface;
use Magento\Framework\View\LayoutFactory;
use Magento\Framework\View\LayoutInterface;
use PHPUnit\Framework\TestCase;
use SimpleXMLElement;

class CheckoutLayoutCollectorTest extends TestCase
{
    public function testCollectViaModuleFilesIncludesPaymentRendersAndShippingAdditionalAndAssets(): void
    {
        $moduleDir = sys_get_temp_dir() . '/fc-layout-collector-' . uniqid('', true);
        $layoutDir = $moduleDir . '/view/frontend/layout';
        mkdir($layoutDir, 0777, true);
        file_put_contents($layoutDir . '/checkout_index_index.xml', <<<'XML'
<?xml version="1.0"?>
<page xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <head>
        <css src="Vendor_Pay/css/pay.css"/>
        <script src="Vendor_Pay/js/pay-sdk.js"/>
    </head>
    <body>
        <referenceBlock name="checkout.root">
            <arguments>
                <argument name="jsLayout" xsi:type="array">
                    <item name="components" xsi:type="array">
                        <item name="checkout" xsi:type="array">
                            <item name="children" xsi:type="array">
                                <item name="steps" xsi:type="array">
                                    <item name="children" xsi:type="array">
                                        <item name="shipping-step" xsi:type="array">
                                            <item name="children" xsi:type="array">
                                                <item name="shippingAddress" xsi:type="array">
                                                    <item name="children" xsi:type="array">
                                                        <item name="shippingAdditional" xsi:type="array">
                                                            <item name="component" xsi:type="string">Vendor_Ship/js/view/locker</item>
                                                            <item name="displayArea" xsi:type="string">shippingAdditional</item>
                                                        </item>
                                                    </item>
                                                </item>
                                            </item>
                                        </item>
                                        <item name="billing-step" xsi:type="array">
                                            <item name="children" xsi:type="array">
                                                <item name="payment" xsi:type="array">
                                                    <item name="children" xsi:type="array">
                                                        <item name="renders" xsi:type="array">
                                                            <item name="children" xsi:type="array">
                                                                <item name="vendor-pay" xsi:type="array">
                                                                    <item name="component" xsi:type="string">Vendor_Pay/js/view/payment/method-renderer</item>
                                                                    <item name="methods" xsi:type="array">
                                                                        <item name="vendor_pay" xsi:type="array"/>
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

        $moduleList = $this->createMock(ModuleListInterface::class);
        $moduleList->method('getNames')->willReturn(['Vendor_Pay']);

        $registrar = $this->createMock(ComponentRegistrarInterface::class);
        $registrar->method('getPath')->willReturn($moduleDir);

        $collector = new CheckoutLayoutCollector(
            null,
            $moduleList,
            $registrar
        );

        try {
            $result = $collector->collectViaModuleFiles();
            $this->assertSame('module-files', $result['source']);

            $renders = $result['jsLayout']['components']['checkout']['children']['steps']['children']
                ['billing-step']['children']['payment']['children']['renders']['children'] ?? [];
            $this->assertArrayHasKey('vendor-pay', $renders);
            $this->assertSame(
                'Vendor_Pay/js/view/payment/method-renderer',
                $renders['vendor-pay']['component']
            );

            $shippingAdditional = $result['jsLayout']['components']['checkout']['children']['steps']['children']
                ['shipping-step']['children']['shippingAddress']['children']['shippingAdditional'] ?? [];
            $this->assertSame('Vendor_Ship/js/view/locker', $shippingAdditional['component'] ?? null);

            $this->assertNotEmpty($result['assets']['css']);
            $this->assertSame('Vendor_Pay/css/pay.css', $result['assets']['css'][0]['src']);
            $this->assertContains('Vendor_Pay/js/pay-sdk.js', $result['assets']['scripts']);
        } finally {
            @unlink($layoutDir . '/checkout_index_index.xml');
            @rmdir($layoutDir);
            @rmdir($moduleDir . '/view/frontend');
            @rmdir($moduleDir . '/view');
            @rmdir($moduleDir);
        }
    }

    public function testCollectViaMagentoLayoutReadsCheckoutRootAndHeadAssets(): void
    {
        $jsLayout = [
            'components' => [
                'checkout' => [
                    'children' => [
                        'steps' => [
                            'children' => [
                                'billing-step' => [
                                    'children' => [
                                        'payment' => [
                                            'children' => [
                                                'renders' => [
                                                    'children' => [
                                                        'theme-pay' => [
                                                            'component' => 'Theme_Pay/js/view/payment'
                                                        ]
                                                    ]
                                                ]
                                            ]
                                        ]
                                    ]
                                ]
                            ]
                        ]
                    ]
                ]
            ]
        ];

        $block = $this->getMockBuilder(AbstractBlock::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['getData'])
            ->getMockForAbstractClass();
        $block->method('getData')->with('jsLayout')->willReturn($jsLayout);

        $update = $this->createMock(ProcessorInterface::class);
        $update->expects($this->exactly(2))->method('addHandle')->willReturnCallback(
            function ($handle) use ($update) {
                $this->assertContains($handle, ['default', 'checkout_index_index']);
                return $update;
            }
        );
        $update->method('load')->willReturnSelf();
        $xml = new SimpleXMLElement(
            '<?xml version="1.0"?><page><head>' .
            '<css src="Theme_Pay/css/theme-pay.css"/>' .
            '<script src="Theme_Pay/js/theme-pay.js"/>' .
            '</head><body/></page>'
        );
        $update->method('asSimplexml')->willReturn($xml);

        $layout = $this->createMock(LayoutInterface::class);
        $layout->method('getUpdate')->willReturn($update);
        $layout->method('generateXml')->willReturnSelf();
        $layout->method('generateElements')->willReturnSelf();
        $layout->method('getBlock')->with('checkout.root')->willReturn($block);

        $layoutFactory = $this->createMock(LayoutFactory::class);
        $layoutFactory->method('create')->willReturn($layout);

        $collector = new CheckoutLayoutCollector($layoutFactory);
        $result = $collector->collectViaMagentoLayout();

        $this->assertSame('magento-layout', $result['source']);
        $renders = $result['jsLayout']['components']['checkout']['children']['steps']['children']
            ['billing-step']['children']['payment']['children']['renders']['children'] ?? [];
        $this->assertArrayHasKey('theme-pay', $renders);
        $this->assertSame('Theme_Pay/css/theme-pay.css', $result['assets']['css'][0]['src'] ?? null);
        $this->assertContains('Theme_Pay/js/theme-pay.js', $result['assets']['scripts']);
    }

    public function testCollectPrefersMagentoLayoutWhenNonEmpty(): void
    {
        $jsLayout = ['components' => ['checkout' => ['component' => 'uiComponent']]];

        $block = $this->getMockBuilder(AbstractBlock::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['getData'])
            ->getMockForAbstractClass();
        $block->method('getData')->willReturn($jsLayout);

        $update = $this->createMock(ProcessorInterface::class);
        $update->method('addHandle')->willReturnSelf();
        $update->method('load')->willReturnSelf();
        $update->method('asSimplexml')->willReturn(new SimpleXMLElement('<?xml version="1.0"?><page/>'));

        $layout = $this->createMock(LayoutInterface::class);
        $layout->method('getUpdate')->willReturn($update);
        $layout->method('generateXml')->willReturnSelf();
        $layout->method('generateElements')->willReturnSelf();
        $layout->method('getBlock')->willReturn($block);

        $layoutFactory = $this->createMock(LayoutFactory::class);
        $layoutFactory->method('create')->willReturn($layout);

        $collector = new CheckoutLayoutCollector($layoutFactory);
        $result = $collector->collect();

        $this->assertSame('magento-layout', $result['source']);
        $this->assertSame('uiComponent', $result['jsLayout']['components']['checkout']['component']);
    }
}
