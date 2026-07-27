<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Observer;

use Kkkonrad\Fastcheckout\Helper\Data as Helper;
use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Customer\Api\CustomerRepositoryInterface;
use Magento\Customer\Api\Data\CustomerInterface;
use Magento\Downloadable\Model\Link\PurchasedFactory;
use Magento\Framework\Event\Observer;
use Magento\Framework\Event\ObserverInterface;
use Magento\Framework\Exception\NoSuchEntityException;
use Magento\Framework\App\ObjectManager;
use Magento\Newsletter\Model\SubscriberFactory;
use Magento\Sales\Api\OrderRepositoryInterface;
use Magento\Sales\Model\Order;
use Magento\Sales\Model\Order\Status\HistoryFactory;
use Psr\Log\LoggerInterface;

/**
 * After successful quote submit:
 * - optionally attach guest order to existing customer matched by email (website scope);
 * - persist Fastcheckout order comment from checkout session;
 * - subscribe guest/customer to newsletter when Fastcheckout checkbox was checked;
 * - re-point downloadable purchased links to that customer when assignment happened.
 *
 * Does not re-run Magento Downloadable place-order observers (would duplicate links).
 * Does not log the shopper in.
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

    /** @var CustomerRepositoryInterface */
    private $customerRepository;

    /** @var OrderRepositoryInterface */
    private $orderRepository;

    /** @var PurchasedFactory|null */
    private $downloadLinkFactory;

    /** @var SubscriberFactory|null */
    private $subscriberFactory;

    public function __construct(
        Helper $helper,
        CheckoutSession $checkoutSession,
        HistoryFactory $historyFactory,
        LoggerInterface $logger,
        CustomerRepositoryInterface $customerRepository,
        OrderRepositoryInterface $orderRepository,
        ?PurchasedFactory $downloadLinkFactory = null,
        ?SubscriberFactory $subscriberFactory = null
    ) {
        $this->helper = $helper;
        $this->checkoutSession = $checkoutSession;
        $this->historyFactory = $historyFactory;
        $this->logger = $logger;
        $this->customerRepository = $customerRepository;
        $this->orderRepository = $orderRepository;
        $this->downloadLinkFactory = $downloadLinkFactory;
        // Optional arg: resolve via OM when DI config is stale after deploy.
        $this->subscriberFactory = $subscriberFactory
            ?: ObjectManager::getInstance()->get(SubscriberFactory::class);
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

        $this->assignOrderToExistingCustomerByEmail($order);
        $this->saveComment($order);
        $this->subscribeToNewsletter($order);

        return $this;
    }

    /**
     * Guest checkout with an email that already belongs to a customer on this website:
     * link the order (and addresses / downloadable links) to that account.
     */
    private function assignOrderToExistingCustomerByEmail(Order $order): void
    {
        if (!$this->helper->isAssignOrderToCustomer()) {
            return;
        }

        if ($order->getCustomerId()) {
            return;
        }

        $customerEmail = trim((string)$order->getCustomerEmail());
        if ($customerEmail === '') {
            return;
        }

        try {
            $websiteId = (int)$order->getStore()->getWebsiteId();
            $customer = $this->customerRepository->get($customerEmail, $websiteId);
        } catch (NoSuchEntityException $exception) {
            return;
        } catch (\Throwable $exception) {
            $this->logger->error(
                'Fastcheckout QuoteSubmitSuccess customer lookup error: ' . $exception->getMessage(),
                ['exception' => $exception, 'order_id' => $order->getEntityId()]
            );
            return;
        }

        if (!$customer || !$customer->getId()) {
            return;
        }

        $this->assignOrderToCustomer($order, $customer);
    }

    private function assignOrderToCustomer(Order $order, CustomerInterface $customer): void
    {
        $customerId = (int)$customer->getId();
        if ($customerId <= 0 || $order->getCustomerId()) {
            return;
        }

        try {
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

            $this->orderRepository->save($order);
            $this->reassignDownloadableLinks($order, $customerId);
        } catch (\Throwable $exception) {
            $this->logger->error(
                'Fastcheckout could not assign guest order to customer: ' . $exception->getMessage(),
                [
                    'exception' => $exception,
                    'order_id' => $order->getEntityId(),
                    'customer_id' => $customerId,
                ]
            );
        }
    }

    /**
     * Update customer_id on already-created downloadable purchased records.
     * Does not invoke SaveDownloadableOrderItemObserver again.
     */
    private function reassignDownloadableLinks(Order $order, int $customerId): void
    {
        if ($this->downloadLinkFactory === null || $customerId <= 0) {
            return;
        }

        try {
            foreach ($order->getAllItems() as $item) {
                if ((string)$item->getProductType() !== 'downloadable') {
                    continue;
                }

                $link = $this->downloadLinkFactory->create()->load($item->getId(), 'order_item_id');
                if ($link && $link->getId() && (int)$link->getCustomerId() !== $customerId) {
                    $link->setCustomerId($customerId);
                    $link->save();
                }
            }
        } catch (\Throwable $exception) {
            $this->logger->error(
                'Fastcheckout could not reassign downloadable links: ' . $exception->getMessage(),
                ['exception' => $exception, 'order_id' => $order->getEntityId()]
            );
        }
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
        if ($email === '' || $this->subscriberFactory === null) {
            $this->clearSubscribeFlag();
            return;
        }

        try {
            $this->subscriberFactory->create()->subscribe($email);
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
            if (method_exists($this->checkoutSession, 'unsFastcheckoutSubscribe')) {
                $this->checkoutSession->unsFastcheckoutSubscribe();
            } else {
                $this->checkoutSession->setFastcheckoutSubscribe(null);
            }
        } catch (\Throwable $exception) {
            // ignore session cleanup errors
        }
    }
}
