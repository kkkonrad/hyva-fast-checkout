<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Test\Unit\Observer;

use Kkkonrad\Fastcheckout\Helper\Data as Helper;
use Kkkonrad\Fastcheckout\Observer\QuoteSubmitBefore;
use Magento\Customer\Api\CustomerRepositoryInterface;
use Magento\Customer\Api\Data\CustomerInterface;
use Magento\Framework\Event;
use Magento\Framework\Event\Observer;
use Magento\Framework\Exception\NoSuchEntityException;
use Magento\Sales\Model\Order;
use Magento\Sales\Model\Order\Address as OrderAddress;
use Magento\Store\Api\Data\StoreInterface;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class QuoteSubmitBeforeTest extends TestCase
{
    /** @var Helper&MockObject */
    private $helper;

    /** @var CustomerRepositoryInterface&MockObject */
    private $customerRepository;

    /** @var LoggerInterface&MockObject */
    private $logger;

    protected function setUp(): void
    {
        $this->helper = $this->createMock(Helper::class);
        $this->customerRepository = $this->createMock(CustomerRepositoryInterface::class);
        $this->logger = $this->createMock(LoggerInterface::class);
    }

    /**
     * The order is still unsaved here, so assignment must never reach a repository.
     * Magento writes it once during place(), already carrying the customer id.
     */
    public function testObserverHasNoOrderRepositoryDependency(): void
    {
        $parameters = (new \ReflectionMethod(QuoteSubmitBefore::class, '__construct'))->getParameters();
        $types = array_map(
            static function (\ReflectionParameter $parameter): string {
                $type = $parameter->getType();

                return $type instanceof \ReflectionNamedType ? $type->getName() : '';
            },
            $parameters
        );

        $this->assertNotContains(\Magento\Sales\Api\OrderRepositoryInterface::class, $types);
    }

    public function testGuestOrderIsNotAssignedWhenConfigDisabled(): void
    {
        $order = $this->createOrderMock();
        $order->method('getCustomerId')->willReturn(null);
        $order->expects($this->never())->method('setCustomerId');

        $this->helper->method('isEnable')->willReturn(true);
        $this->helper->method('isAssignOrderToCustomer')->willReturn(false);
        $this->customerRepository->expects($this->never())->method('get');

        $this->createObserver()->execute($this->eventFor($order));
    }

    public function testGuestOrderIsNotAssignedWhenModuleDisabled(): void
    {
        $order = $this->createOrderMock();
        $order->expects($this->never())->method('setCustomerId');

        $this->helper->method('isEnable')->willReturn(false);
        $this->customerRepository->expects($this->never())->method('get');

        $this->createObserver()->execute($this->eventFor($order));
    }

    public function testGuestOrderIsAssignedWhenEmailMatchesExistingCustomer(): void
    {
        $store = $this->createMock(StoreInterface::class);
        $store->method('getWebsiteId')->willReturn(1);

        $billing = $this->createMock(OrderAddress::class);
        $billing->expects($this->once())->method('setCustomerId')->with(99);
        $shipping = $this->createMock(OrderAddress::class);
        $shipping->expects($this->once())->method('setCustomerId')->with(99);

        $order = $this->createOrderMock([
            'getStore',
            'getBillingAddress',
            'getShippingAddress',
            'setCustomerFirstname',
            'setCustomerLastname',
        ]);
        $order->method('getCustomerId')->willReturn(null);
        $order->method('getCustomerEmail')->willReturn('  existing@example.com ');
        $order->method('getStore')->willReturn($store);
        $order->method('getBillingAddress')->willReturn($billing);
        $order->method('getShippingAddress')->willReturn($shipping);

        $order->expects($this->once())->method('setCustomerId')->with(99);
        $order->expects($this->once())->method('setCustomerGroupId')->with(3);
        $order->expects($this->once())->method('setCustomerIsGuest')->with(0);
        $order->expects($this->once())->method('setCustomerFirstname')->with('Ada');
        $order->expects($this->once())->method('setCustomerLastname')->with('Lovelace');

        $customer = $this->createMock(CustomerInterface::class);
        $customer->method('getId')->willReturn(99);
        $customer->method('getGroupId')->willReturn(3);
        $customer->method('getFirstname')->willReturn('Ada');
        $customer->method('getLastname')->willReturn('Lovelace');

        $this->helper->method('isEnable')->willReturn(true);
        $this->helper->method('isAssignOrderToCustomer')->willReturn(true);
        $this->customerRepository->expects($this->once())
            ->method('get')
            ->with('existing@example.com', 1)
            ->willReturn($customer);

        $this->createObserver()->execute($this->eventFor($order));
    }

    public function testNoAssignmentWhenCustomerEmailNotFound(): void
    {
        $store = $this->createMock(StoreInterface::class);
        $store->method('getWebsiteId')->willReturn(1);

        $order = $this->createOrderMock(['getStore']);
        $order->method('getCustomerId')->willReturn(null);
        $order->method('getCustomerEmail')->willReturn('unknown@example.com');
        $order->method('getStore')->willReturn($store);
        $order->expects($this->never())->method('setCustomerId');

        $this->helper->method('isEnable')->willReturn(true);
        $this->helper->method('isAssignOrderToCustomer')->willReturn(true);
        $this->customerRepository->method('get')->willThrowException(new NoSuchEntityException(__('no')));

        $this->createObserver()->execute($this->eventFor($order));
    }

    public function testDoesNotOverrideOrderThatAlreadyHasCustomerId(): void
    {
        $order = $this->createOrderMock();
        $order->method('getCustomerId')->willReturn(7);
        $order->expects($this->never())->method('getCustomerEmail');
        $order->expects($this->never())->method('setCustomerId');

        $this->helper->method('isEnable')->willReturn(true);
        $this->helper->method('isAssignOrderToCustomer')->willReturn(true);
        $this->customerRepository->expects($this->never())->method('get');

        $this->createObserver()->execute($this->eventFor($order));
    }

    private function createObserver(): QuoteSubmitBefore
    {
        return new QuoteSubmitBefore(
            $this->helper,
            $this->customerRepository,
            $this->logger
        );
    }

    private function eventFor(Order $order): Observer
    {
        return new Observer(['event' => new Event(['order' => $order])]);
    }

    /**
     * @param list<string> $extraMethods
     * @return Order&MockObject
     */
    private function createOrderMock(array $extraMethods = []): Order
    {
        $methods = array_values(array_unique(array_merge([
            'getCustomerId',
            'getCustomerEmail',
            'setCustomerId',
            'setCustomerIsGuest',
            'setCustomerGroupId',
        ], $extraMethods)));

        return $this->getMockBuilder(Order::class)
            ->disableOriginalConstructor()
            ->onlyMethods($methods)
            ->getMock();
    }
}
