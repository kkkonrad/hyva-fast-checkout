<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Test\Unit\Block\Adminhtml\System\Config;

use Kkkonrad\Fastcheckout\Block\Adminhtml\System\Config\ShippingPaymentMapping;
use Magento\Framework\Data\Form\Element\AbstractElement;
use PHPUnit\Framework\TestCase;

class ShippingPaymentMappingTest extends TestCase
{
    public function testJsonConfigurationIsRenderedAsFieldArrayRows(): void
    {
        $reflection = new \ReflectionClass(ShippingPaymentMapping::class);
        $block = $reflection->newInstanceWithoutConstructor();
        $value = json_encode([
            '_1' => [
                'shipping_method' => 'inpostlocker_standard',
                'payment_method' => 'payu_gateway',
            ],
        ]);
        $element = $this->getMockBuilder(AbstractElement::class)
            ->disableOriginalConstructor()
            ->addMethods(['getValue', 'setValue'])
            ->getMock();
        $renderer = new class {
            public function calcOptionHash($value): string
            {
                return (string)$value;
            }
        };

        $element->method('getValue')->willReturnCallback(static function () use (&$value) {
            return $value;
        });
        $element->method('setValue')->willReturnCallback(static function ($newValue) use (&$value) {
            $value = $newValue;
            return null;
        });

        foreach (['shippingMethodRenderer', 'paymentMethodRenderer'] as $propertyName) {
            $property = $reflection->getProperty($propertyName);
            $property->setValue($block, $renderer);
        }

        $block->setElement($element);
        $rows = $block->getArrayRows();

        self::assertArrayHasKey('_1', $rows);
        self::assertSame('inpostlocker_standard', $rows['_1']->getData('shipping_method'));
        self::assertSame('payu_gateway', $rows['_1']->getData('payment_method'));
    }
}
