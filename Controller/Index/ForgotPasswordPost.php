<?php

namespace IWD\Opc\Controller\Index;

use Magento\Customer\Api\AccountManagementInterface;
use Magento\Customer\Model\AccountManagement;
use Magento\Framework\App\Action\Context;
use Magento\Framework\Exception\NoSuchEntityException;
use Magento\Framework\Exception\SecurityViolationException;
use Magento\Customer\Controller\AbstractAccount;
use Magento\Framework\Controller\Result\RawFactory;
use Magento\Framework\Controller\Result\JsonFactory;
use Magento\Framework\Json\Helper\Data;

class ForgotPasswordPost extends AbstractAccount
{
    /**
     * @var AccountManagementInterface
     */

    public $customerAccountManagement;
    /**
     * @var RawFactory
     */

    public $resultRawFactory;

    /**
     * @var JsonFactory
     */
    public $resultJsonFactory;

    /**
     * @var Data $helper
     */
    public $helper;

    public function __construct(
        Context $context,
        AccountManagementInterface $customerAccountManagement,
        RawFactory $resultRawFactory,
        JsonFactory $resultJsonFactory,
        Data $helper
    ) {
        $this->customerAccountManagement = $customerAccountManagement;
        $this->resultRawFactory = $resultRawFactory;
        $this->resultJsonFactory = $resultJsonFactory;
        $this->helper = $helper;
        parent::__construct($context);
    }

    /**
     * Forgot customer password action
     *
     * @return \Magento\Framework\Controller\ResultInterface
     * @throws \Zend_Validate_Exception
     */
    public function execute()
    {
        $data = null;
        $httpBadRequestCode = 400;

        /** @var \Magento\Framework\Controller\Result\Raw $resultRaw */
        $resultRaw = $this->resultRawFactory->create();
        try {
            $data = $this->helper->jsonDecode($this->getRequest()->getContent());
            $email = $data['email'];
        } catch (\Exception $e) {
            return $resultRaw->setHttpResponseCode($httpBadRequestCode);
        }

        if (!$email || $this->getRequest()->getMethod() !== 'POST' ||
            !\Zend_Validate::is($email, 'EmailAddress') ||
            !$this->getRequest()->isXmlHttpRequest()
        ) {
            return $resultRaw->setHttpResponseCode($httpBadRequestCode);
        }

        try {
            $this->customerAccountManagement->initiatePasswordReset(
                $email,
                AccountManagement::EMAIL_RESET
            );
            $response = [
                'errors' => false,
                'message' => __('Check your email for reset instructions.')
            ];
        } catch (NoSuchEntityException $exception) {
            $response = [
                'errors' => false,
                'message' => __('Check your email for reset instructions.')
            ];
        } catch (SecurityViolationException $exception) {
            $response = [
                'errors' => true,
                'message' => $exception->getMessage()
            ];
        } catch (\Exception $exception) {
            $response = [
                'errors' => true,
                'message' => $exception->getMessage()
            ];
        }
        /** @var \Magento\Framework\Controller\Result\Json $resultJson */
        $resultJson = $this->resultJsonFactory->create();
        return $resultJson->setData($response);
    }
}
