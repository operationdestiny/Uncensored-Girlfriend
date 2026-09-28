import giftTitlesData from "@/data/evershop-gift-titles.json";
import type { EverShopGift } from "@/lib/evershop/catalog";
import type { LanguageCode } from "@/lib/site-language";

type TranslatedLanguage = Exclude<LanguageCode, "EN">;

const giftTitles = giftTitlesData as Record<
  TranslatedLanguage,
  string[]
>;

function localizedDescription(
  gift: EverShopGift,
  title: string,
  language: TranslatedLanguage
) {
  switch (language) {
    case "ES":
      switch (gift.category) {
        case "romance":
          return `Un detalle romántico, ${title}, pensado para compartir un momento tierno y personal.`;
        case "clothing-jewelry":
          return `${title}, un regalo de estilo y significado para hacer que tu vínculo se sienta especial.`;
        case "luxury":
          return `${title}, un regalo refinado para convertir un momento compartido en algo inolvidable.`;
        case "food-treats":
          return `${title}, una delicia para compartir una pausa dulce, acogedora y cercana.`;
        case "magical":
          return `${title}, un regalo encantado para llenar el momento de misterio y fantasía.`;
      }
      break;

    case "FR":
      switch (gift.category) {
        case "romance":
          return `${title}, une attention romantique choisie pour partager un moment tendre et personnel.`;
        case "clothing-jewelry":
          return `${title}, un cadeau élégant et symbolique pour rendre votre lien encore plus spécial.`;
        case "luxury":
          return `${title}, un cadeau raffiné qui transforme un moment partagé en souvenir inoubliable.`;
        case "food-treats":
          return `${title}, une gourmandise à partager pendant une pause douce, chaleureuse et complice.`;
        case "magical":
          return `${title}, un cadeau enchanté qui apporte mystère et fantaisie à votre moment.`;
      }
      break;

    case "DE":
      switch (gift.category) {
        case "romance":
          return `${title} ist eine romantische Aufmerksamkeit für einen zärtlichen, persönlichen Moment.`;
        case "clothing-jewelry":
          return `${title} ist ein stilvolles, bedeutungsvolles Geschenk für eine besondere Bindung.`;
        case "luxury":
          return `${title} ist ein edles Geschenk, das einen gemeinsamen Moment unvergesslich macht.`;
        case "food-treats":
          return `${title} ist eine Köstlichkeit für eine süße, gemütliche und vertraute Pause zu zweit.`;
        case "magical":
          return `${title} ist ein verzaubertes Geschenk voller Geheimnis und Fantasie.`;
      }
      break;

    case "JA":
      switch (gift.category) {
        case "romance":
          return `${title}は、優しく心のこもった二人の時間のために選ばれたロマンチックなギフトです。`;
        case "clothing-jewelry":
          return `${title}は、絆をより特別に感じさせる、上品で意味のあるギフトです。`;
        case "luxury":
          return `${title}は、共有するひとときを忘れられないものにする洗練されたギフトです。`;
        case "food-treats":
          return `${title}は、甘く温かな時間を一緒に楽しむための美味しいギフトです。`;
        case "magical":
          return `${title}は、ひとときに神秘と幻想を添える魔法のギフトです。`;
      }
      break;

    case "KO":
      switch (gift.category) {
        case "romance":
          return `‘${title}’ 선물은 다정하고 특별한 둘만의 순간을 위해 준비되었습니다.`;
        case "clothing-jewelry":
          return `‘${title}’ 선물은 유대를 더욱 특별하게 만들어 주는 세련되고 의미 있는 선택입니다.`;
        case "luxury":
          return `‘${title}’ 선물은 함께하는 순간을 잊지 못할 추억으로 바꾸는 고급스러운 선택입니다.`;
        case "food-treats":
          return `‘${title}’ 선물은 달콤하고 포근한 시간을 함께 즐기기 위한 맛있는 선택입니다.`;
        case "magical":
          return `‘${title}’ 선물은 순간에 신비와 환상을 더해 주는 마법 같은 선택입니다.`;
      }
      break;
  }

  return gift.description;
}

export function localizeEverShopGift<T extends EverShopGift>(
  gift: T,
  language: LanguageCode
): T {
  if (language === "EN") return gift;

  const translatedTitle =
    giftTitles[language]?.[gift.id - 1]?.trim() || gift.title;

  return {
    ...gift,
    title: translatedTitle,
    description: localizedDescription(
      gift,
      translatedTitle,
      language
    )
  } as T;
}
