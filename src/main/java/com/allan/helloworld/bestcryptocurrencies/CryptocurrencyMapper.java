package com.allan.helloworld.bestcryptocurrencies;

import org.springframework.stereotype.Component;

@Component
public class CryptocurrencyMapper {

    public CryptocurrencyDto toDto(Cryptocurrency entity) {
        return new CryptocurrencyDto(
                entity.getRank(),
                entity.getName(),
                entity.getSymbol(),
                entity.getWebsiteUrl(),
                entity.getPrivacy(),
                entity.getPrivacyKind(),
                entity.isPrivacyByDefault(),
                entity.getAnonymitySet(),
                entity.isTrustedSetupRequired(),
                entity.getFungibility(),
                entity.getMempoolTimeSeconds(),
                entity.getTransactionTimeSeconds(),
                entity.getTransactionFeeUsd(),
                entity.getBlockTimeSeconds(),
                entity.getConsensus(),
                entity.getLaunchYear(),
                entity.getSupplyCap(),
                entity.isSmartContracts(),
                entity.getPriceUsd(),
                entity.getPriceDate(),
                entity.getPriceUpdatedAt(),
                entity.getNotes());
    }
}
