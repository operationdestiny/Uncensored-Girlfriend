import type { LanguageCode } from "@/lib/site-language";

export type MediaGalleryCopy = {
  toolbarLabel: (name: string) => string;
  title: (name: string) => string;
  subtitle: string;
  privateOnly: string;
  imageStudio: string;
  videoStudio: string;
  images: string;
  videos: string;
  describeImage: string;
  describeVideo: string;
  generateImage: string;
  generateVideo: string;
  generatingImage: string;
  creatingVideo: string;
  videoQueued: string;
  imageEmpty: string;
  videoEmpty: string;
  setChatImage: string;
  activeChatImage: string;
  useDefaultImage: string;
  deleteImage: string;
  deleteVideo: string;
  imageLimitReached: string;
  videoLimitReached: string;
  backToChat: string;
  duration: string;
  seconds: string;
  pricingPending: string;
  pricingPendingBody: string;
  imageRequestBusy: string;
  videoRequestBusy: string;
  mediaError: string;
};

export const MEDIA_GALLERY_COPY: Record<LanguageCode, MediaGalleryCopy> = {
  EN: {
    toolbarLabel: (name) => `${name} Image & Video Gallery`,
    title: (name) => `${name} Images & Videos`,
    subtitle:
      "Create private images and videos using your companion's current picture as the automatic visual reference. Only you can see this gallery.",
    privateOnly: "Private to your account",
    imageStudio: "Image Studio",
    videoStudio: "Video Studio",
    images: "images",
    videos: "videos",
    describeImage:
      "Describe exactly how you want the character, outfit, pose, setting, lighting, and mood to look...",
    describeVideo:
      "Describe exactly what the character does, the setting, movement, camera direction, lighting, and mood...",
    generateImage: "Generate Image",
    generateVideo: "Generate Video",
    generatingImage: "Creating Image...",
    creatingVideo: "Creating Video...",
    videoQueued: "Video generation is running. This can take several minutes.",
    imageEmpty: "No private images yet. Describe one above to create it.",
    videoEmpty: "No private videos yet. Describe one above to create it.",
    setChatImage: "Use as My Chat Image",
    activeChatImage: "My Active Chat Image",
    useDefaultImage: "Use Default Image",
    deleteImage: "Delete Image",
    deleteVideo: "Delete Video",
    imageLimitReached: "Delete an image before creating another one.",
    videoLimitReached: "Delete a video before creating another one.",
    backToChat: "Back to Chat",
    duration: "Duration",
    seconds: "seconds",
    pricingPending: "Video pricing pending",
    pricingPendingBody:
      "Video generation is fully wired but remains disabled until the KissCoins price is set.",
    imageRequestBusy: "An image is already being created.",
    videoRequestBusy: "A video is already being created.",
    mediaError: "The request could not be completed."
  },
  ES: {
    toolbarLabel: (name) => `Galería de imágenes y videos de ${name}`,
    title: (name) => `Imágenes y videos de ${name}`,
    subtitle:
      "Crea imágenes y videos privados usando automáticamente la imagen actual de tu compañero como referencia visual. Solo tú puedes ver esta galería.",
    privateOnly: "Privado para tu cuenta",
    imageStudio: "Estudio de imágenes",
    videoStudio: "Estudio de video",
    images: "imágenes",
    videos: "videos",
    describeImage:
      "Describe exactamente cómo quieres que se vean el personaje, la ropa, la pose, el entorno, la iluminación y el ambiente...",
    describeVideo:
      "Describe exactamente qué hace el personaje, el entorno, el movimiento, la cámara, la iluminación y el ambiente...",
    generateImage: "Crear imagen",
    generateVideo: "Crear video",
    generatingImage: "Creando imagen...",
    creatingVideo: "Creando video...",
    videoQueued: "El video se está generando. Puede tardar varios minutos.",
    imageEmpty: "Aún no hay imágenes privadas. Describe una arriba para crearla.",
    videoEmpty: "Aún no hay videos privados. Describe uno arriba para crearlo.",
    setChatImage: "Usar como mi imagen de chat",
    activeChatImage: "Mi imagen de chat activa",
    useDefaultImage: "Usar imagen predeterminada",
    deleteImage: "Eliminar imagen",
    deleteVideo: "Eliminar video",
    imageLimitReached: "Elimina una imagen antes de crear otra.",
    videoLimitReached: "Elimina un video antes de crear otro.",
    backToChat: "Volver al chat",
    duration: "Duración",
    seconds: "segundos",
    pricingPending: "Precio de video pendiente",
    pricingPendingBody:
      "La generación de video está conectada, pero permanecerá desactivada hasta fijar el precio en KissCoins.",
    imageRequestBusy: "Ya se está creando una imagen.",
    videoRequestBusy: "Ya se está creando un video.",
    mediaError: "No se pudo completar la solicitud."
  },
  FR: {
    toolbarLabel: (name) => `Galerie d’images et de vidéos de ${name}`,
    title: (name) => `Images et vidéos de ${name}`,
    subtitle:
      "Créez des images et vidéos privées en utilisant automatiquement l’image actuelle de votre compagnon comme référence visuelle. Vous seul pouvez voir cette galerie.",
    privateOnly: "Privé sur votre compte",
    imageStudio: "Studio d’images",
    videoStudio: "Studio vidéo",
    images: "images",
    videos: "vidéos",
    describeImage:
      "Décrivez précisément le personnage, la tenue, la pose, le décor, l’éclairage et l’ambiance souhaités...",
    describeVideo:
      "Décrivez précisément l’action du personnage, le décor, les mouvements, la caméra, l’éclairage et l’ambiance...",
    generateImage: "Créer l’image",
    generateVideo: "Créer la vidéo",
    generatingImage: "Création de l’image...",
    creatingVideo: "Création de la vidéo...",
    videoQueued: "La vidéo est en cours de génération. Cela peut prendre plusieurs minutes.",
    imageEmpty: "Aucune image privée pour le moment. Décrivez-en une ci-dessus.",
    videoEmpty: "Aucune vidéo privée pour le moment. Décrivez-en une ci-dessus.",
    setChatImage: "Utiliser comme image de chat",
    activeChatImage: "Mon image de chat active",
    useDefaultImage: "Utiliser l’image par défaut",
    deleteImage: "Supprimer l’image",
    deleteVideo: "Supprimer la vidéo",
    imageLimitReached: "Supprimez une image avant d’en créer une autre.",
    videoLimitReached: "Supprimez une vidéo avant d’en créer une autre.",
    backToChat: "Retour au chat",
    duration: "Durée",
    seconds: "secondes",
    pricingPending: "Tarif vidéo en attente",
    pricingPendingBody:
      "La génération vidéo est entièrement intégrée, mais reste désactivée jusqu’à la définition du tarif KissCoins.",
    imageRequestBusy: "Une image est déjà en cours de création.",
    videoRequestBusy: "Une vidéo est déjà en cours de création.",
    mediaError: "La demande n’a pas pu être effectuée."
  },
  DE: {
    toolbarLabel: (name) => `${name} Bild- & Videogalerie`,
    title: (name) => `${name} Bilder & Videos`,
    subtitle:
      "Erstelle private Bilder und Videos. Das aktuelle Bild deines Begleiters wird automatisch als visuelle Referenz verwendet. Nur du kannst diese Galerie sehen.",
    privateOnly: "Privat für dein Konto",
    imageStudio: "Bildstudio",
    videoStudio: "Videostudio",
    images: "Bilder",
    videos: "Videos",
    describeImage:
      "Beschreibe genau, wie Figur, Kleidung, Pose, Umgebung, Beleuchtung und Stimmung aussehen sollen...",
    describeVideo:
      "Beschreibe genau, was die Figur tut, sowie Umgebung, Bewegung, Kamera, Beleuchtung und Stimmung...",
    generateImage: "Bild erstellen",
    generateVideo: "Video erstellen",
    generatingImage: "Bild wird erstellt...",
    creatingVideo: "Video wird erstellt...",
    videoQueued: "Das Video wird generiert. Dies kann mehrere Minuten dauern.",
    imageEmpty: "Noch keine privaten Bilder. Beschreibe oben dein erstes Bild.",
    videoEmpty: "Noch keine privaten Videos. Beschreibe oben dein erstes Video.",
    setChatImage: "Als mein Chatbild verwenden",
    activeChatImage: "Mein aktives Chatbild",
    useDefaultImage: "Standardbild verwenden",
    deleteImage: "Bild löschen",
    deleteVideo: "Video löschen",
    imageLimitReached: "Lösche ein Bild, bevor du ein weiteres erstellst.",
    videoLimitReached: "Lösche ein Video, bevor du ein weiteres erstellst.",
    backToChat: "Zurück zum Chat",
    duration: "Dauer",
    seconds: "Sekunden",
    pricingPending: "Videopreis steht noch aus",
    pricingPendingBody:
      "Die Videogenerierung ist vollständig verbunden, bleibt aber deaktiviert, bis der KissCoins-Preis festgelegt ist.",
    imageRequestBusy: "Ein Bild wird bereits erstellt.",
    videoRequestBusy: "Ein Video wird bereits erstellt.",
    mediaError: "Die Anfrage konnte nicht abgeschlossen werden."
  },
  JA: {
    toolbarLabel: (name) => `${name}の画像＆動画ギャラリー`,
    title: (name) => `${name}の画像＆動画`,
    subtitle:
      "コンパニオンの現在の画像を自動的に参照して、非公開の画像と動画を作成できます。このギャラリーを見られるのはあなただけです。",
    privateOnly: "あなたのアカウントだけに非公開",
    imageStudio: "画像スタジオ",
    videoStudio: "動画スタジオ",
    images: "画像",
    videos: "動画",
    describeImage:
      "キャラクター、衣装、ポーズ、背景、照明、雰囲気を希望どおりに詳しく説明してください...",
    describeVideo:
      "キャラクターの動き、背景、モーション、カメラ、照明、雰囲気を詳しく説明してください...",
    generateImage: "画像を生成",
    generateVideo: "動画を生成",
    generatingImage: "画像を生成中...",
    creatingVideo: "動画を生成中...",
    videoQueued: "動画を生成しています。数分かかる場合があります。",
    imageEmpty: "まだ非公開画像がありません。上で説明して作成してください。",
    videoEmpty: "まだ非公開動画がありません。上で説明して作成してください。",
    setChatImage: "自分のチャット画像に設定",
    activeChatImage: "現在のチャット画像",
    useDefaultImage: "デフォルト画像に戻す",
    deleteImage: "画像を削除",
    deleteVideo: "動画を削除",
    imageLimitReached: "新しい画像を作る前に1枚削除してください。",
    videoLimitReached: "新しい動画を作る前に1本削除してください。",
    backToChat: "チャットに戻る",
    duration: "長さ",
    seconds: "秒",
    pricingPending: "動画価格は設定待ちです",
    pricingPendingBody:
      "動画生成は接続済みですが、KissCoins価格が設定されるまで無効です。",
    imageRequestBusy: "すでに画像を生成しています。",
    videoRequestBusy: "すでに動画を生成しています。",
    mediaError: "リクエストを完了できませんでした。"
  },
  KO: {
    toolbarLabel: (name) => `${name} 이미지 및 영상 갤러리`,
    title: (name) => `${name} 이미지 및 영상`,
    subtitle:
      "컴패니언의 현재 사진을 자동 참조하여 비공개 이미지와 영상을 만들 수 있습니다. 이 갤러리는 본인만 볼 수 있습니다.",
    privateOnly: "내 계정 전용",
    imageStudio: "이미지 스튜디오",
    videoStudio: "영상 스튜디오",
    images: "이미지",
    videos: "영상",
    describeImage:
      "캐릭터, 의상, 포즈, 배경, 조명, 분위기를 원하는 대로 자세히 설명하세요...",
    describeVideo:
      "캐릭터의 행동, 배경, 움직임, 카메라, 조명, 분위기를 자세히 설명하세요...",
    generateImage: "이미지 생성",
    generateVideo: "영상 생성",
    generatingImage: "이미지 생성 중...",
    creatingVideo: "영상 생성 중...",
    videoQueued: "영상을 생성하고 있습니다. 몇 분 정도 걸릴 수 있습니다.",
    imageEmpty: "아직 비공개 이미지가 없습니다. 위에서 설명해 만들어 보세요.",
    videoEmpty: "아직 비공개 영상이 없습니다. 위에서 설명해 만들어 보세요.",
    setChatImage: "내 채팅 이미지로 사용",
    activeChatImage: "현재 채팅 이미지",
    useDefaultImage: "기본 이미지로 돌아가기",
    deleteImage: "이미지 삭제",
    deleteVideo: "영상 삭제",
    imageLimitReached: "새 이미지를 만들기 전에 기존 이미지를 삭제하세요.",
    videoLimitReached: "새 영상을 만들기 전에 기존 영상을 삭제하세요.",
    backToChat: "채팅으로 돌아가기",
    duration: "길이",
    seconds: "초",
    pricingPending: "영상 가격 설정 대기 중",
    pricingPendingBody:
      "영상 생성은 연결되었지만 KissCoins 가격을 설정할 때까지 비활성화됩니다.",
    imageRequestBusy: "이미지를 이미 생성하고 있습니다.",
    videoRequestBusy: "영상을 이미 생성하고 있습니다.",
    mediaError: "요청을 완료할 수 없습니다."
  }
};
