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
 * - persist Fastcheckout order comment from checkout session;
 * - subscribe guest/customer to newsletter when Fastcheckout checkbox was checked.
 *
 * Attaching a guest order to an existing customer runs earlier, in
 * {@see QuoteSubmitBefore}, so the order is written only once and Magento's own
 * downloadable-link observers pick the customer id up on their own.
 *
 * Does not log the shopper in.
 */
class QuoteSubmitSuccess implements ObserverInterface
{
    /** @var Helper */
    private $helper;

    /** @var CheckoutSession */
    private $checkoutSession;

    /** @var OrderStatusHistoryRepositoryInterface */
    private $historyRepository;

    /** @var LoggerInterface */
    private $logger;

    /** @var SubscriptionManagerInterface */
    private $subscriptionManager;

    public function __construct(
        Helper $helper,
        CheckoutSession $checkoutSession,
        OrderStatusHistoryRepositoryInterface $historyRepository,
        LoggerInterface $logger,
        SubscriptionManagerInterface $subscriptionManager
    ) {
        $this->helper = $helper;
        $this->checkoutSession = $checkoutSession;
        $this->historyRepository = $historyRepository;
        $this->logger = $logger;
        $this->subscriptionManager = $subscriptionManager;
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

        $this->saveComment($order);
        $this->subscribeToNewsletter($order);

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
            $this->checkoutSession->unsFastcheckoutComment();
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
            $this->clearSubscribeFlag();
            return;
        }

        $flag = $this->checkoutSession->getFastcheckoutSubscribe();
        if ($flag === null || (int)$flag !== 1) {
            $this->clearSubscribeFlag();
            return;
        }

        $email = trim((string)$order->getCustomerEmail());
        if ($email === '') {
            $this->clearSubscribeFlag();
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

        $this->clearSubscribeFlag();
    }

    private function clearSubscribeFlag(): void
    {
        try {
            $this->checkoutSession->unsFastcheckoutSubscribe();
        } catch (\Throwable $exception) {
            // ignore session cleanup errors
        }
    }
}
