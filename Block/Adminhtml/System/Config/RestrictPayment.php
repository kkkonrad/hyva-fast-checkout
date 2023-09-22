<?php

namespace IWD\Opc\Block\Adminhtml\System\Config;

use Magento\Config\Block\System\Config\Form\Field;
use Magento\Framework\Data\Form\Element\AbstractElement;
use Magento\Backend\Block\Template\Context;
use Magento\Customer\Model\ResourceModel\Group\Collection as CustomerGroupCollection;
use Magento\Payment\Helper\Data as PaymentHelper;
use Magento\Framework\Json\Helper\Data as JsonHelper;

class RestrictPayment extends Field
{

    public $paymentHelper;

    public $jsonHelper;

    public $customerGroupCollection;

    public function __construct(
        Context $context,
        CustomerGroupCollection $customerGroupCollection,
        PaymentHelper $paymentHelper,
        JsonHelper $jsonHelper,
        array $data = []
    ) {
        parent::__construct($context, $data);
        $this->paymentHelper = $paymentHelper;
        $this->jsonHelper = $jsonHelper;
        $this->customerGroupCollection = $customerGroupCollection;
    }

    public function render(AbstractElement $element)
    {
        $html = '<input type="hidden" name="groups[restrict_payment][fields][methods][value]" value/>';
        $options = $element->getValue() ? $this->jsonHelper->jsonDecode($element->getValue()) : [];
        $groups = $this->customerGroupCollection->toOptionArray();
        foreach ($this->paymentHelper->getPaymentMethodList() as $code => $label) {
            if (!$label) {
                continue;
            }

            $html .= '<tr id="row_' . $element->getHtmlId() . '_' . $code . '">
                            <td class="label">
                                <label for="' . $element->getHtmlId() . '_' . $code . '">
                                    <span' . $this->_renderScopeLabel($element) . '>' . $label . ' (' . $code . ')' . '</span>
                                </label>
                            </td>
                            <td class="value">' . $this->getCustomersGroup($code, $options, $groups, $element) . '</td>
                            <td class=></td>
                        </tr>';
        }

        return $html;
    }

    private function getCustomersGroup($code, $options, $groups, AbstractElement $element)
    {
        $options = isset($options[$code]) ? $options[$code] : [];
        $html = '<select size="5" class="select multiselect admin__control-multiselect" 
        id="' . $element->getHtmlId() . '_' . $code . '"
        name="groups[restrict_payment][fields][methods][value][' . $code . '][]" multiple="multiple">';
        foreach ($groups as $group) {
            $selected = in_array($group['value'], $options) ? 'selected' : '';
            $html .= '<option ' . $selected . ' value="' . $group['value'] . '">' . $group['label'] . '</option>';
        }

        $html .= '</select>';
        return $html;
    }
}
