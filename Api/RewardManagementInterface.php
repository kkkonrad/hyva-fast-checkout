<?php

namespace IWD\Opc\Api;

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
