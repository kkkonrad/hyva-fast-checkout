<?php
namespace IWD\Opc\Observer\Sales;

use Magento\Framework\Event\Observer;
use Magento\Framework\Event\ObserverInterface;
use Magento\Quote\Model\QuoteRepository;
use Magento\Sales\Model\Order;
use Psr\Log\LoggerInterface;

class QuoteSubmitBefore implements ObserverInterface
{
    /**
     * @var LoggerInterface
     */
    private $logger;

    /**
     * @var QuoteRepository
     */
    private $quoteRepository;

    /**
     * QuoteSubmitBefore constructor.
     * @param QuoteRepository $quoteRepository
     * @param LoggerInterface $logger
     */
    public function __construct(
        QuoteRepository $quoteRepository,
        LoggerInterface $logger
    ) {
        $this->quoteRepository = $quoteRepository;
        $this->logger = $logger;
    }

    /**
     * Execute observer
     *
     * @param Observer $observer
     * @return void
     * @throws \Magento\Framework\Exception\NoSuchEntityException
     */
    public function execute(Observer $observer)
    {
        /** @var Order $order */
        $order = $observer->getOrder();

        $quote = $this->quoteRepository->get($order->getQuoteId());

        try {
            $this->orderBillingAddressFields($order, $quote);

            $this->orderShippingAddressFields($order, $quote);
        } catch (\Exception $e) {
            $this->logger->critical($e->getMessage());
        }
    }

    private function orderBillingAddressFields($order, $quote)
    {
        return $this;
    }

    /**
     * @param $order
     * @param $quote
     * @return $this
     */
    private function orderShippingAddressFields($order, $quote)
    {
        return $this;
    }
}
