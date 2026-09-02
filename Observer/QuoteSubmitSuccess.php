<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Observer;

use Kkkonrad\Fastcheckout\Helper\Data as Helper;
use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Framework\Event\Observer;
use Magento\Framework\Event\ObserverInterface;
use Magento\Newsletter\Model\SubscriptionManagerInterface;
use Magento\Sales\Api\OrderStatusHistoryRepositoryInterface;
use Magento\Sales\Model\Order;
use Psr\Log\LoggerInterface;

/**
 * After successful quote submit:
 * - persist the matching quote's Fastcheckout order comment from checkout session;
 * - subscribe guest/customer when that quote's Fastcheckout checkbox was checked.
 *
 * The native order/customer ownership remains unchanged.
 */
class QuoteSubmitSuccess implements ObserverInterface
{
    public function __construct(
        private Helper $helper,
        private CheckoutSession $checkoutSession,
        private OrderStatusHistoryRepositoryInterface $historyRepository,
        private LoggerInterface $logger,
        private SubscriptionManagerInterface $subscriptionManager
    ) {
    }

    /**
     * @return $this
     */
    public function execute(Observer $observer)
    {
        $order = $observer->getEvent()->getOrder();
        if (!$order instanceof Order || !$this->helper->isEnable()) {
            return $this;
        }

        $quoteId = (string)$this->checkoutSession->getFastcheckoutQuoteId();
        if ($quoteId === '' || $quoteId !== (string)$order->getQuoteId()) {
            return $this;
        }

        try {
            $this->saveComment($order);
            $this->subscribeToNewsletter($order);
        } finally {
            $this->clearExtras();
        }

        return $this;
    }

    private function saveComment(Order $order): void
    {
        if (!$this->helper->isShowComment()) {
            return;
        }

        $comment = trim((string)$this->checkoutSession->getFastcheckoutComment());
        if ($comment === '') {
            return;
        }

        try {
            $history = $order->addCommentToStatusHistory($comment, false, true);
            $history->setIsCustomerNotified(false);
            $this->historyRepository->save($history);
        } catch (\Throwable $exception) {
            $this->logger->error('Fastcheckout order comment could not be saved.', [
                'order_id' => $order->getEntityId(),
                'exception' => $exception,
            ]);
        }
    }

    /**
     * Subscribe using flag captured by PlaceOrderExtrasPlugin (native KO place-order).
     */
    private function subscribeToNewsletter(Order $order): void
    {
        if (!$this->helper->isShowSubscribe()) {
            return;
        }

        $flag = $this->checkoutSession->getFastcheckoutSubscribe();
        if ($flag === null || (int)$flag !== 1) {
            return;
        }

        $email = trim((string)$order->getCustomerEmail());
        if ($email === '') {
            return;
        }

        try {
            $this->subscriptionManager->subscribe($email, (int)$order->getStoreId());
        } catch (\Throwable $exception) {
            // Never block order success on newsletter failures.
            $this->logger->warning('Fastcheckout newsletter subscribe failed.', [
                'order_id' => $order->getEntityId(),
                'email' => $email,
                'exception' => $exception,
            ]);
        }
    }

    private function clearExtras(): void
    {
        foreach ([
            'unsFastcheckoutComment',
            'unsFastcheckoutSubscribe',
            'unsFastcheckoutQuoteId',
        ] as $method) {
            try {
                $this->checkoutSession->{$method}();
            } catch (\Throwable) {
                // Never block order success on session cleanup failures.
            }
        }
    }
}
