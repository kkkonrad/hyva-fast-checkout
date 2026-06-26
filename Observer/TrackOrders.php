<?php

namespace Kkkonrad\Fastcheckout\Observer;

use Exception;
use Magento\Framework\Event\Observer;
use Magento\Framework\Event\ObserverInterface;
use Kkkonrad\Fastcheckout\Model\Order\SendOrderInformation as OrderInformation;

/**
 * Class TrackOrders
 *
 * This class implements the ObserverInterface and is responsible
 * for tracking orders and sending order information using OrderInformation class.
 *
 * @package Kkkonrad\Fastcheckout\Observer
 */
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
	) {
		$this->orderInformation = $orderInformation;
	}

	/**
	 * @param Observer $observer
	 */
	public function execute(Observer $observer)
	{
		try {
			$order = $observer->getEvent()->getOrder();

			$this->orderInformation->sendOrderInformation($order);
		} catch (Exception $e) {
			// Skip sending Order Information
		}
	}
}
