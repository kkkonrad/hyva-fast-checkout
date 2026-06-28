<?php
namespace Kkkonrad\Fastcheckout\Plugin\Payments;

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
