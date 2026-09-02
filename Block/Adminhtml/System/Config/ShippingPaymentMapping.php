<?php

namespace Kkkonrad\Fastcheckout\Block\Adminhtml\System\Config;

use Kkkonrad\Fastcheckout\Block\Adminhtml\System\Config\Form\Field\PaymentMethods;
use Kkkonrad\Fastcheckout\Block\Adminhtml\System\Config\Form\Field\ShippingMethods;
use Magento\Config\Block\System\Config\Form\Field\FieldArray\AbstractFieldArray;
use Magento\Framework\DataObject;

class ShippingPaymentMapping extends AbstractFieldArray
{
    private ?ShippingMethods $shippingMethodRenderer = null;
    private ?PaymentMethods $paymentMethodRenderer = null;

    protected function _prepareToRender()
    {
        $this->addColumn('shipping_method', [
            'label' => __('Shipping Method'),
            'renderer' => $this->shippingRenderer(),
        ]);
        $this->addColumn('payment_method', [
            'label' => __('Allowed Payment Method'),
            'renderer' => $this->paymentRenderer(),
        ]);
        $this->_addAfter = false;
        $this->_addButtonLabel = __('Add Mapping');
    }

    protected function _prepareArrayRow(DataObject $row)
    {
        $options = [];
        foreach ([
            'shipping_method' => $this->shippingRenderer(),
            'payment_method' => $this->paymentRenderer(),
        ] as $field => $renderer) {
            $value = $row->getData($field);
            if ($value !== null) {
                $options['option_' . $renderer->calcOptionHash($value)] = 'selected="selected"';
            }
        }
        $row->setData('option_extra_attrs', $options);
    }

    private function shippingRenderer(): ShippingMethods
    {
        return $this->shippingMethodRenderer ??= $this->getLayout()->createBlock(
            ShippingMethods::class,
            '',
            ['data' => ['is_render_to_js_template' => true]]
        );
    }

    private function paymentRenderer(): PaymentMethods
    {
        return $this->paymentMethodRenderer ??= $this->getLayout()->createBlock(
            PaymentMethods::class,
            '',
            ['data' => ['is_render_to_js_template' => true]]
        );
    }
}
