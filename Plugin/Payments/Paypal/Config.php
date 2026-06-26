<?php
/**
 * Copyright © 2018 IWD Agency - All rights reserved.
 * See LICENSE.txt bundled with this module for license details.
 */
namespace Kkkonrad\Fastcheckout\Plugin\Payments\Paypal;

use \Magento\Paypal\Model\AbstractConfig as PaypalConfig;

/**
 * Class Config
 * @package Kkkonrad\Fastcheckout\Model\Payments\Paypal
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
