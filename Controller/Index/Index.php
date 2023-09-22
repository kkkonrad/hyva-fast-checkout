<?php

namespace IWD\Opc\Controller\Index;

use IWD\Opc\Controller\Action;
use Magento\Framework\App\RequestInterface;
use Magento\Framework\App\ResponseInterface;
use Magento\Framework\Exception\NotFoundException;

class Index extends Action
{

    /**
     * Dispatch request
     *
     * @param RequestInterface $request
     * @return ResponseInterface
     * @throws NotFoundException
     */
    public function dispatch(RequestInterface $request)
    {
        if ($this->getQuote()->isMultipleShippingAddresses()) {
            $this->getQuote()->removeAllAddresses();
        }

        return parent::dispatch($request);
    }

    public function execute()
    {
        if (!$this->opcHelper->isEnable()
            || !$this->opcHelper->isModuleOutputEnabled('IWD_Opc')
            || !$this->opcHelper->isCheckoutDesign()) {
            return $this->resultRedirectFactory->create()->setPath('checkout');
        }

        if (!$this->preDispatchValidateCustomer()) {
            $this->_actionFlag->set('', self::FLAG_NO_DISPATCH, true);
            return $this->resultRedirectFactory->create()->setPath('customer/account/edit');
        }

        if (!$this->canShowForUnregisteredUsers()) {
            throw new NotFoundException(__('Page not found.'));
        }

        if (!$this->checkoutHelper->canOnepageCheckout()) {
            $this->messageManager->addErrorMessage(__('One-page checkout is turned off.'));
            return $this->resultRedirectFactory->create()->setPath('checkout/cart');
        }

        $quote = $this->onepage->getQuote();
        if (!$quote->hasItems() || $quote->getHasError() || !$quote->validateMinimumAmount()) {
            return $this->resultRedirectFactory->create()->setPath('checkout/cart');
        }

        if (!$this->customerSession->isLoggedIn() && !$this->checkoutHelper->isAllowedGuestCheckout($quote)) {
            $this->messageManager->addErrorMessage(__('Guest checkout is disabled. Please Login or Create an Account'));
            return $this->resultRedirectFactory->create()->setPath('checkout/cart');
        }

        $this->customerSession->regenerateId();
        $this->checkoutSession->setCartWasUpdated(false);
        $this->onepage->initCheckout();
        $resultPage = $this->resultPageFactory->create();
        $resultPage->getConfig()->getTitle()->set($this->opcHelper->getTitle());
        return $resultPage;
    }
}
