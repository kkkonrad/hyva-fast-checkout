<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Plugin\Checkout\Controller\Onepage;

use Kkkonrad\Fastcheckout\Helper\Data as Helper;
use Magento\Checkout\Controller\Onepage\Failure as FailureController;
use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Framework\View\Result\Page;

class Failure
{
    /**
     * Fastcheckout failure-page overrides live in a custom handle, not in
     * checkout_onepage_failure, so a disabled module leaves the native page intact.
     */
    private const LAYOUT_HANDLE = 'fastcheckout_checkout_onepage_failure';

    /**
     * @var CheckoutSession
     */
    private $checkoutSession;

    /**
     * @var Helper
     */
    private $helper;

    /**
     * @param CheckoutSession $checkoutSession
     * @param Helper $helper
     */
    public function __construct(
        CheckoutSession $checkoutSession,
        Helper $helper
    ) {
        $this->checkoutSession = $checkoutSession;
        $this->helper = $helper;
    }

    /**
     * Restore the quote before the failure page renders and apply the Fastcheckout
     * failure layout handle.
     *
     * @param FailureController $subject
     * @param callable $proceed
     * @return \Magento\Framework\Controller\ResultInterface|\Magento\Framework\App\ResponseInterface
     */
    public function aroundExecute(FailureController $subject, callable $proceed)
    {
        if (!$this->helper->isEnable()) {
            return $proceed();
        }

        $this->checkoutSession->restoreQuote();

        $result = $proceed();
        if ($result instanceof Page) {
            $result->addHandle(self::LAYOUT_HANDLE);
        }

        return $result;
    }
}
