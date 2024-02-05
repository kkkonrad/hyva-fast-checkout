<?php

namespace IWD\Opc\Observer;

use Magento\Framework\Event\Observer as EventObserver;
use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Sales\Model\Order\Status\HistoryFactory;
use Magento\Framework\Event\ObserverInterface;
use IWD\Opc\Helper\Data as OpcHelper;
use Magento\Customer\Model\CustomerFactory;
use Psr\Log\LoggerInterface;
use Magento\Newsletter\Model\Subscriber;
use Magento\Sales\Api\OrderRepositoryInterface;
use Magento\Sales\Model\Order;
use Magento\Store\Model\StoreManagerInterface;
use Magento\Framework\Encryption\EncryptorInterface as Encryptor;
use \Magento\Downloadable\Model\Link\PurchasedFactory as PurchasedFactory;
use Magento\Customer\Model\Session as CustomerSession;
use Magento\Downloadable\Observer\SaveDownloadableOrderItemObserver;

/**
 * Class QuoteSubmitSuccess
 * @package IWD\Opc\Observer
 */
class QuoteSubmitSuccess implements ObserverInterface
{

    public $opcHelper;
    public $customerFactory;
    public $checkoutSession;
    public $historyFactory;
    public $logger;
    public $subscriber;
    public $orderRepository;
    public $storeManager;
    public $objManager;
    public $encryptor;
    public $downloadLink;

    /** @var SaveDownloadableOrderItemObserver */
    private $saveDownloadableOrderItemObserver;

    /**
     * @var \Magento\Framework\Registry
     */
    protected $registry;

    /**
     * @var CustomerSession
     */
    public $customerSession;

    /**
     * @var \Magento\Sales\Api\OrderCustomerManagementInterface
     */
    protected $orderCustomerService;

    public function __construct(
        OpcHelper $opcHelper,
        CustomerFactory $customerFactory,
        CheckoutSession $checkoutSession,
        HistoryFactory $historyFactory,
        LoggerInterface $logger,
        Subscriber $subscriber,
        OrderRepositoryInterface $orderRepository,
        StoreManagerInterface $storeManager,
        Encryptor $encryptor,
        PurchasedFactory $downloadLink,
        CustomerSession $customerSession,
        \Magento\Framework\Registry $registry,
        \Magento\Sales\Api\OrderCustomerManagementInterface $orderCustomerService,
        SaveDownloadableOrderItemObserver $saveDownloadableOrderItemObserver
    ) {
        $this->opcHelper = $opcHelper;
        $this->customerFactory = $customerFactory;
        $this->checkoutSession = $checkoutSession;
        $this->historyFactory = $historyFactory;
        $this->logger = $logger;
        $this->subscriber = $subscriber;
        $this->orderRepository = $orderRepository;
        $this->storeManager = $storeManager;
        $this->encryptor = $encryptor;
        $this->downloadLink = $downloadLink;
        $this->customerSession = $customerSession;
        $this->registry = $registry;
        $this->orderCustomerService = $orderCustomerService;
        $this->saveDownloadableOrderItemObserver = $saveDownloadableOrderItemObserver;
    }

    /**
     * @param EventObserver $observer
     * @return $this
     * @throws \Magento\Framework\Exception\AlreadyExistsException
     */
    public function execute(EventObserver $observer)
    {
        /**
         * @var $order Order
         */

        $order = $observer->getEvent()->getOrder();
        if (!$order || !$this->opcHelper->isEnable()) {
            return $this;
        }

        $customerEmail = $order->getCustomerEmail();
        $customerCandidate = $this->customerFactory->create()
            ->setWebsiteId($order->getStore()->getWebsiteId())
            ->loadByEmail($customerEmail);

        if ($customerCandidate && $customerCandidate->getId()) {
            $customer = $customerCandidate;
            $this->assignOrderToCustomer($order, $customer);
        }

        if ($this->opcHelper->isEnable()) {
            if ($this->opcHelper->isLoginAccountCreationEnabled()
                && !$this->customerSession->isLoggedIn()
                && !is_array($customerCandidate)
                && !$customerCandidate->getId()) {
                $this->createCustomerAccount($order);
                /* Assign customer to first order */
                $customer = $this->customerFactory->create()->setWebsiteId($order->getStore()->getWebsiteId())->loadByEmail($customerEmail);
                $this->assignOrderToCustomer($order, $customer);
            }
        }

        $this->saveComment($order);
        $this->saveSubscribe($order);

        /* Assign Downloadable product links to Customer Account */
        $items = $order->getAllItems();
        foreach ($items as $item) {
            //look for downloadable products
            if ($item->getProductType() === 'downloadable') {
                // create link from repository
                $om = \Magento\Framework\App\ObjectManager::getInstance();

                /** @var \Magento\Framework\Event\Observer $observer */
                $observer = $om->get('\Magento\Framework\Event\Observer');
                $event = $om->get('\Magento\Framework\Event')->setItem($item);
                $observer->setEvent($event);

                $this->saveDownloadableOrderItemObserver->execute($observer);

                /* Assign Customer to Downloadable product links */
                if(isset($customer) && $customer->getId() && $link = $this->downloadLink->create()->load($item->getId(), 'order_item_id')){
                    $link->setCustomerId($customer->getId());
                    $link->save();
                }
            }
        }

        return $this;
    }

    /**
     * @param $order
     * @return \Magento\Customer\Api\Data\CustomerInterface
     * @throws \Magento\Framework\Exception\AlreadyExistsException
     */
    private function createCustomerAccount($order)
    {
        $this->registry->register('isIWDcreateAccount', true);
        $this->customerSession->setIsIWDcreateAccount(true);

        $account = $this->orderCustomerService->create($order->getId());
        return $account;
    }

    /**
     * @param $order
     * @param $quote
     * @return $this
     */
    private function orderShippingAddressFields($order, $quote)
    {
        $order->getShippingAddress()->setData(
            'daimond_shape',
            $quote->getShippingAddress()->getData('daimond_shape')
        )->save();

        return $this;
    }

    /**
     * @param Order $order
     */
    private function saveSubscribe(Order $order)
    {
        if ($this->opcHelper->isShowSubscribe()) {
            $subscribe = $this->checkoutSession->getIwdOpcSubscribe();
            if ($subscribe) {
                try {
                    $this->subscriber->subscribe($order->getCustomerEmail());
                } catch (\Exception $e) {
                    $this->logger->error($e->getMessage());
                }
            }
        }
    }

    /**
     * @param Order $order
     */
    private function saveComment(Order $order)
    {
        if ($this->opcHelper->isShowComment()) {
            $comment = $this->checkoutSession->getIwdOpcComment();
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
     * @param $customer
     */
    private function assignOrderToCustomer(Order $order, $customer)
    {
        if ($this->opcHelper->isAssignOrderToCustomer()) {
            try {
                if (!$order->getCustomerId()) {
                    if ($customer->getId()) {
                        $order->setCustomerId($customer->getId());
                        $order->setCustomerGroupId($customer->getGroupId());
                        $order->setCustomerIsGuest(0);
                        $order->setCustomerFirstname($customer->getFirstname());
                        $order->setCustomerLastname($customer->getLastname());
                        if ($order->getShippingAddress()) {
                            $order->getShippingAddress()->setCustomerId($customer->getId());
                        }
                        $order->getBillingAddress()->setCustomerId($customer->getId());
                        $this->orderRepository->save($order);
                    }
                }
            } catch (\Exception $e) {
                $this->logger->error($e->getMessage());
            }
        }
    }
}
