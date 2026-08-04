<?php
declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Test\Unit\Plugin\Quote;

use Kkkonrad\Fastcheckout\Plugin\Quote\PreserveShippingExtensionAttributes;
use Magento\Quote\Api\CartRepositoryInterface;
use Magento\Quote\Api\Data\CartExtensionFactory;
use Magento\Quote\Api\Data\CartExtensionInterface;
use Magento\Quote\Model\Quote;
use Magento\Quote\Model\Quote\Address as QuoteAddress;
use PHPUnit\Framework\TestCase;

class PreserveShippingExtensionAttributesTest extends TestCase
{
    protected function setUp(): void
    {
        PreserveShippingExtensionAttributes::resetLookupCache();
    }

    public function testRestoresGenericParcelAttributeForMatchingShippingMethod(): void
    {
        $extension = $this->getMockBuilder(CartExtensionInterface::class)
            ->addMethods(['setParcelPointId', 'getParcelPointId'])
            ->getMockForAbstractClass();
        $stored = null;
        $extension->method('setParcelPointId')->willReturnCallback(
            static function ($id) use (&$stored, $extension) {
                $stored = $id;
                return $extension;
            }
        );
        $extension->method('getParcelPointId')->willReturnCallback(
            static function () use (&$stored) {
                return $stored;
            }
        );

        $factory = $this->createMock(CartExtensionFactory::class);
        $factory->expects($this->once())->method('create')->willReturn($extension);

        $plugin = new PreserveShippingExtensionAttributes($factory, [
            'parcel_point_id' => [
                'column' => 'parcel_point_id',
                'extension_getter' => 'getParcelPointId',
                'extension_setter' => 'setParcelPointId',
                'shipping_method_needles' => ['dpd_pickup', 'parcel'],
            ],
        ]);

        $shippingAddress = $this->createMock(QuoteAddress::class);
        $shippingAddress->method('getShippingMethod')->willReturn('dpd_pickup_standard');

        $select = $this->getMockBuilder(\stdClass::class)->addMethods(['from', 'where'])->getMock();
        $select->method('from')->willReturnSelf();
        $select->method('where')->willReturnSelf();

        $connection = $this->getMockBuilder(\stdClass::class)
            ->addMethods(['select', 'fetchOne', 'tableColumnExists'])
            ->getMock();
        $connection->method('select')->willReturn($select);
        $connection->method('tableColumnExists')->willReturn(true);
        $connection->method('fetchOne')->willReturn('POINT-42');

        $resource = $this->getMockBuilder(\stdClass::class)
            ->addMethods(['getConnection', 'getTable'])
            ->getMock();
        $resource->method('getConnection')->willReturn($connection);
        $resource->method('getTable')->willReturn('quote');

        $quote = $this->getMockBuilder(Quote::class)
            ->disableOriginalConstructor()
            ->onlyMethods([
                'isVirtual',
                'getId',
                'getExtensionAttributes',
                'setExtensionAttributes',
                'getData',
                'setData',
                'getResource',
                'getShippingAddress',
            ])
            ->getMock();
        $quote->method('isVirtual')->willReturn(false);
        $quote->method('getId')->willReturn(99);
        $quote->method('getExtensionAttributes')->willReturn(null);
        $quote->method('getData')->with('parcel_point_id')->willReturn(null);
        $quote->method('getShippingAddress')->willReturn($shippingAddress);
        $quote->method('getResource')->willReturn($resource);
        $quote->expects($this->once())->method('setData')->with('parcel_point_id', 'POINT-42');
        $quote->expects($this->once())->method('setExtensionAttributes')->with($extension);

        $repository = $this->createMock(CartRepositoryInterface::class);
        $this->assertSame([$quote], $plugin->beforeSave($repository, $quote));
        $this->assertSame('POINT-42', $stored);
    }

    public function testSkipsDbWhenShippingNeedlesDoNotMatch(): void
    {
        $factory = $this->createMock(CartExtensionFactory::class);
        $factory->expects($this->never())->method('create');

        $plugin = new PreserveShippingExtensionAttributes($factory, [
            'parcel_point_id' => [
                'column' => 'parcel_point_id',
                'shipping_method_needles' => ['dpd_pickup'],
            ],
        ]);

        $shippingAddress = $this->createMock(QuoteAddress::class);
        $shippingAddress->method('getShippingMethod')->willReturn('flatrate_flatrate');

        $quote = $this->getMockBuilder(Quote::class)
            ->disableOriginalConstructor()
            ->onlyMethods([
                'isVirtual',
                'getId',
                'getExtensionAttributes',
                'getData',
                'getResource',
                'getShippingAddress',
            ])
            ->getMock();
        $quote->method('isVirtual')->willReturn(false);
        $quote->method('getId')->willReturn(5);
        $quote->method('getExtensionAttributes')->willReturn(null);
        $quote->method('getData')->willReturn(null);
        $quote->method('getShippingAddress')->willReturn($shippingAddress);
        $quote->expects($this->never())->method('getResource');

        $repository = $this->createMock(CartRepositoryInterface::class);
        $this->assertSame([$quote], $plugin->beforeSave($repository, $quote));
    }

    public function testCompoundNeedleRequiresBothParts(): void
    {
        $factory = $this->createMock(CartExtensionFactory::class);
        $factory->expects($this->never())->method('create');

        $plugin = new PreserveShippingExtensionAttributes($factory, [
            'inpost_locker_id' => [
                'column' => 'inpost_locker_id',
                'shipping_method_needles' => ['inpost&&locker'],
            ],
        ]);

        $shippingAddress = $this->createMock(QuoteAddress::class);
        // Has inpost but not locker — must not hit DB.
        $shippingAddress->method('getShippingMethod')->willReturn('inpost_courier');

        $quote = $this->getMockBuilder(Quote::class)
            ->disableOriginalConstructor()
            ->onlyMethods([
                'isVirtual',
                'getId',
                'getExtensionAttributes',
                'getData',
                'getResource',
                'getShippingAddress',
            ])
            ->getMock();
        $quote->method('isVirtual')->willReturn(false);
        $quote->method('getId')->willReturn(6);
        $quote->method('getExtensionAttributes')->willReturn(null);
        $quote->method('getData')->willReturn(null);
        $quote->method('getShippingAddress')->willReturn($shippingAddress);
        $quote->expects($this->never())->method('getResource');

        $repository = $this->createMock(CartRepositoryInterface::class);
        $this->assertSame([$quote], $plugin->beforeSave($repository, $quote));
    }
}
