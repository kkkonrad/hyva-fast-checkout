<?php

namespace Kkkonrad\Fastcheckout\Block\Adminhtml\System\Config;

use Magento\Config\Block\System\Config\Form\Field\FieldArray\AbstractFieldArray;
use Magento\Framework\DataObject;

class ShippingPaymentMapping extends AbstractFieldArray
{
    /** @var string */
    protected $_template = 'Kkkonrad_Fastcheckout::system/config/form/field/array.phtml';

    /**
     * @var Form\Field\ShippingMethods
     */
    private $shippingMethodRenderer;

    /**
     * @var Form\Field\PaymentMethods
     */
    private $paymentMethodRenderer;

    /**
     * Decode the JSON persisted by the Fastcheckout backend model before the
     * standard Magento field-array renderer builds its rows.
     *
     * @return DataObject[]
     */
    public function getArrayRows()
    {
        $element = $this->getElement();
        $value = $element ? $element->getValue() : null;

        if (is_string($value) && trim($value) !== '') {
            $decoded = json_decode($value, true);
            if (is_array($decoded)) {
                $element->setValue($decoded);
            }
        }

        return parent::getArrayRows();
    }

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
                \Kkkonrad\Fastcheckout\Block\Adminhtml\System\Config\Form\Field\ShippingMethods::class,
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
                \Kkkonrad\Fastcheckout\Block\Adminhtml\System\Config\Form\Field\PaymentMethods::class,
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
