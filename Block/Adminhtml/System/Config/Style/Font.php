<?php

namespace IWD\Opc\Block\Adminhtml\System\Config\Style;

use IWD\Opc\Setup\Patch\Data\GoogleFonts;
use Magento\Framework\Option\ArrayInterface;
use Magento\Framework\App\ResourceConnection;

class Font implements ArrayInterface
{
    /**
     * @var array
     */
    protected $option = [];

    /**
     * @var ResourceConnection
     */
    protected $resourceConnection;

    function __construct(
        ResourceConnection $resourceConnection
    ) {
        $this->resourceConnection = $resourceConnection;
    }

    public function toOptionArray()
    {
        $connection = $this->resourceConnection->getConnection();
        $select = $connection->select()
            ->from(
                ['fonts' => $this->resourceConnection->getTableName(GoogleFonts::GOOGLE_FONTS_TABLE)],['font']
            );
        $fonts = $connection->fetchAll($select);
        foreach ($fonts as $font) {
            $this->option[] = [
                'value' => $font['font'],
                'label' => __($font['font'])
            ];
        }
        return $this->option;
    }
}