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

    protected function setUp(): void
    {
        $this->helper = $this->createMock(Helper::class);
        $this->checkoutSession = $this->getMockBuilder(CheckoutSession::class)
            ->disableOriginalConstructor()
            ->addMethods(['getFastcheckoutComment', 'unsFastcheckoutComment'])
            ->getMock();
        $this->historyFactory = $this->createMock(HistoryFactory::class);
        $this->logger = $this->createMock(LoggerInterface::class);
    }

    public function testGuestOrderIsNeverAssignedToCustomerByEmail(): void
    {
        $order = $this->createOrderMock();
        $order->expects($this->never())->method('setCustomerId');
        $order->expects($this->never())->method('setCustomerIsGuest');
        $order->expects($this->never())->method('setCustomerGroupId');
        $this->helper->method('isEnable')->willReturn(true);
        $this->helper->method('isShowComment')->willReturn(false);
        $this->historyFactory->expects($this->never())->method('create');

        $this->createObserver()->execute($this->eventFor($order));
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

    private function createObserver(): QuoteSubmitSuccess
    {
        return new QuoteSubmitSuccess(
            $this->helper,
            $this->checkoutSession,
            $this->historyFactory,
            $this->logger
        );
    }

    private function eventFor(Order $order): Observer
    {
        return new Observer(['event' => new Event(['order' => $order])]);
    }

    /** @return Order&MockObject */
    private function createOrderMock(): Order
    {
        return $this->getMockBuilder(Order::class)
            ->disableOriginalConstructor()
            ->onlyMethods([
                'getId',
                'getStatus',
                'getEntityId',
                'setCustomerId',
                'setCustomerIsGuest',
                'setCustomerGroupId',
            ])
            ->getMock();
    }
}
