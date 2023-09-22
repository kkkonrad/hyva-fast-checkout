<?php
/**
 * Copyright © 2018 IWD Agency - All rights reserved.
 * See LICENSE.txt bundled with this module for license details.
 */
namespace IWD\Opc\Plugin\Payments\Paypal;

use \Magento\Paypal\Model\AbstractConfig as PaypalConfig;

/**
 * Class Config
 * @package IWD\Opc\Model\Payments\Paypal
 */
class Config
{
    /**
     * @param PaypalConfig $subject
     * @param $result
     * @SuppressWarnings(PHPMD.UnusedFormalParameter)
     * @return string
     */
    public function afterGetBuildNotationCode(PaypalConfig $subject, $result)
    {
        return 'IWD_SP_PCP';
    }
}
