<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Test\Unit\Observer;

use Kkkonrad\Fastcheckout\Helper\Data as Helper;
use Kkkonrad\Fastcheckout\Observer\QuoteSubmitSuccess;
use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Customer\Api\CustomerRepositoryInterface;
use Magento\Customer\Api\Data\CustomerInterface;
use Magento\Downloadable\Model\Link\Purchased;
use Magento\Downloadable\Model\Link\PurchasedFactory;
use Magento\Framework\Event;
use Magento\Framework\Event\Observer;
use Magento\Framework\Exception\NoSuchEntityException;
use Magento\Sales\Api\OrderRepositoryInterface;
use Magento\Sales\Model\Order;
use Magento\Sales\Model\Order\Address as OrderAddress;
use Magento\Sales\Model\Order\Item as OrderItem;
use Magento\Sales\Model\Order\Status\History;
use Magento\Sales\Model\Order\Status\HistoryFactory;
use Magento\Store\Api\Data\StoreInterface;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class QuoteSubmitSuccessTest extends TestCase
{
    /** @var Helper&MockObject */
    private $helper;

    /** @var CheckoutSession&MockObject */
    private $checkoutSession;

    /** @var HistoryFactory&MockObject */
    private $historyFactory;

    /** @var LoggerInterface&MockObject */
    private $logger;

    /** @var CustomerRepositoryInterface&MockObject */
    private $customerRepository;

    /** @var OrderRepositoryInterface&MockObject */
    private $orderRepository;

    /** @var PurchasedFactory&MockObject */
    private $downloadLinkFactory;

    protected function setUp(): void
    {
        $this->helper = $this->createMock(Helper::class);
        $this->checkoutSession = $this->getMockBuilder(CheckoutSession::class)
            ->disableOriginalConstructor()
            ->addMethods(['getFastcheckoutComment', 'unsFastcheckoutComment'])
            ->getMock();
        $this->historyFactory = $this->createMock(HistoryFactory::class);
        $this->logger = $this->createMock(LoggerInterface::class);
        $this->customerRepository = $this->createMock(CustomerRepositoryInterface::class);
        $this->orderRepository = $this->createMock(OrderRepositoryInterface::class);
        $this->downloadLinkFactory = $this->createMock(PurchasedFactory::class);
    }

    public function testGuestOrderIsNotAssignedWhenConfigDisabled(): void
    {
        $order = $this->createOrderMock();
        $order->method('getCustomerId')->willReturn(null);
        $order->method('getCustomerEmail')->willReturn('existing@example.com');
        $order->expects($this->never())->method('setCustomerId');
        $this->helper->method('isEnable')->willReturn(true);
        $this->helper->method('isAssignOrderToCustomer')->willReturn(false);
        $this->helper->method('isShowComment')->willReturn(false);
        $this->customerRepository->expects($this->never())->method('get');
        $this->orderRepository->expects($this->never())->method('save');
        $this->historyFactory->expects($this->never())->method('create');

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
            'getCustomerId',
            'getCustomerEmail',
            'getStore',
            'getBillingAddress',
            'getShippingAddress',
            'getAllItems',
            'setCustomerId',
            'setCustomerGroupId',
            'setCustomerIsGuest',
            'setCustomerFirstname',
            'setCustomerLastname',
        ]);
        $order->method('getCustomerId')->willReturn(null);
        $order->method('getCustomerEmail')->willReturn('  existing@example.com ');
        $order->method('getStore')->willReturn($store);
        $order->method('getBillingAddress')->willReturn($billing);
        $order->method('getShippingAddress')->willReturn($shipping);
        $order->method('getAllItems')->willReturn([]);

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
        $this->helper->method('isShowComment')->willReturn(false);
        $this->customerRepository->expects($this->once())
            ->method('get')
            ->with('existing@example.com', 1)
            ->willReturn($customer);
        $this->orderRepository->expects($this->once())->method('save')->with($order);

        $this->createObserver()->execute($this->eventFor($order));
    }

    public function testNoAssignmentWhenCustomerEmailNotFound(): void
    {
        $store = $this->createMock(StoreInterface::class);
        $store->method('getWebsiteId')->willReturn(1);

        $order = $this->createOrderMock(['getCustomerId', 'getCustomerEmail', 'getStore', 'setCustomerId']);
        $order->method('getCustomerId')->willReturn(null);
        $order->method('getCustomerEmail')->willReturn('unknown@example.com');
        $order->method('getStore')->willReturn($store);
        $order->expects($this->never())->method('setCustomerId');

        $this->helper->method('isEnable')->willReturn(true);
        $this->helper->method('isAssignOrderToCustomer')->willReturn(true);
        $this->helper->method('isShowComment')->willReturn(false);
        $this->customerRepository->method('get')->willThrowException(new NoSuchEntityException(__('no')));
        $this->orderRepository->expects($this->never())->method('save');

        $this->createObserver()->execute($this->eventFor($order));
    }

    public function testDoesNotOverrideOrderThatAlreadyHasCustomerId(): void
    {
        $order = $this->createOrderMock(['getCustomerId', 'getCustomerEmail', 'setCustomerId']);
        $order->method('getCustomerId')->willReturn(7);
        $order->expects($this->never())->method('getCustomerEmail');
        $order->expects($this->never())->method('setCustomerId');

        $this->helper->method('isEnable')->willReturn(true);
        $this->helper->method('isAssignOrderToCustomer')->willReturn(true);
        $this->helper->method('isShowComment')->willReturn(false);
        $this->customerRepository->expects($this->never())->method('get');

        $this->createObserver()->execute($this->eventFor($order));
    }

    public function testDownloadableLinksAreReassignedToCustomer(): void
    {
        $store = $this->createMock(StoreInterface::class);
        $store->method('getWebsiteId')->willReturn(1);

        $item = $this->createMock(OrderItem::class);
        $item->method('getProductType')->willReturn('downloadable');
        $item->method('getId')->willReturn(55);

        $link = $this->getMockBuilder(Purchased::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['load', 'getId', 'save'])
            ->addMethods(['getCustomerId', 'setCustomerId'])
            ->getMock();
        $link->method('load')->with(55, 'order_item_id')->willReturnSelf();
        $link->method('getId')->willReturn(12);
        $link->method('getCustomerId')->willReturn(0);
        $link->expects($this->once())->method('setCustomerId')->with(42)->willReturnSelf();
        $link->expects($this->once())->method('save')->willReturnSelf();
        $this->downloadLinkFactory->method('create')->willReturn($link);

        $order = $this->createOrderMock([
            'getCustomerId',
            'getCustomerEmail',
            'getStore',
            'getBillingAddress',
            'getShippingAddress',
            'getAllItems',
            'setCustomerId',
            'setCustomerGroupId',
            'setCustomerIsGuest',
            'setCustomerFirstname',
            'setCustomerLastname',
        ]);
        $order->method('getCustomerId')->willReturn(null);
        $order->method('getCustomerEmail')->willReturn('dl@example.com');
        $order->method('getStore')->willReturn($store);
        $order->method('getBillingAddress')->willReturn(null);
        $order->method('getShippingAddress')->willReturn(null);
        $order->method('getAllItems')->willReturn([$item]);
        $order->method('setCustomerId')->willReturnSelf();
        $order->method('setCustomerGroupId')->willReturnSelf();
        $order->method('setCustomerIsGuest')->willReturnSelf();
        $order->method('setCustomerFirstname')->willReturnSelf();
        $order->method('setCustomerLastname')->willReturnSelf();

        $customer = $this->createMock(CustomerInterface::class);
        $customer->method('getId')->willReturn(42);
        $customer->method('getGroupId')->willReturn(1);
        $customer->method('getFirstname')->willReturn('D');
        $customer->method('getLastname')->willReturn('L');

        $this->helper->method('isEnable')->willReturn(true);
        $this->helper->method('isAssignOrderToCustomer')->willReturn(true);
        $this->helper->method('isShowComment')->willReturn(false);
        $this->customerRepository->method('get')->willReturn($customer);
        $this->orderRepository->expects($this->once())->method('save')->with($order);

        $this->createObserver()->execute($this->eventFor($order));
    }

    public function testEnabledCommentIsPersistedAndRemovedFromSession(): void
    {
        $order = $this->createOrderMock();
        $order->method('getId')->willReturn(42);
        $order->method('getStatus')->willReturn('processing');
        $order->method('getCustomerId')->willReturn(1);
        $this->helper->method('isEnable')->willReturn(true);
        $this->helper->method('isAssignOrderToCustomer')->willReturn(true);
        $this->helper->method('isShowComment')->willReturn(true);
        $this->checkoutSession->method('getFastcheckoutComment')->willReturn('  Leave at reception  ');

        $history = $this->createMock(History::class);
        $historyData = [];
        $history->expects($this->exactly(6))
            ->method('setData')
            ->willReturnCallback(function ($key, $value) use (&$historyData, $history) {
                $historyData[$key] = $value;
                return $history;
            });
        $history->expects($this->once())->method('save')->willReturnSelf();
        $this->historyFactory->method('create')->willReturn($history);
        $this->checkoutSession->expects($this->once())->method('unsFastcheckoutComment');

        $this->createObserver()->execute($this->eventFor($order));

        $this->assertSame([
            'comment' => 'Leave at reception',
            'parent_id' => 42,
            'is_visible_on_front' => 1,
            'is_customer_notified' => 0,
            'entity_name' => 'order',
            'status' => 'processing',
        ], $historyData);
    }

    public function testEmptyCommentDoesNotCreateHistory(): void
    {
        $order = $this->createOrderMock();
        $order->method('getCustomerId')->willReturn(1);
        $this->helper->method('isEnable')->willReturn(true);
        $this->helper->method('isAssignOrderToCustomer')->willReturn(false);
        $this->helper->method('isShowComment')->willReturn(true);
        $this->checkoutSession->method('getFastcheckoutComment')->willReturn('   ');
        $this->historyFactory->expects($this->never())->method('create');

        $this->createObserver()->execute($this->eventFor($order));
    }

    private function createObserver(): QuoteSubmitSuccess
    {
        return new QuoteSubmitSuccess(
            $this->helper,
            $this->checkoutSession,
            $this->historyFactory,
            $this->logger,
            $this->customerRepository,
            $this->orderRepository,
            $this->downloadLinkFactory
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
            'getId',
            'getStatus',
            'getEntityId',
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
