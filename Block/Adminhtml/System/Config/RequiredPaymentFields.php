<?php

declare(strict_types=1);

namespace Kkkonrad\Fastcheckout\Block\Adminhtml\System\Config;

use Kkkonrad\Fastcheckout\Block\Adminhtml\System\Config\Form\Field\PaymentMethods;

class RequiredPaymentFields extends RequiredFields
{
    protected function getFieldOptions(): array
    {
        return [
            [
                'value' => 'po_number',
                'label' => (string)__('Purchase Order Number'),
            ],
            [
                'value' => 'additional_data.transaction_id',
                'label' => (string)__('Transaction ID'),
            ],
            [
                'value' => 'additional_data.payment_method_nonce',
                'label' => (string)__('Payment Method Nonce'),
            ],
            [
                'value' => 'additional_data.token',
                'label' => (string)__('Payment Token'),
            ],
        ];
    }

    protected function getMethodRendererClass(): string
    {
        return PaymentMethods::class;
    }

    protected function getMethodColumnLabel()
    {
        return __('Payment Method');
    }

    protected function getAddRowButtonLabel()
    {
        return __('Add Payment Requirement');
    }
}
