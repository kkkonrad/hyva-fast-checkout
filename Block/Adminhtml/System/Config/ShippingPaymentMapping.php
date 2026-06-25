<?php

namespace IWD\Opc\Block\Adminhtml\System\Config;

use Magento\Config\Block\System\Config\Form\Field\FieldArray\AbstractFieldArray;
use Magento\Framework\DataObject;

class ShippingPaymentMapping extends AbstractFieldArray
{
    /**
     * @var Form\Field\ShippingMethods
     */
    private $shippingMethodRenderer;

    /**
     * @var Form\Field\PaymentMethods
     */
    private $paymentMethodRenderer;

    /**
     * Prepare to render
     */
    protected function _prepareToRender()
    {
        $this->addColumn('shipping_method', [
            'label' => __('Shipping Method'),
            'renderer' => $this->getShippingMethodRenderer()
        ]);
        $this->addColumn('payment_method', [
            'label' => __('Allowed Payment Method'),
            'renderer' => $this->getPaymentMethodRenderer()
        ]);
        $this->_addAfter = false;
        $this->_addButtonLabel = __('Add Mapping');
    }

    /**
     * Retrieve shipping method column renderer
     */
    private function getShippingMethodRenderer()
    {
        if (!$this->shippingMethodRenderer) {
            $this->shippingMethodRenderer = $this->getLayout()->createBlock(
                \IWD\Opc\Block\Adminhtml\System\Config\Form\Field\ShippingMethods::class,
                '',
                ['data' => ['is_render_to_js_template' => true]]
            );
        }
        return $this->shippingMethodRenderer;
    }

    /**
     * Retrieve payment method column renderer
     */
    private function getPaymentMethodRenderer()
    {
        if (!$this->paymentMethodRenderer) {
            $this->paymentMethodRenderer = $this->getLayout()->createBlock(
                \IWD\Opc\Block\Adminhtml\System\Config\Form\Field\PaymentMethods::class,
                '',
                ['data' => ['is_render_to_js_template' => true]]
            );
        }
        return $this->paymentMethodRenderer;
    }

    /**
     * Prepare existing row data object
     */
    protected function _prepareArrayRow(DataObject $row)
    {
        $options = [];

        $shippingMethod = $row->getData('shipping_method');
        if ($shippingMethod !== null) {
            $options['option_' . $this->getShippingMethodRenderer()->calcOptionHash($shippingMethod)] = 'selected="selected"';
        }

        $paymentMethod = $row->getData('payment_method');
        if ($paymentMethod !== null) {
            $options['option_' . $this->getPaymentMethodRenderer()->calcOptionHash($paymentMethod)] = 'selected="selected"';
        }

        $row->setData('option_extra_attrs', $options);
    }
}
