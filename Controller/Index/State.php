<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Controller\Index;

use Kkkonrad\Fastcheckout\Model\CheckoutStateProvider;
use Magento\Framework\App\Action\Action;
use Magento\Framework\App\Action\Context;
use Magento\Framework\App\RequestInterface;
use Magento\Framework\Controller\Result\JsonFactory;

class State extends Action
{
    /**
     * @var JsonFactory
     */
    private $resultJsonFactory;

    /**
     * @var CheckoutStateProvider
     */
    private $checkoutStateProvider;

    /**
     * @var RequestInterface
     */
    private $request;

    public function __construct(
        Context $context,
        JsonFactory $resultJsonFactory,
        CheckoutStateProvider $checkoutStateProvider,
        RequestInterface $request
    ) {
        parent::__construct($context);
        $this->resultJsonFactory = $resultJsonFactory;
        $this->checkoutStateProvider = $checkoutStateProvider;
        $this->request = $request;
    }

    public function execute()
    {
        $selectedPaymentMethod = (string)$this->request->getParam('payment_method', '');

        return $this->resultJsonFactory
            ->create()
            ->setData($this->checkoutStateProvider->getState($selectedPaymentMethod));
    }
}
