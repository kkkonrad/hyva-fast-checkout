<?php

namespace IWD\Opc\Model\Shipping;

if(class_exists('\Temando\Shipping\Model\Shipping\Carrier')){
    class TemandoShipping extends \Temando\Shipping\Model\Shipping\Carrier{}
}else{
    class TemandoShipping{}
}
class Carrier extends TemandoShipping
{

    public function getAllowedMethods()
    {
        if($this->exception()){
            return array();
        }

        $experiences = array_reduce(
            $this->experienceRepository->getExperiences(),
            function (array $carry, ExperienceInterface $experience) {
                if ($experience->getStatus() !== ExperienceInterface::STATUS_DISABLED) {
                    $carry[$experience->getExperienceId()] = $experience->getName();
                }

                return $carry;
            },
            []
        );

        asort($experiences);

        return $experiences;
    }

    public function exception(){

        if(!$this->getConfigFlag('active')){
            return 1;
        }

        try{
            $getExperiences = $this->experienceRepository->getExperiences();
        }catch (\Exception $e){
            return 1;
        }

        return 0;

    }
}
