<?php

namespace Kkkonrad\Fastcheckout\Api;

/**
 * Interface RewardManagementInterface
 * @api
 */
interface RewardManagementInterface
{
    /**
     * Set reward points to quote
     *
     * @param int $cartId
     * @return boolean
     */
    public function remove($cartId);
}
