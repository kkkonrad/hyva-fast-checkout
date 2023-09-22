<?php
/**
 * Copyright © 2018 IWD Agency - All rights reserved.
 * See LICENSE.txt bundled with this module for license details.
 */

namespace IWD\Opc\Controller\Account;

use Magento\Framework\Exception\AlreadyExistsException;
use Magento\Quote\Model\Quote\AddressFactory as QuoteAddressFactory;
use Magento\Framework\Controller\Result\JsonFactory;
use Magento\Framework\Encryption\EncryptorInterface as Encryptor;
use Magento\Customer\Model\Session as CustomerSession;

/**
 * Class CreateWithPassword
 * @package IWD\Opc\Controller\Account
 */
class CreateWithPassword extends \Magento\Framework\App\Action\Action
{

    public $encryptor;
    public $customerFactory;

    /**
     * @var \Magento\Customer\Api\AccountManagementInterface
     */
    protected $accountManagement;

    /**
     * @deprecated
     */
    protected $customerInterfaceFactory;

    /**
     * @deprecated
     */
    protected $addressFactory;

    /**
     * @deprecated
     */
    protected $regionFactory;

    /**
     * @var \Magento\Sales\Api\OrderRepositoryInterface
     */
    protected $orderRepository;

    /**
     * @deprecated
     */
    protected $objectCopyService;

    /**
     * @var QuoteAddressFactory
     */
    private $quoteAddressFactory;

    /**
     * @var \Magento\Checkout\Model\Session
     */
    protected $checkoutSession;

    /**
     * @var CustomerSession
     */
    public $customerSession;

    /**
     * CreateWithPassword constructor.
     * @param \Magento\Framework\App\Action\Context $context
     * @param \Magento\Framework\DataObject\Copy $objectCopyService
     * @param \Magento\Customer\Api\AccountManagementInterface $accountManagement
     * @param \Magento\Customer\Api\Data\CustomerInterfaceFactory $customerInterfaceFactory
     * @param \Magento\Customer\Api\Data\AddressInterfaceFactory $addressFactory
     * @param \Magento\Customer\Api\Data\RegionInterfaceFactory $regionFactory
     * @param \Magento\Customer\Model\CustomerFactory $customerFactory
     * @param \Magento\Sales\Api\OrderRepositoryInterface $orderRepository
     * @param \IWD\Opc\Model\OrderCustomerExtractor $orderCustomerExtractor
     * @param QuoteAddressFactory $quoteAddressFactory
     * @param JsonFactory $resultJsonFactory
     * @param \Magento\Checkout\Model\Session $checkoutSession
     * @param Encryptor $encryptor
     * @param CustomerSession $customerSession
     */
    public function __construct(
        \Magento\Framework\App\Action\Context $context,
        \Magento\Framework\DataObject\Copy $objectCopyService,
        \Magento\Customer\Api\AccountManagementInterface $accountManagement,
        \Magento\Customer\Api\Data\CustomerInterfaceFactory $customerInterfaceFactory,
        \Magento\Customer\Api\Data\AddressInterfaceFactory $addressFactory,
        \Magento\Customer\Api\Data\RegionInterfaceFactory $regionFactory,
        \Magento\Sales\Api\OrderRepositoryInterface $orderRepository,
        QuoteAddressFactory $quoteAddressFactory,
        JsonFactory $resultJsonFactory,
        \Magento\Checkout\Model\Session $checkoutSession,
        \IWD\Opc\Model\OrderCustomerExtractor $orderCustomerExtractor,
        \Magento\Customer\Model\CustomerFactory $customerFactory,
        Encryptor $encryptor,
        CustomerSession $customerSession
    ) {
        $this->objectCopyService = $objectCopyService;
        $this->accountManagement = $accountManagement;
        $this->orderRepository = $orderRepository;
        $this->customerInterfaceFactory = $customerInterfaceFactory;
        $this->addressFactory = $addressFactory;
        $this->regionFactory = $regionFactory;
        $this->quoteAddressFactory = $quoteAddressFactory;
        $this->resultJsonFactory = $resultJsonFactory;
        $this->checkoutSession = $checkoutSession;
        $this->orderCustomerExtractor = $orderCustomerExtractor;
        $this->customerFactory = $customerFactory;
        $this->encryptor = $encryptor;
        $this->customerSession = $customerSession;
        parent::__construct($context);
    }

    /**
     * @return mixed
     */
    public function execute()
    {
        $resultJson = $this->resultJsonFactory->create();
        $orderId = $this->checkoutSession->getLastOrderId();
        $params = $this->getRequest()->getParams();
        $password = $params['password'];

        try {
            if ($this->customerSession->getIWDAccountPassword()) {
                $this->customerSession->unsIWDAccountPassword();
                $this->setCustomerPassword($orderId, $password);
            } else {
                $this->createAccount($orderId, $password);
            }

            return $resultJson->setData(
                [
                    'errors' => false,
                    'message' => __('Your account has been created')
                ]
            );
        } catch (\Exception $e) {
            return $resultJson->setData(
                [
                    'errors' => true,
                    'message' => $e->getMessage()
                ]
            );
        }
    }

    /**
     * @param $orderId
     * @param $password
     * @throws AlreadyExistsException
     * @throws \Magento\Framework\Exception\LocalizedException
     */
    public function createAccount($orderId, $password)
    {
        $order = $this->orderRepository->get($orderId);
        if ($order->getCustomerId()) {
            throw new AlreadyExistsException(__("This order already has associated customer account"));
        }

        $customerData = $this->orderCustomerExtractor->prepareCustomerData($order);

        /** @var \Magento\Customer\Api\Data\CustomerInterface $customer */
        $customer = $this->customerInterfaceFactory->create(['data' => $customerData]);
        $account = $this->accountManagement->createAccount($customer, $password);
        $order->setCustomerId($account->getId());
        $this->orderRepository->save($order);
    }

    /**
     * @param $orderId
     * @param $password
     * @throws \ReflectionException
     */
    public function setCustomerPassword($orderId, $password)
    {
        $order = $this->orderRepository->get($orderId);
        $customerEmail = $order->getCustomerEmail();
        $customerCandidate = $this->customerFactory->create()
            ->setWebsiteId($order->getStore()->getWebsiteId())
            ->loadByEmail($customerEmail);

        $password_hash = $this->encryptor->hash($password);
        $customerCandidate->setPasswordHash($password_hash);

        // Save Data
        $customerCandidate->save();

        $customerData = $this->orderCustomerExtractor->prepareCustomerData($order);
        $customerData['id'] = $customerCandidate->getId();
        $customerData['store_id'] = $customerCandidate->getStoreId();
        $customerData['website_id'] = $customerCandidate->getWebsiteId();

        $customer = $this->customerInterfaceFactory->create(['data' => $customerData]);

        // Send Email
        $method = new \ReflectionMethod($this->accountManagement, 'sendEmailConfirmation');
        $method->setAccessible(true);
        $method->invoke($this->accountManagement, $customer, '');
    }
}
