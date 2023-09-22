<?php
/**
 * Copyright © 2018 IWD Agency - All rights reserved.
 * See LICENSE.txt bundled with this module for license details.
 */
namespace IWD\Opc\Plugin\Payments;

class Info
{
    /**
     * We can't storing objects
     * prevent standard error message
     *
     * @param $subject
     * @param callable $proceed
     * @param $key
     * @param null $value
     * @return mixed
     */
    public function aroundSetAdditionalInformation(
        $subject,
        callable $proceed,
        $key,
        $value = null
    ) {
        return is_object($value) ? $subject : $proceed($key, $value);
    }
}
