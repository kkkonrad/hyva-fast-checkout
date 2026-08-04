<?php
declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Test\Unit\Plugin\Quote;

use Kkkonrad\Fastcheckout\Plugin\Quote\PreserveShippingExtensionAttributes;
use Magento\Framework\Api\ExtensionAttribute\Config as ExtensionAttributeConfig;
use Magento\Quote\Api\CartRepositoryInterface;
use Magento\Quote\Api\Data\AddressInterface;
use Magento\Quote\Api\Data\CartExtensionFactory;
use Magento\Quote\Api\Data\CartExtensionInterface;
use Magento\Quote\Api\Data\CartInterface;
use Magento\Quote\Model\Quote;
use Magento\Quote\Model\Quote\Address as QuoteAddress;
use PHPUnit\Framework\TestCase;

class PreserveShippingExtensionAttributesTest extends TestCase
{
    protected function setUp(): void
    {
        PreserveShippingExtensionAttributes::resetLookupCache();
    }

    public function testDiscoversCartExtensionAttributesWithoutDiWhitelist(): void
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

        $config = $this->createMock(ExtensionAttributeConfig::class);
        $config->method('get')->willReturn([
            CartInterface::class => [
                'parcel_point_id' => ['type' => 'string'],
                'shipping_assignments' => ['type' => 'Magento\Quote\Api\Data\ShippingAssignmentInterface[]'],
            ],
        ]);

        // Empty DI attributes — pure discovery.
        $plugin = new PreserveShippingExtensionAttributes($factory, $config, []);

        $select = $this->getMockBuilder(\stdClass::class)->addMethods(['from', 'where'])->getMock();
        $select->method('from')->willReturnSelf();
        $select->method('where')->willReturnSelf();

        $connection = $this->getMockBuilder(\stdClass::class)
            ->addMethods(['select', 'fetchOne', 'tableColumnExists'])
            ->getMock();
        $connection->method('select')->willReturn($select);
        $connection->method('tableColumnExists')->willReturnCallback(
            static function ($table, $column) {
                return $column === 'parcel_point_id';
            }
        );
        $connection->method('fetchOne')->willReturn('POINT-99');

        $resource = $this->getMockBuilder(\stdClass::class)
            ->addMethods(['getConnection', 'getTable'])
            ->getMock();
        $resource->method('getConnection')->willReturn($connection);
        $resource->method('getTable')->willReturnCallback(static function ($name) {
            return $name;
        });

        $shippingAddress = $this->createMock(QuoteAddress::class);
        $shippingAddress->method('getId')->willReturn(0);

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
        $quote->method('getId')->willReturn(50);
        $quote->method('getExtensionAttributes')->willReturn(null);
        $quote->method('getData')->willReturn(null);
        $quote->method('getShippingAddress')->willReturn($shippingAddress);
        $quote->method('getResource')->willReturn($resource);
        $quote->expects($this->once())->method('setData')->with('parcel_point_id', 'POINT-99');
        $quote->expects($this->once())->method('setExtensionAttributes')->with($extension);

        $repository = $this->createMock(CartRepositoryInterface::class);
        $this->assertSame([$quote], $plugin->beforeSave($repository, $quote));
        $this->assertSame('POINT-99', $stored);
    }

    public function testSkipsComplexExtensionAttributes(): void
    {
        $factory = $this->createMock(CartExtensionFactory::class);
        $factory->expects($this->never())->method('create');

        $config = $this->createMock(ExtensionAttributeConfig::class);
        $config->method('get')->willReturn([
            CartInterface::class => [
                'shipping_assignments' => [
                    'type' => 'Magento\Quote\Api\Data\ShippingAssignmentInterface[]',
                ],
            ],
        ]);

        $plugin = new PreserveShippingExtensionAttributes($factory, $config, []);

        $quote = $this->createMock(Quote::class);
        $quote->method('isVirtual')->willReturn(false);
        $quote->method('getId')->willReturn(1);
        $quote->method('getShippingAddress')->willReturn(null);
        $quote->method('getExtensionAttributes')->willReturn(null);
        $quote->expects($this->never())->method('getResource');

        $repository = $this->createMock(CartRepositoryInterface::class);
        $this->assertSame([$quote], $plugin->beforeSave($repository, $quote));
    }

    public function testRestoresShippingAddressExtensionAttribute(): void
    {
        $factory = $this->createMock(CartExtensionFactory::class);

        $config = $this->createMock(ExtensionAttributeConfig::class);
        $config->method('get')->willReturn([
            CartInterface::class => [],
            AddressInterface::class => [
                'pickup_location_code' => ['type' => 'string'],
            ],
        ]);

        $plugin = new PreserveShippingExtensionAttributes($factory, $config, []);

        $select = $this->getMockBuilder(\stdClass::class)->addMethods(['from', 'where'])->getMock();
        $select->method('from')->willReturnSelf();
        $select->method('where')->willReturnSelf();

        $connection = $this->getMockBuilder(\stdClass::class)
            ->addMethods(['select', 'fetchOne', 'tableColumnExists'])
            ->getMock();
        $connection->method('select')->willReturn($select);
        $connection->method('tableColumnExists')->willReturn(true);
        $connection->method('fetchOne')->willReturn('STORE001');

        $resource = $this->getMockBuilder(\stdClass::class)
            ->addMethods(['getConnection', 'getTable'])
            ->getMock();
        $resource->method('getConnection')->willReturn($connection);
        $resource->method('getTable')->willReturnCallback(static function ($name) {
            return $name;
        });

        $shippingAddress = $this->getMockBuilder(QuoteAddress::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['getId', 'getExtensionAttributes', 'getData', 'setData'])
            ->getMock();
        $shippingAddress->method('getId')->willReturn(77);
        $shippingAddress->method('getExtensionAttributes')->willReturn(null);
        $shippingAddress->method('getData')->willReturn(null);
        $shippingAddress->expects($this->once())->method('setData')->with('pickup_location_code', 'STORE001');

        $quote = $this->getMockBuilder(Quote::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['isVirtual', 'getId', 'getShippingAddress', 'getResource', 'getExtensionAttributes'])
            ->getMock();
        $quote->method('isVirtual')->willReturn(false);
        $quote->method('getId')->willReturn(10);
        $quote->method('getExtensionAttributes')->willReturn(null);
        $quote->method('getShippingAddress')->willReturn($shippingAddress);
        $quote->method('getResource')->willReturn($resource);

        $repository = $this->createMock(CartRepositoryInterface::class);
        $this->assertSame([$quote], $plugin->beforeSave($repository, $quote));
    }
}
