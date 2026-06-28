<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Observer;

use Kkkonrad\Fastcheckout\Helper\Data as Helper;
use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Customer\Api\CustomerRepositoryInterface;
use Magento\Customer\Model\CustomerFactory;
use Magento\Customer\Model\Session as CustomerSession;
use Magento\Downloadable\Model\Link\PurchasedFactory;
use Magento\Downloadable\Observer\SaveDownloadableOrderItemObserver;
use Magento\Framework\Encryption\EncryptorInterface as Encryptor;
use Magento\Framework\Event\Observer as EventObserver;
use Magento\Framework\Event\ObserverFactory as EventObserverFactory;
use Magento\Framework\EventFactory;
use Magento\Framework\Event\ObserverInterface;
use Magento\Framework\Exception\NoSuchEntityException;
use Magento\Sales\Api\OrderRepositoryInterface;
use Magento\Sales\Model\Order;
use Magento\Sales\Model\Order\Status\HistoryFactory;
use Magento\Store\Model\StoreManagerInterface;
use Psr\Log\LoggerInterface;

/**
 * Class QuoteSubmitSuccess
 */
class QuoteSubmitSuccess implements ObserverInterface
{
    /** @var Helper */
    public $helper;

    /** @var CustomerFactory */
    public $customerFactory;

    /** @var CheckoutSession */
    public $checkoutSession;

    /** @var HistoryFactory */
    public $historyFactory;

    /** @var LoggerInterface */
    public $logger;

    /** @var OrderRepositoryInterface */
    public $orderRepository;

    /** @var StoreManagerInterface */
    public $storeManager;

    /** @var Encryptor */
    public $encryptor;

    /** @var PurchasedFactory */
    public $downloadLink;

    /** @var CustomerSession */
    public $customerSession;

    /** @var SaveDownloadableOrderItemObserver */
    private $saveDownloadableOrderItemObserver;

    /** @var CustomerRepositoryInterface */
    private $customerRepository;

    /** @var EventObserverFactory */
    private $eventObserverFactory;

    /** @var EventFactory */
    private $eventFactory;

    public function __construct(
        Helper $helper,
        CustomerFactory $customerFactory,
        CheckoutSession $checkoutSession,
        HistoryFactory $historyFactory,
        LoggerInterface $logger,
        OrderRepositoryInterface $orderRepository,
        StoreManagerInterface $storeManager,
        Encryptor $encryptor,
        PurchasedFactory $downloadLink,
        CustomerSession $customerSession,
        SaveDownloadableOrderItemObserver $saveDownloadableOrderItemObserver,
        ?CustomerRepositoryInterface $customerRepository = null,
        ?EventObserverFactory $eventObserverFactory = null,
        ?EventFactory $eventFactory = null
    ) {
        $this->helper = $helper;
        $this->customerFactory = $customerFactory;
        $this->checkoutSession = $checkoutSession;
        $this->historyFactory = $historyFactory;
        $this->logger = $logger;
        $this->orderRepository = $orderRepository;
        $this->storeManager = $storeManager;
        $this->encryptor = $encryptor;
        $this->downloadLink = $downloadLink;
        $this->customerSession = $customerSession;
        $this->saveDownloadableOrderItemObserver = $saveDownloadableOrderItemObserver;
        $om = \Magento\Framework\App\ObjectManager::getInstance();
        $this->customerRepository = $customerRepository ?? $om->get(CustomerRepositoryInterface::class);
        $this->eventObserverFactory = $eventObserverFactory ?? $om->get(EventObserverFactory::class);
        $this->eventFactory = $eventFactory ?? $om->get(EventFactory::class);
    }

    /**
     * @param EventObserver $observer
     * @return $this
     */
    public function execute(EventObserver $observer)
    {
        /** @var Order $order */
        $order = $observer->getEvent()->getOrder();
        if (!$order || !$this->helper->isEnable()) {
            return $this;
        }

        $customerEmail = $order->getCustomerEmail();
        $customer = null;
        if ($customerEmail) {
            try {
                $customerData = $this->customerRepository->get($customerEmail, (int)$order->getStore()->getWebsiteId());
                if ($customerData && $customerData->getId()) {
                    $customer = $this->customerFactory->create()->load($customerData->getId());
                    $this->assignOrderToCustomer($order, $customer);
                }
            } catch (NoSuchEntityException $e) {
                // Customer not found by email
            } catch (\Exception $e) {
                $this->logger->error('Fastcheckout QuoteSubmitSuccess customer lookup error: ' . $e->getMessage());
            }
        }

        $this->saveComment($order);

        /* Assign Downloadable product links to Customer Account */
        $items = $order->getAllItems();
        foreach ($items as $item) {
            if ($item->getProductType() === 'downloadable') {
                $eventObserver = $this->eventObserverFactory->create();
                $event = $this->eventFactory->create()->setItem($item);
                $eventObserver->setEvent($event);

                $this->saveDownloadableOrderItemObserver->execute($eventObserver);

                if ($customer && $customer->getId()) {
                    $link = $this->downloadLink->create()->load($item->getId(), 'order_item_id');
                    if ($link && $link->getId()) {
                        $link->setCustomerId($customer->getId());
                        $link->save();
                    }
                }
            }
        }

        return $this;
    }

    /**
     * @param Order $order
     */
    private function saveComment(Order $order)
    {
        if ($this->helper->isShowComment()) {
            $comment = $this->checkoutSession->getFastcheckoutComment();
            if ($comment) {
                try {
                    $history = $this->historyFactory->create();
                    $history->setData('comment', $comment);
                    $history->setData('parent_id', $order->getId());
                    $history->setData('is_visible_on_front', 1);
                    $history->setData('is_customer_notified', 0);
                    $history->setData('entity_name', 'order');
                    $history->setData('status', $order->getStatus());
                    $history->save();
                } catch (\Exception $e) {
                    $this->logger->error($e->getMessage());
                }
            }
        }
    }

    /**
     * @param Order $order
     * @param mixed $customer
     */
    private function assignOrderToCustomer(Order $order, $customer)
    {
        if ($this->helper->isAssignOrderToCustomer()) {
            try {
                if (!$order->getCustomerId() && $customer && $customer->getId()) {
                    $order->setCustomerId($customer->getId());
                    $order->setCustomerGroupId($customer->getGroupId());
                    $order->setCustomerIsGuest(0);
                    $order->setCustomerFirstname($customer->getFirstname());
                    $order->setCustomerLastname($customer->getLastname());
                    if ($order->getShippingAddress()) {
                        $order->getShippingAddress()->setCustomerId($customer->getId());
                    }
                    if ($order->getBillingAddress()) {
                        $order->getBillingAddress()->setCustomerId($customer->getId());
                    }
                    $this->orderRepository->save($order);
                }
            } catch (\Exception $e) {
                $this->logger->error($e->getMessage());
            }
        }
    }
}
