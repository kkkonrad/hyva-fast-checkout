<?php

namespace IWD\Opc\Observer;

use Magento\Framework\Event\Observer;
use Magento\Framework\Event\ObserverInterface;
use IWD\Opc\Model\Order\SendOrderInformation as OrderInformation;


class TrackOrders implements ObserverInterface
{
    /**
     * @var OrderInformation
     */
    private $orderInformation;

    /**
     * @param OrderInformation $orderInformation
     */
    public function __construct(
        OrderInformation $orderInformation
    )
    {
        $this->orderInformation = $orderInformation;
    }

    /**
     * @param Observer $observer
     */
    public function execute(Observer $observer)
    {
        $order = $observer->getEvent()->getOrder();
        $this->orderInformation->sendOrderInformation($order);

    }
}
