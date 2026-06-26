<?php

namespace Kkkonrad\Fastcheckout\Model;

class Flag extends \Magento\Framework\Flag
{

    public function initFlagCode($code)
    {
        $this->_flagCode = $code;
        return $this;
    }
}
