<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Plugin\Checkout\Controller\Onepage;

use Magento\Checkout\Controller\Onepage\Success as SuccessController;
use Magento\Framework\App\RequestInterface;
use Magento\Framework\Controller\Result\RedirectFactory;
use Magento\Checkout\Model\Session as CheckoutSession;

class Success
{
    /**
     * @var RequestInterface
     */
    private $request;

    /**
     * @var RedirectFactory
     */
    private $redirectFactory;

    /**
     * @var CheckoutSession
     */
    private $checkoutSession;

    /**
     * @param RequestInterface $request
     * @param RedirectFactory $redirectFactory
     * @param CheckoutSession $checkoutSession
     */
    public function __construct(
        RequestInterface $request,
        RedirectFactory $redirectFactory,
        CheckoutSession $checkoutSession
    ) {
        $this->request = $request;
        $this->redirectFactory = $redirectFactory;
        $this->checkoutSession = $checkoutSession;
    }

    /**
     * Redirect to failure page if there is an error parameter in the URL
     *
     * @param SuccessController $subject
     * @param callable $proceed
     * @return \Magento\Framework\Controller\Result\Redirect|\Magento\Framework\App\ResponseInterface|\Magento\Framework\Controller\ResultInterface
     */
    public function aroundExecute(SuccessController $subject, callable $proceed)
    {
        $error = $this->request->getParam('error');
        if ($error !== null && $error !== '') {
            $errorMessage = __('Payment transaction failed or was canceled.');
            if ($error === '501') {
                $errorMessage = __('Payment was canceled by the user or rejected by the bank.');
            }
            $this->checkoutSession->setErrorMessage($errorMessage);

            $redirect = $this->redirectFactory->create();
            return $redirect->setPath('checkout/onepage/failure');
        }

        return $proceed();
    }
}
