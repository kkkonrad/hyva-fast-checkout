<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Observer;

use Kkkonrad\Fastcheckout\Helper\Data as Helper;
use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Framework\Event\Observer;
use Magento\Framework\Event\ObserverInterface;
use Magento\Sales\Model\Order;
use Magento\Sales\Model\Order\Status\HistoryFactory;
use Psr\Log\LoggerInterface;

/**
 * Persists the optional Fastcheckout order comment.
 *
 * Guest orders must never be attached to an existing customer based only on an
 * email address. Magento also persists downloadable links through its own
 * sales_order_item_save_after observer, so this observer must not invoke that
 * workflow a second time.
 */
class QuoteSubmitSuccess implements ObserverInterface
{
    /** @var Helper */
    private $helper;

    /** @var CheckoutSession */
    private $checkoutSession;

    /** @var HistoryFactory */
    private $historyFactory;

    /** @var LoggerInterface */
    private $logger;

    public function __construct(
        Helper $helper,
        CheckoutSession $checkoutSession,
        HistoryFactory $historyFactory,
        LoggerInterface $logger
    ) {
        $this->helper = $helper;
        $this->checkoutSession = $checkoutSession;
        $this->historyFactory = $historyFactory;
        $this->logger = $logger;
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
            $history = $this->historyFactory->create();
            $history->setData('comment', $comment);
            $history->setData('parent_id', $order->getId());
            $history->setData('is_visible_on_front', 1);
            $history->setData('is_customer_notified', 0);
            $history->setData('entity_name', 'order');
            $history->setData('status', $order->getStatus());
            $history->save();
            $this->checkoutSession->unsFastcheckoutComment();
        } catch (\Throwable $exception) {
            $this->logger->error('Fastcheckout order comment could not be saved.', [
                'order_id' => $order->getEntityId(),
                'exception' => $exception,
            ]);
        }
    }
}
