<?php

namespace Kkkonrad\Fastcheckout\Controller;

use Magento\Customer\Api\AccountManagementInterface;
use Magento\Customer\Api\CustomerRepositoryInterface;
use Magento\Framework\Exception\NoSuchEntityException;
use Magento\Framework\App\Action\Action as MagentoAction;
use Magento\Customer\Model\Session as CustomerSession;
use Magento\Framework\App\Action\Context;
use Magento\Checkout\Model\Type\Onepage;
use Kkkonrad\Fastcheckout\Helper\Data as Helper;
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
    public $checkoutSession;
    public $resultPageFactory;
    public $helper;

    public function __construct(
        Context $context,
        CustomerSession $customerSession,
        Onepage $onepage,
        CheckoutHelper $checkoutHelper,
        CustomerRepositoryInterface $customerRepository,
        CheckoutSession $checkoutSession,
        PageFactory $resultPageFactory,
        Helper $helper,
        AccountManagementInterface $accountManagement
    ) {
        $this->helper = $helper;
        $this->resultPageFactory = $resultPageFactory;
        $this->checkoutSession = $checkoutSession;
        $this->customerSession = $customerSession;
        $this->onepage = $onepage;
        $this->customerRepository = $customerRepository;
        $this->accountManagement = $accountManagement;
        $this->checkoutHelper = $checkoutHelper;
        parent::__construct($context);
    }

    public function getQuote()
    {
        return $this->onepage->getQuote();
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
