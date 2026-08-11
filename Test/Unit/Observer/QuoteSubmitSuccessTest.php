<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Test\Unit\Observer;

use Kkkonrad\Fastcheckout\Helper\Data as Helper;
use Kkkonrad\Fastcheckout\Observer\QuoteSubmitSuccess;
use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Framework\Event;
use Magento\Framework\Event\Observer;
use Magento\Newsletter\Model\SubscriptionManagerInterface;
use Magento\Sales\Api\OrderStatusHistoryRepositoryInterface;
use Magento\Sales\Model\Order;
use Magento\Sales\Model\Order\Status\History;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class QuoteSubmitSuccessTest extends TestCase
{
    /** @var Helper&MockObject */
    private $helper;

    /** @var CheckoutSession&MockObject */
    private $checkoutSession;

    /** @var OrderStatusHistoryRepositoryInterface&MockObject */
    private $historyRepository;

    /** @var LoggerInterface&MockObject */
    private $logger;

    /** @var SubscriptionManagerInterface&MockObject */
    private $subscriptionManager;

    protected function setUp(): void
    {
        $this->helper = $this->createMock(Helper::class);
        $this->checkoutSession = $this->getMockBuilder(CheckoutSession::class)
            ->disableOriginalConstructor()
            ->addMethods([
                'getFastcheckoutComment',
                'unsFastcheckoutComment',
                'getFastcheckoutSubscribe',
                'unsFastcheckoutSubscribe',
                'setFastcheckoutSubscribe',
            ])
            ->getMock();
        $this->historyRepository = $this->createMock(OrderStatusHistoryRepositoryInterface::class);
        $this->logger = $this->createMock(LoggerInterface::class);
        $this->subscriptionManager = $this->createMock(SubscriptionManagerInterface::class);
    }

    public function testEnabledCommentIsPersistedAndRemovedFromSession(): void
    {
        $order = $this->createOrderMock();
        $this->helper->method('isEnable')->willReturn(true);
        $this->helper->method('isShowComment')->willReturn(true);
        $this->checkoutSession->method('getFastcheckoutComment')->willReturn('  Leave at reception  ');

        $history = $this->createMock(History::class);
        $order->expects($this->once())
            ->method('addCommentToStatusHistory')
            ->with('Leave at reception', false, true)
            ->willReturn($history);
        $history->expects($this->once())
            ->method('setIsCustomerNotified')
            ->with(false)
            ->willReturnSelf();
        $this->historyRepository->expects($this->once())->method('save')->with($history);
        $this->checkoutSession->expects($this->once())->method('unsFastcheckoutComment');

        $this->createObserver()->execute($this->eventFor($order));
    }

    public function testEmptyCommentDoesNotCreateHistory(): void
    {
        $order = $this->createOrderMock();
        $this->helper->method('isEnable')->willReturn(true);
        $this->helper->method('isShowComment')->willReturn(true);
        $this->checkoutSession->method('getFastcheckoutComment')->willReturn('   ');
        $this->historyRepository->expects($this->never())->method('save');

        $this->createObserver()->execute($this->eventFor($order));
    }

    public function testDisabledModuleDoesNothing(): void
    {
        $order = $this->createOrderMock();
        $this->helper->method('isEnable')->willReturn(false);
        $this->helper->expects($this->never())->method('isShowComment');
        $this->historyRepository->expects($this->never())->method('save');
        $this->subscriptionManager->expects($this->never())->method('subscribe');

        $this->createObserver()->execute($this->eventFor($order));
    }

    public function testNewsletterSubscribeWhenFlagSet(): void
    {
        $order = $this->createOrderMock(['getCustomerEmail', 'getEntityId', 'getStoreId']);
        $order->method('getCustomerEmail')->willReturn('guest@example.com');
        $order->method('getEntityId')->willReturn(55);
        $order->method('getStoreId')->willReturn(3);

        $this->helper->method('isEnable')->willReturn(true);
        $this->helper->method('isShowComment')->willReturn(false);
        $this->helper->method('isShowSubscribe')->willReturn(true);
        $this->checkoutSession->method('getFastcheckoutSubscribe')->willReturn(1);

        $this->subscriptionManager->expects($this->once())
            ->method('subscribe')
            ->with('guest@example.com', 3);
        $this->checkoutSession->expects($this->once())->method('unsFastcheckoutSubscribe');

        $this->createObserver()->execute($this->eventFor($order));
    }

    public function testNewsletterIsSkippedWhenFlagAbsent(): void
    {
        $order = $this->createOrderMock();

        $this->helper->method('isEnable')->willReturn(true);
        $this->helper->method('isShowComment')->willReturn(false);
        $this->helper->method('isShowSubscribe')->willReturn(true);
        $this->checkoutSession->method('getFastcheckoutSubscribe')->willReturn(null);
        $this->subscriptionManager->expects($this->never())->method('subscribe');
        $this->checkoutSession->expects($this->once())->method('unsFastcheckoutSubscribe');

        $this->createObserver()->execute($this->eventFor($order));
    }

    private function createObserver(): QuoteSubmitSuccess
    {
        return new QuoteSubmitSuccess(
            $this->helper,
            $this->checkoutSession,
            $this->historyRepository,
            $this->logger,
            $this->subscriptionManager
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
            'getCustomerEmail',
            'getStoreId',
            'addCommentToStatusHistory',
        ], $extraMethods)));

        return $this->getMockBuilder(Order::class)
            ->disableOriginalConstructor()
            ->onlyMethods($methods)
            ->getMock();
    }
}
