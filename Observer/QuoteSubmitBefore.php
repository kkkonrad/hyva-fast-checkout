<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Observer;

use Kkkonrad\Fastcheckout\Helper\Data as Helper;
use Magento\Customer\Api\CustomerRepositoryInterface;
use Magento\Customer\Api\Data\CustomerInterface;
use Magento\Framework\Event\Observer;
use Magento\Framework\Event\ObserverInterface;
use Magento\Framework\Exception\NoSuchEntityException;
use Magento\Sales\Model\Order;
use Psr\Log\LoggerInterface;

/**
 * Attach a guest order to an existing customer matched by email (website scope),
 * before the order is placed.
 *
 * Running here rather than on quote_submit_success means the order is written to the
 * database once, already carrying the customer id. Everything downstream sees it:
 * the confirmation email, the sales grid, and Magento's own
 * Downloadable\Observer\UpdateLinkPurchasedObserver, which assigns purchased links
 * on sales_order_save_after.
 *
 * Does not log the shopper in.
 */
class QuoteSubmitBefore implements ObserverInterface
{
    /** @var Helper */
    private $helper;

    /** @var CustomerRepositoryInterface */
    private $customerRepository;

    /** @var LoggerInterface */
    private $logger;

    public function __construct(
        Helper $helper,
        CustomerRepositoryInterface $customerRepository,
        LoggerInterface $logger
    ) {
        $this->helper = $helper;
        $this->customerRepository = $customerRepository;
        $this->logger = $logger;
    }

    /**
     * @return $this
     */
    public function execute(Observer $observer)
    {
        $order = $observer->getEvent()->getOrder();
        if (
            !$order instanceof Order
            || !$this->helper->isEnable()
            || !$this->helper->isAssignOrderToCustomer()
            || $order->getCustomerId()
        ) {
            return $this;
        }

        $customerEmail = trim((string)$order->getCustomerEmail());
        if ($customerEmail === '') {
            return $this;
        }

        try {
            $websiteId = (int)$order->getStore()->getWebsiteId();
            $customer = $this->customerRepository->get($customerEmail, $websiteId);
        } catch (NoSuchEntityException $exception) {
            return $this;
        } catch (\Throwable $exception) {
            $this->logger->error(
                'Fastcheckout QuoteSubmitBefore customer lookup error: ' . $exception->getMessage(),
                ['exception' => $exception]
            );
            return $this;
        }

        if ($customer && $customer->getId()) {
            $this->assignOrderToCustomer($order, $customer);
        }

        return $this;
    }

    private function assignOrderToCustomer(Order $order, CustomerInterface $customer): void
    {
        $customerId = (int)$customer->getId();
        if ($customerId <= 0) {
            return;
        }

        $order->setCustomerId($customerId);
        $order->setCustomerGroupId($customer->getGroupId());
        $order->setCustomerIsGuest(0);
        $order->setCustomerFirstname($customer->getFirstname());
        $order->setCustomerLastname($customer->getLastname());

        if ($order->getShippingAddress()) {
            $order->getShippingAddress()->setCustomerId($customerId);
        }
        if ($order->getBillingAddress()) {
            $order->getBillingAddress()->setCustomerId($customerId);
        }
    }
}
