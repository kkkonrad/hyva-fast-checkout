<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Test\Unit\Observer;

use Kkkonrad\Fastcheckout\Helper\Data as Helper;
use Kkkonrad\Fastcheckout\Observer\QuoteSubmitSuccess;
use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Framework\Event;
use Magento\Framework\Event\Observer;
use Magento\Sales\Model\Order;
use Magento\Sales\Model\Order\Status\History;
use Magento\Sales\Model\Order\Status\HistoryFactory;
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

    /** @var \Magento\Newsletter\Model\SubscriberFactory&MockObject */
    private $subscriberFactory;

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
        $this->historyFactory = $this->createMock(HistoryFactory::class);
        $this->logger = $this->createMock(LoggerInterface::class);
        $this->subscriberFactory = $this->getMockBuilder(\Magento\Newsletter\Model\SubscriberFactory::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['create'])
            ->getMock();
    }

    public function testEnabledCommentIsPersistedAndRemovedFromSession(): void
    {
        $order = $this->createOrderMock();
        $order->method('getId')->willReturn(42);
        $order->method('getStatus')->willReturn('processing');
        $this->helper->method('isEnable')->willReturn(true);
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
        $this->helper->method('isEnable')->willReturn(true);
        $this->helper->method('isShowComment')->willReturn(true);
        $this->checkoutSession->method('getFastcheckoutComment')->willReturn('   ');
        $this->historyFactory->expects($this->never())->method('create');

        $this->createObserver()->execute($this->eventFor($order));
    }

    public function testDisabledModuleDoesNothing(): void
    {
        $order = $this->createOrderMock();
        $this->helper->method('isEnable')->willReturn(false);
        $this->helper->expects($this->never())->method('isShowComment');
        $this->historyFactory->expects($this->never())->method('create');
        $this->subscriberFactory->expects($this->never())->method('create');

        $this->createObserver()->execute($this->eventFor($order));
    }

    public function testNewsletterSubscribeWhenFlagSet(): void
    {
        $order = $this->createOrderMock(['getCustomerEmail', 'getEntityId']);
        $order->method('getCustomerEmail')->willReturn('guest@example.com');
        $order->method('getEntityId')->willReturn(55);

        $this->helper->method('isEnable')->willReturn(true);
        $this->helper->method('isShowComment')->willReturn(false);
        $this->helper->method('isShowSubscribe')->willReturn(true);
        $this->checkoutSession->method('getFastcheckoutSubscribe')->willReturn(1);

        $subscriber = $this->getMockBuilder(\Magento\Newsletter\Model\Subscriber::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['subscribe'])
            ->getMock();
        $subscriber->expects($this->once())->method('subscribe')->with('guest@example.com');
        $this->subscriberFactory->expects($this->once())->method('create')->willReturn($subscriber);
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
        $this->subscriberFactory->expects($this->never())->method('create');
        $this->checkoutSession->expects($this->once())->method('unsFastcheckoutSubscribe');

        $this->createObserver()->execute($this->eventFor($order));
    }

    private function createObserver(): QuoteSubmitSuccess
    {
        return new QuoteSubmitSuccess(
            $this->helper,
            $this->checkoutSession,
            $this->historyFactory,
            $this->logger,
            $this->subscriberFactory
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
        ], $extraMethods)));

        return $this->getMockBuilder(Order::class)
            ->disableOriginalConstructor()
            ->onlyMethods($methods)
            ->getMock();
    }
}
