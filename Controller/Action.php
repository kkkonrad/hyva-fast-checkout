<?php

namespace IWD\Opc\Controller;

use Magento\Customer\Api\AccountManagementInterface;
use Magento\Customer\Api\CustomerRepositoryInterface;
use Magento\Framework\Exception\NoSuchEntityException;
use Magento\Framework\App\Action\Action as MagentoAction;
use Magento\Customer\Model\Session as CustomerSession;
use Magento\Framework\App\Action\Context;
use Magento\Framework\Controller\Result\RawFactory;
use Magento\Checkout\Model\Type\Onepage;
use IWD\Opc\Helper\Data as OpcHelper;
use Magento\Checkout\Helper\Data as CheckoutHelper;
use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Framework\View\Result\PageFactory;

abstract class Action extends MagentoAction
{

    public $customerSession;
    public $customerRepository;
    public $accountManagement;
    public $onepage;
    public $checkoutHelper;
    public $resultRawFactory;
    public $checkoutSession;
    public $resultPageFactory;
    public $opcHelper;

    public function __construct(
        Context $context,
        CustomerSession $customerSession,
        Onepage $onepage,
        CheckoutHelper $checkoutHelper,
        CustomerRepositoryInterface $customerRepository,
        RawFactory $resultRawFactory,
        CheckoutSession $checkoutSession,
        PageFactory $resultPageFactory,
        OpcHelper $opcHelper,
        AccountManagementInterface $accountManagement
    ) {
        $this->opcHelper = $opcHelper;
        $this->resultPageFactory = $resultPageFactory;
        $this->checkoutSession = $checkoutSession;
        $this->customerSession = $customerSession;
        $this->onepage = $onepage;
        $this->customerRepository = $customerRepository;
        $this->accountManagement = $accountManagement;
        $this->resultRawFactory = $resultRawFactory;
        $this->checkoutHelper = $checkoutHelper;
        parent::__construct($context);
    }

    public function getQuote()
    {
        return $this->onepage->getQuote();
    }

    public function isQuoteValid()
    {
        $quote = $this->getQuote();
        if (!$quote->hasItems() || $quote->getHasError() || !$quote->validateMinimumAmount()) {
            return false;
        }

        return true;
    }

    /**
     * Check can page show for unregistered users
     *
     * @return boolean
     */
    public function canShowForUnregisteredUsers()
    {
        return $this->customerSession->isLoggedIn()
            || $this->getRequest()->getActionName() == 'index'
            || $this->checkoutHelper->isAllowedGuestCheckout($this->getQuote())
            || !$this->checkoutHelper->isCustomerMustBeLogged();
    }

    /**
     * Make sure customer is valid, if logged in
     *
     * @return bool
     * @throws \Magento\Framework\Exception\LocalizedException
     */
    public function preDispatchValidateCustomer()
    {
        try {
            $customer = $this->customerRepository->getById($this->customerSession->getCustomerId());
        } catch (NoSuchEntityException $e) {
            return true;
        }

        if (isset($customer)) {
            $validationResult = $this->accountManagement->validate($customer);
            if (!$validationResult->isValid()) {
                foreach ($validationResult->getMessages() as $error) {
                    $this->messageManager->addErrorMessage($error);
                }

                return false;
            }
        }

        return true;
    }
}
