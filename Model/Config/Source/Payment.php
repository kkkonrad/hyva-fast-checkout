<?php

namespace IWD\Opc\Model\Config\Source;

use Magento\Payment\Model\Config\Source\Allmethods;

/**
 * Class Payment
 *
 * @package IWD\Opc\Model\Config\Source
 */
class Payment extends Allmethods
{
    /**
     * @var \Magento\Payment\Model\Config
     */
    protected $_paymentModelConfig;

    /**
     * @var \Magento\Payment\Helper\Data
     */
    protected $paymentData;

    /**
     * Payment constructor.
     *
     * @param \Magento\Payment\Helper\Data $paymentData
     * @param \Magento\Framework\App\Config\ScopeConfigInterface $scope
     */
    public function __construct(
        \Magento\Payment\Helper\Data $paymentData,
        \Magento\Payment\Model\Config $paymentModelConfig
    )
    {
        $this->_paymentModelConfig = $paymentModelConfig;
        $this->paymentData = $paymentData;
        parent::__construct($paymentData);
    }

    /**
     * @return array
     */
    public function toOptionArray()
    {
        $options = $this->getActivePaymentMethods();

        return $this->_filterOptions($options);
    }

    /**
     * Filter empty payment groups without values
     *
     * @param array $options
     * @return array
     */
    protected function _filterOptions(array $options)
    {
        $defaultLabel = '-- Please select a payment method --';
        if(empty($options)) {
            $defaultLabel = '-- Please enable payment methods in Sales -> Payment Methods --';
        }
        array_unshift($options, ['value' => '', 'label' => $defaultLabel]);

        return $options;
    }

    /**
     * @return array
     */
    public function getActivePaymentMethods()
    {
        $methods = [];
        $groupRelations = [];

        $payments = $this->_paymentModelConfig->getActiveMethods();
        $activeMethods = array();
        foreach ($payments as $paymentCode => $paymentModel) {
            if($paymentCode !== 'free') {
                $activeMethods[$paymentCode] = $paymentModel->getTitle();
            }
        }

        foreach ($this->paymentData->getPaymentMethods() as $code => $data) {
            if (isset($data['title'])) {
                $methods[$code] = $data['title'];
            }
            if (isset($data['group'])) {
                $groupRelations[$code] = $data['group'];
            }
        }

        $groups = $this->_paymentModelConfig->getGroups();
        foreach ($groups as $code => $title) {
            $methods[$code] = $title;
        }

        asort($methods);

        $allMethods = $methods;
        $labelValues = [];
        foreach ($methods as $code => $title) {
            if(array_key_exists($code, $activeMethods)) {
                $labelValues[$code] = [];
            } else {
                unset($methods[$code]);
            }
        }

        foreach ($methods as $code => $title) {
            if (isset($groups[$code])) {
                $labelValues[$code]['label'] = $title;
                $labelValues[$code]['value'] = null;
            } elseif (isset($groupRelations[$code])) {
                unset($labelValues[$code]);
                if(!isset($labelValues[$groupRelations[$code]]['label'])) {
                    $labelValues[$groupRelations[$code]]['label'] = $allMethods[$groupRelations[$code]];
                }
                $labelValues[$groupRelations[$code]]['value'][$code] = ['value' => $code, 'label' => $title];
            } else {
                $labelValues[$code] = ['value' => $code, 'label' => $title];
            }
            if($code === 'braintree' && isset($groupRelations[$code]) && array_key_exists($code, $activeMethods)){
                $labelValues[$groupRelations[$code]]['value'][$code] = ['value' => $code, 'label' => $activeMethods[$code]];
            }
        }

        return $labelValues;
    }
}
