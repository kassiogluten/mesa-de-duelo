package mesadeduelo.bridge;

import java.lang.reflect.Field;

import forge.card.CardRules;
import forge.card.ICardFace;
import forge.item.PaperCard;

/**
 * Impressões com nome alternativo (Vibranium Dynamo é uma Thran Dynamo, Panther Idol um Mind's Eye) jogam com o nome
 * Oracle: o Forge chamaria a carta pelo nome impresso na partida, e a mesa, que procura a carta no Scryfall pelo nome,
 * ficaria sem imagem, texto e tradução. A imagem continua a da impressão escolhida no deck (série e número). As do
 * Universes Within ficam como estão: lá o nome impresso é o nome Oracle que o Scryfall conhece (Rick, Steadfast Leader).
 */
final class FlavorNames {
    private FlavorNames() { }

    /** Variantes que o Forge cria para um nome alternativo de coleção, sem nome próprio ("FlavorName" + hash). */
    private static final String PREFIX = "FlavorName";
    private static final Field FACE_FLAVOR;
    static {
        Field face = null;
        try {
            face = Class.forName("forge.card.CardFace").getDeclaredField("flavorName"); face.setAccessible(true);
        } catch (ReflectiveOperationException e) {
            Log.bridge().warn("Nomes alternativos mantidos: " + e);
            face = null;
        }
        FACE_FLAVOR = face;
    }

    /**
     * A carta, que na partida passa a se chamar pelo nome Oracle: some o nome alternativo da face, de onde o Forge o
     * copia ao criar a carta na mesa. A impressão em si continua com ele (getDisplayName), porque é por esse nome que o
     * Forge acha a impressão padrão de cada carta; chamar de novo não faz nada.
     */
    static PaperCard oracle(PaperCard card) {
        if (card == null || FACE_FLAVOR == null) return card;
        String variant = card.getFunctionalVariant();
        if (variant == null || !variant.startsWith(PREFIX)) return card;
        try {
            CardRules rules = card.getRules();
            for (ICardFace part : new ICardFace[]{rules.getMainPart(), rules.getOtherPart()}) {
                ICardFace face = part == null ? null : part.getFunctionalVariant(variant);
                if (face != null) FACE_FLAVOR.set(face, null);
            }
        } catch (ReflectiveOperationException e) {
            Log.bridge().warn("Nome alternativo mantido em " + card.getName() + ": " + e);
        }
        return card;
    }
}
