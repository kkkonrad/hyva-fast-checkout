<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Controller\Index;

use Magento\Framework\App\Action\HttpGetActionInterface;
use Magento\Framework\Controller\Result\Redirect;
use Magento\Framework\Controller\Result\RedirectFactory;

class Index implements HttpGetActionInterface
{
    private RedirectFactory $resultRedirectFactory;

    public function __construct(RedirectFactory $resultRedirectFactory)
    {
        $this->resultRedirectFactory = $resultRedirectFactory;
    }

    public function execute(): Redirect
    {
        return $this->resultRedirectFactory->create()->setPath('checkout');
    }
}
