<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Test\Unit\Plugin\Quote;

use Kkkonrad\Fastcheckout\Plugin\Quote\PreserveInpostLocker;
use Magento\Quote\Api\CartRepositoryInterface;
use Magento\Quote\Api\Data\CartExtensionFactory;
use Magento\Quote\Api\Data\CartExtensionInterface;
use Magento\Quote\Model\Quote;
use Magento\Quote\Model\Quote\Address as QuoteAddress;
use PHPUnit\Framework\TestCase;

class PreserveInpostLockerTest extends TestCase
{
    protected function setUp(): void
    {
        // Reset per-request lookup cache between tests (static property).
        $reflection = new \ReflectionClass(PreserveInpostLocker::class);
        $property = $reflection->getProperty('lockerLookupCache');
        $property->setAccessible(true);
        $property->setValue(null, []);
    }

    public function testSkipsVirtualQuotes(): void
    {
        $factory = $this->createMock(CartExtensionFactory::class);
        $factory->expects($this->never())->method('create');
        $plugin = new PreserveInpostLocker($factory);

        $quote = $this->createMock(Quote::class);
        $quote->method('isVirtual')->willReturn(true);
        $quote->expects($this->never())->method('getId');

        $repository = $this->createMock(CartRepositoryInterface::class);
        $this->assertSame([$quote], $plugin->beforeSave($repository, $quote));
    }

    public function testSkipsWhenLockerAlreadyOnQuote(): void
    {
        $factory = $this->createMock(CartExtensionFactory::class);
        $factory->expects($this->never())->method('create');
        $plugin = new PreserveInpostLocker($factory);

        $quote = $this->getMockBuilder(Quote::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['isVirtual', 'getId', 'getExtensionAttributes', 'getData', 'getResource', 'getShippingAddress'])
            ->getMock();
        $quote->method('isVirtual')->willReturn(false);
        $quote->method('getId')->willReturn(10);
        $quote->method('getExtensionAttributes')->willReturn(null);
        $quote->method('getData')->with('inpost_locker_id')->willReturn('KRA01A');
        $quote->expects($this->never())->method('getResource');
        $quote->expects($this->never())->method('getShippingAddress');

        $repository = $this->createMock(CartRepositoryInterface::class);
        $this->assertSame([$quote], $plugin->beforeSave($repository, $quote));
    }

    public function testSkipsDbWhenShippingIsNotInpost(): void
    {
        $factory = $this->createMock(CartExtensionFactory::class);
        $factory->expects($this->never())->method('create');
        $plugin = new PreserveInpostLocker($factory);

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
        $quote->method('getId')->willReturn(11);
        $quote->method('getExtensionAttributes')->willReturn(null);
        $quote->method('getData')->with('inpost_locker_id')->willReturn(null);
        $quote->method('getShippingAddress')->willReturn($shippingAddress);
        $quote->expects($this->never())->method('getResource');

        $repository = $this->createMock(CartRepositoryInterface::class);
        $this->assertSame([$quote], $plugin->beforeSave($repository, $quote));
    }

    public function testRestoresLockerFromDbForInpostMethod(): void
    {
        $extension = $this->getMockBuilder(CartExtensionInterface::class)
            ->addMethods(['setInpostLockerId', 'getInpostLockerId'])
            ->getMockForAbstractClass();
        $storedId = null;
        $extension->method('setInpostLockerId')->willReturnCallback(static function ($id) use (&$storedId, $extension) {
            $storedId = $id;
            return $extension;
        });
        $extension->method('getInpostLockerId')->willReturnCallback(static function () use (&$storedId) {
            return $storedId;
        });

        $factory = $this->createMock(CartExtensionFactory::class);
        $factory->expects($this->once())->method('create')->willReturn($extension);
        $plugin = new PreserveInpostLocker($factory);

        $shippingAddress = $this->createMock(QuoteAddress::class);
        $shippingAddress->method('getShippingMethod')->willReturn('inpostlocker_standard');

        $select = $this->getMockBuilder(\stdClass::class)
            ->addMethods(['from', 'where'])
            ->getMock();
        $select->method('from')->willReturnSelf();
        $select->method('where')->willReturnSelf();

        $connection = $this->getMockBuilder(\stdClass::class)
            ->addMethods(['select', 'fetchOne'])
            ->getMock();
        $connection->method('select')->willReturn($select);
        $connection->expects($this->once())->method('fetchOne')->willReturn('WAW02B');

        $resource = $this->getMockBuilder(\stdClass::class)
            ->addMethods(['getConnection', 'getTable'])
            ->getMock();
        $resource->method('getConnection')->willReturn($connection);
        $resource->method('getTable')->with('quote')->willReturn('quote');

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
        $quote->method('getId')->willReturn(12);
        $quote->method('getExtensionAttributes')->willReturn(null);
        $quote->method('getData')->with('inpost_locker_id')->willReturn(null);
        $quote->method('getShippingAddress')->willReturn($shippingAddress);
        $quote->method('getResource')->willReturn($resource);
        $quote->expects($this->once())->method('setExtensionAttributes')->with($extension);
        $quote->expects($this->once())->method('setData')->with('inpost_locker_id', 'WAW02B');

        $repository = $this->createMock(CartRepositoryInterface::class);
        $this->assertSame([$quote], $plugin->beforeSave($repository, $quote));
        $this->assertSame('WAW02B', $extension->getInpostLockerId());
    }

    public function testUsesRequestCacheForSecondSave(): void
    {
        $extension = $this->getMockBuilder(CartExtensionInterface::class)
            ->addMethods(['setInpostLockerId', 'getInpostLockerId'])
            ->getMockForAbstractClass();
        $extension->method('setInpostLockerId')->willReturnSelf();

        $factory = $this->createMock(CartExtensionFactory::class);
        $factory->method('create')->willReturn($extension);
        $plugin = new PreserveInpostLocker($factory);

        $shippingAddress = $this->createMock(QuoteAddress::class);
        $shippingAddress->method('getShippingMethod')->willReturn('inpost_locker_standard');

        $select = $this->getMockBuilder(\stdClass::class)
            ->addMethods(['from', 'where'])
            ->getMock();
        $select->method('from')->willReturnSelf();
        $select->method('where')->willReturnSelf();

        $connection = $this->getMockBuilder(\stdClass::class)
            ->addMethods(['select', 'fetchOne'])
            ->getMock();
        $connection->method('select')->willReturn($select);
        $connection->expects($this->once())->method('fetchOne')->willReturn('GDN03C');

        $resource = $this->getMockBuilder(\stdClass::class)
            ->addMethods(['getConnection', 'getTable'])
            ->getMock();
        $resource->method('getConnection')->willReturn($connection);
        $resource->method('getTable')->willReturn('quote');

        $makeQuote = function () use ($shippingAddress, $resource) {
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
            $quote->method('getId')->willReturn(13);
            $quote->method('getExtensionAttributes')->willReturn(null);
            $quote->method('getData')->with('inpost_locker_id')->willReturn(null);
            $quote->method('getShippingAddress')->willReturn($shippingAddress);
            $quote->method('getResource')->willReturn($resource);
            $quote->method('setExtensionAttributes')->willReturnSelf();
            $quote->method('setData')->willReturnSelf();

            return $quote;
        };

        $repository = $this->createMock(CartRepositoryInterface::class);
        $plugin->beforeSave($repository, $makeQuote());
        $plugin->beforeSave($repository, $makeQuote());
    }
}
