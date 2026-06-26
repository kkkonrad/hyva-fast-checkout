<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Plugin\Checkout\Controller\Onepage;

use Magento\Checkout\Controller\Onepage\Failure as FailureController;
use Magento\Checkout\Model\Session as CheckoutSession;

class Failure
{
    /**
     * @var CheckoutSession
     */
    private $checkoutSession;

    /**
     * @param CheckoutSession $checkoutSession
     */
    public function __construct(
        CheckoutSession $checkoutSession
    ) {
        $this->checkoutSession = $checkoutSession;
    }

    /**
     * Restore quote before executing the failure page
     *
     * @param FailureController $subject
     * @return void
     */
    public function beforeExecute(FailureController $subject)
    {
        $this->checkoutSession->restoreQuote();
    }
}
