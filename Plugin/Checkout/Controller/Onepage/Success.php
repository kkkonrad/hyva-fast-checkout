<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Plugin\Checkout\Controller\Onepage;

use Kkkonrad\Fastcheckout\Helper\Data as Helper;
use Magento\Checkout\Controller\Onepage\Success as SuccessController;
use Magento\Framework\App\RequestInterface;
use Magento\Framework\Controller\Result\RedirectFactory;
use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Framework\View\Result\Page;

class Success
{
    /**
     * Fastcheckout success-page overrides live in a custom handle, not in
     * checkout_onepage_success, so a disabled module leaves the native page intact.
     */
    private const LAYOUT_HANDLE = 'fastcheckout_checkout_onepage_success';

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
     * @var Helper
     */
    private $helper;

    /**
     * @param RequestInterface $request
     * @param RedirectFactory $redirectFactory
     * @param CheckoutSession $checkoutSession
     * @param Helper $helper
     */
    public function __construct(
        RequestInterface $request,
        RedirectFactory $redirectFactory,
        CheckoutSession $checkoutSession,
        Helper $helper
    ) {
        $this->request = $request;
        $this->redirectFactory = $redirectFactory;
        $this->checkoutSession = $checkoutSession;
        $this->helper = $helper;
    }

    /**
     * Redirect to failure page when a gateway returned an error code, and apply the
     * Fastcheckout success layout handle.
     *
     * @param SuccessController $subject
     * @param callable $proceed
     * @return \Magento\Framework\Controller\Result\Redirect|\Magento\Framework\App\ResponseInterface|\Magento\Framework\Controller\ResultInterface
     */
    public function aroundExecute(SuccessController $subject, callable $proceed)
    {
        if (!$this->helper->isEnable()) {
            return $proceed();
        }

        // Only gateway status codes redirect. Anyone can append ?error=... to the success
        // URL, so free-form values must not throw the shopper off the confirmation page.
        $error = trim((string)$this->request->getParam('error'));
        if ($error !== '' && ctype_digit($error)) {
            $errorMessage = $error === '501'
                ? __('Payment was canceled by the user or rejected by the bank.')
                : __('Payment transaction failed or was canceled.');
            $this->checkoutSession->setErrorMessage($errorMessage);

            $redirect = $this->redirectFactory->create();
            return $redirect->setPath('checkout/onepage/failure');
        }

        $result = $proceed();
        if ($result instanceof Page) {
            $result->addHandle(self::LAYOUT_HANDLE);
        }

        return $result;
    }
}
