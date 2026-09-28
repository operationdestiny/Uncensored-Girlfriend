import type { LanguageCode } from "@/lib/site-language";

export const LOCALE_BY_LANGUAGE: Record<LanguageCode, string> = {
  EN: "en-US",
  ES: "es-ES",
  FR: "fr-FR",
  DE: "de-DE",
  JA: "ja-JP",
  KO: "ko-KR"
};

type FinalLocalizationCopy = {
  close: string;
  contactWith: string;
  contactImageAlt: string;
  restoringBond: string;
  translatingCharacter: string;
  translationUnavailable: string;
  shareTitle: (name: string) => string;
  shareText: (name: string) => string;
  googlePasswordTooltip: string;
  coinRequiredMessage: string;
  keepCompanion: string;
  chooseImage: string;
  noImageSelected: string;
  bannerAlt: {
    discover: string;
    pricing: string;
    create: string;
  };
  reset: {
    notConfigured: string;
    minimumLength: string;
    mismatch: string;
    openEmailFirst: string;
    updateFailed: string;
    completeTitle: string;
    chooseTitle: string;
    completeBody: string;
    returnToBond: string;
    verifying: string;
    newPassword: string;
    confirmPassword: string;
    working: string;
    updateButton: string;
    openEmailBody: string;
  };
  safety: {
    description: string;
    bullet1: string;
    bullet2: string;
    bullet3: string;
  };
  metadata: {
    siteTitle: string;
    description: string;
    discover: string;
    create: string;
    coins: string;
    shop: string;
    myBond: string;
    why: string;
    safety: string;
    legal: string;
    contact: string;
    account: string;
    reset: string;
    pricing: string;
    companionNotFound: string;
  };
  errors: {
    generic: string;
    network: string;
    login: string;
    signup: string;
    google: string;
    checkout: string;
    createCharacter: string;
    updateCharacter: string;
    deleteCharacter: string;
    loadBond: string;
    media: string;
    voice: string;
    chat: string;
    password: string;
    accountDelete: string;
  };
};

export const FINAL_LOCALIZATION_COPY: Record<
  LanguageCode,
  FinalLocalizationCopy
> = {
  EN: {
    close: "Close",
    contactWith: "with",
    contactImageAlt: "Uncensored Girlfriend contact support",
    restoringBond: "Restoring your bond...",
    translatingCharacter: "Translating this companion...",
    translationUnavailable: "This companion’s translation is temporarily unavailable. Please try again.",
    shareTitle: (name) => `${name} on Uncensored Girlfriend`,
    shareText: (name) => `Meet ${name} on Uncensored Girlfriend.`,
    googlePasswordTooltip: "Google signup, no password provided",
    coinRequiredMessage:
      "Buy KissCoins so I can keep being your companion. One KissCoins keeps one message going.",
    keepCompanion: "Keep your companion",
    chooseImage: "Choose image",
    noImageSelected: "No image selected",
    bannerAlt: {
      discover: "Discover AI companions with Memory",
      pricing: "Buy KissCoins for messages and features",
      create: "Create your own AI companion with Memory"
    },
    reset: {
      notConfigured: "Password reset is not configured.",
      minimumLength: "Use a password with at least 8 characters.",
      mismatch: "The passwords do not match.",
      openEmailFirst: "Open the password-reset link from your email first.",
      updateFailed: "The password could not be updated.",
      completeTitle: "Password updated",
      chooseTitle: "Choose a new password",
      completeBody:
        "Your new password is active. You can return to My Bond and continue using your account.",
      returnToBond: "Return to My Bond",
      verifying: "Verifying your reset link...",
      newPassword: "New password",
      confirmPassword: "Confirm new password",
      working: "One moment...",
      updateButton: "Update password",
      openEmailBody:
        "Open the password-reset link from your email to continue."
    },
    safety: {
      description:
        "Uncensored Girlfriend is designed for private emotional story chat, mature romance, and user freedom while prohibiting illegal, exploitative, or unsafe content.",
      bullet1:
        "User-created companions are private or accessible only through a share link.",
      bullet2:
        "Companions must not impersonate real people or infringe intellectual-property rights.",
      bullet3:
        "Account and Memory data can be managed or permanently deleted through My Bond."
    },
    metadata: {
      siteTitle: "Uncensored Girlfriend — AI companions that remember you",
      description:
        "Private AI companions built for lasting memory, story continuity, and emotional roleplay.",
      discover: "Discover Companions — Uncensored Girlfriend",
      create: "Create a Companion — Uncensored Girlfriend",
      coins: "Buy KissCoins — Uncensored Girlfriend",
      shop: "Gift Shop — Uncensored Girlfriend",
      myBond: "My Bond — Uncensored Girlfriend",
      why: "Why Uncensored Girlfriend — Uncensored Girlfriend",
      safety: "Safety — Uncensored Girlfriend",
      legal: "Legal — Uncensored Girlfriend",
      contact: "Contact — Uncensored Girlfriend",
      account: "Account — Uncensored Girlfriend",
      reset: "Reset Password — Uncensored Girlfriend",
      pricing: "KissCoins — Uncensored Girlfriend",
      companionNotFound: "Companion not found — Uncensored Girlfriend"
    },
    errors: {
      generic: "Something went wrong. Please try again.",
      network: "A network error occurred. Please try again.",
      login: "Login could not be completed. Please try again.",
      signup: "The account could not be created. Please try again.",
      google: "Google sign-in could not start. Please try again.",
      checkout: "Checkout could not be started. Please try again.",
      createCharacter: "The companion could not be created.",
      updateCharacter: "The companion could not be updated.",
      deleteCharacter: "The companion could not be deleted.",
      loadBond: "Your bond could not be loaded.",
      media: "The media request could not be completed.",
      voice: "The voice call could not be completed.",
      chat: "The message could not be sent. Please try again.",
      password: "The password could not be updated.",
      accountDelete: "The account could not be deleted."
    }
  },
  ES: {
    close: "Cerrar",
    contactWith: "con",
    contactImageAlt: "Soporte de contacto de Uncensored Girlfriend",
    restoringBond: "Restaurando tu vínculo...",
    translatingCharacter: "Traduciendo este compañero...",
    translationUnavailable: "La traducción de este compañero no está disponible temporalmente. Inténtalo de nuevo.",
    shareTitle: (name) => `${name} en Uncensored Girlfriend`,
    shareText: (name) => `Conoce a ${name} en Uncensored Girlfriend.`,
    googlePasswordTooltip:
      "Registro con Google; no se proporcionó contraseña",
    coinRequiredMessage:
      "Compra KissCoins para que pueda seguir siendo tu compañero. Un KissCoins mantiene activo un mensaje.",
    keepCompanion: "Conserva a tu compañero",
    chooseImage: "Elegir imagen",
    noImageSelected: "Ninguna imagen seleccionada",
    bannerAlt: {
      discover: "Descubre compañeros de IA con Memory",
      pricing: "Compra KissCoins para mensajes y funciones",
      create: "Crea tu propio compañero de IA con Memory"
    },
    reset: {
      notConfigured: "El restablecimiento de contraseña no está configurado.",
      minimumLength: "Usa una contraseña de al menos 8 caracteres.",
      mismatch: "Las contraseñas no coinciden.",
      openEmailFirst:
        "Primero abre el enlace de restablecimiento enviado a tu correo.",
      updateFailed: "No se pudo actualizar la contraseña.",
      completeTitle: "Contraseña actualizada",
      chooseTitle: "Elige una nueva contraseña",
      completeBody:
        "Tu nueva contraseña está activa. Puedes volver a Mi Vínculo y continuar usando tu cuenta.",
      returnToBond: "Volver a Mi Vínculo",
      verifying: "Verificando tu enlace de restablecimiento...",
      newPassword: "Nueva contraseña",
      confirmPassword: "Confirmar nueva contraseña",
      working: "Un momento...",
      updateButton: "Actualizar contraseña",
      openEmailBody:
        "Abre el enlace de restablecimiento enviado a tu correo para continuar."
    },
    safety: {
      description:
        "Uncensored Girlfriend está diseñado para chats privados de historias emocionales, romance adulto y libertad del usuario, y prohíbe el contenido ilegal, explotador o inseguro.",
      bullet1:
        "Los compañeros creados por usuarios son privados o solo accesibles mediante un enlace compartido.",
      bullet2:
        "Los compañeros no deben suplantar a personas reales ni infringir derechos de propiedad intelectual.",
      bullet3:
        "Los datos de la cuenta y de Memory pueden gestionarse o eliminarse permanentemente desde Mi Vínculo."
    },
    metadata: {
      siteTitle: "Uncensored Girlfriend — Compañeros de IA que te recuerdan",
      description:
        "Compañeros de IA privados creados para memoria duradera, continuidad de historias y rol emocional.",
      discover: "Descubrir compañeros — Uncensored Girlfriend",
      create: "Crear un compañero — Uncensored Girlfriend",
      coins: "Comprar KissCoins — Uncensored Girlfriend",
      shop: "Gift Shop — Uncensored Girlfriend",
      myBond: "Mi Vínculo — Uncensored Girlfriend",
      why: "Por qué Uncensored Girlfriend — Uncensored Girlfriend",
      safety: "Seguridad — Uncensored Girlfriend",
      legal: "Legal — Uncensored Girlfriend",
      contact: "Contacto — Uncensored Girlfriend",
      account: "Cuenta — Uncensored Girlfriend",
      reset: "Restablecer contraseña — Uncensored Girlfriend",
      pricing: "KissCoins — Uncensored Girlfriend",
      companionNotFound: "Compañero no encontrado — Uncensored Girlfriend"
    },
    errors: {
      generic: "Algo salió mal. Inténtalo de nuevo.",
      network: "Se produjo un error de red. Inténtalo de nuevo.",
      login: "No se pudo iniciar sesión. Inténtalo de nuevo.",
      signup: "No se pudo crear la cuenta. Inténtalo de nuevo.",
      google: "No se pudo iniciar el acceso con Google. Inténtalo de nuevo.",
      checkout: "No se pudo iniciar el pago. Inténtalo de nuevo.",
      createCharacter: "No se pudo crear el compañero.",
      updateCharacter: "No se pudo actualizar el compañero.",
      deleteCharacter: "No se pudo eliminar el compañero.",
      loadBond: "No se pudo cargar tu vínculo.",
      media: "No se pudo completar la solicitud multimedia.",
      voice: "No se pudo completar la llamada de voz.",
      chat: "No se pudo enviar el mensaje. Inténtalo de nuevo.",
      password: "No se pudo actualizar la contraseña.",
      accountDelete: "No se pudo eliminar la cuenta."
    }
  },
  FR: {
    close: "Fermer",
    contactWith: "avec",
    contactImageAlt: "Assistance de contact Uncensored Girlfriend",
    restoringBond: "Restauration de votre lien...",
    translatingCharacter: "Traduction de ce compagnon...",
    translationUnavailable: "La traduction de ce compagnon est temporairement indisponible. Réessayez.",
    shareTitle: (name) => `${name} sur Uncensored Girlfriend`,
    shareText: (name) => `Découvrez ${name} sur Uncensored Girlfriend.`,
    googlePasswordTooltip:
      "Inscription avec Google, aucun mot de passe fourni",
    coinRequiredMessage:
      "Achetez des KissCoins pour que je puisse rester votre compagnon. Un KissCoins permet de poursuivre un message.",
    keepCompanion: "Gardez votre compagnon",
    chooseImage: "Choisir une image",
    noImageSelected: "Aucune image sélectionnée",
    bannerAlt: {
      discover: "Découvrez des compagnons IA avec Memory",
      pricing: "Achetez des KissCoins pour les messages et les fonctionnalités",
      create: "Créez votre propre compagnon IA avec Memory"
    },
    reset: {
      notConfigured:
        "La réinitialisation du mot de passe n’est pas configurée.",
      minimumLength:
        "Utilisez un mot de passe d’au moins 8 caractères.",
      mismatch: "Les mots de passe ne correspondent pas.",
      openEmailFirst:
        "Ouvrez d’abord le lien de réinitialisation reçu par e-mail.",
      updateFailed: "Le mot de passe n’a pas pu être mis à jour.",
      completeTitle: "Mot de passe mis à jour",
      chooseTitle: "Choisissez un nouveau mot de passe",
      completeBody:
        "Votre nouveau mot de passe est actif. Vous pouvez retourner dans Mon Lien et continuer à utiliser votre compte.",
      returnToBond: "Retourner dans Mon Lien",
      verifying: "Vérification de votre lien de réinitialisation...",
      newPassword: "Nouveau mot de passe",
      confirmPassword: "Confirmer le nouveau mot de passe",
      working: "Un instant...",
      updateButton: "Mettre à jour le mot de passe",
      openEmailBody:
        "Ouvrez le lien de réinitialisation reçu par e-mail pour continuer."
    },
    safety: {
      description:
        "Uncensored Girlfriend est conçu pour les discussions privées à dimension émotionnelle, la romance adulte et la liberté des utilisateurs, tout en interdisant les contenus illégaux, abusifs ou dangereux.",
      bullet1:
        "Les compagnons créés par les utilisateurs sont privés ou accessibles uniquement par un lien de partage.",
      bullet2:
        "Les compagnons ne doivent pas usurper l’identité de personnes réelles ni enfreindre des droits de propriété intellectuelle.",
      bullet3:
        "Les données du compte et d’Memory peuvent être gérées ou supprimées définitivement depuis Mon Lien."
    },
    metadata: {
      siteTitle: "Uncensored Girlfriend — Des compagnons IA qui se souviennent de vous",
      description:
        "Des compagnons IA privés conçus pour une mémoire durable, la continuité des histoires et le jeu de rôle émotionnel.",
      discover: "Découvrir des compagnons — Uncensored Girlfriend",
      create: "Créer un compagnon — Uncensored Girlfriend",
      coins: "Acheter des KissCoins — Uncensored Girlfriend",
      shop: "Gift Shop — Uncensored Girlfriend",
      myBond: "Mon Lien — Uncensored Girlfriend",
      why: "Pourquoi Uncensored Girlfriend — Uncensored Girlfriend",
      safety: "Sécurité — Uncensored Girlfriend",
      legal: "Mentions légales — Uncensored Girlfriend",
      contact: "Contact — Uncensored Girlfriend",
      account: "Compte — Uncensored Girlfriend",
      reset: "Réinitialiser le mot de passe — Uncensored Girlfriend",
      pricing: "KissCoins — Uncensored Girlfriend",
      companionNotFound: "Compagnon introuvable — Uncensored Girlfriend"
    },
    errors: {
      generic: "Une erreur s’est produite. Réessayez.",
      network: "Une erreur réseau s’est produite. Réessayez.",
      login: "La connexion n’a pas pu aboutir. Réessayez.",
      signup: "Le compte n’a pas pu être créé. Réessayez.",
      google: "La connexion Google n’a pas pu démarrer. Réessayez.",
      checkout: "Le paiement n’a pas pu démarrer. Réessayez.",
      createCharacter: "Le compagnon n’a pas pu être créé.",
      updateCharacter: "Le compagnon n’a pas pu être mis à jour.",
      deleteCharacter: "Le compagnon n’a pas pu être supprimé.",
      loadBond: "Votre lien n’a pas pu être chargé.",
      media: "La demande multimédia n’a pas pu aboutir.",
      voice: "L’appel vocal n’a pas pu aboutir.",
      chat: "Le message n’a pas pu être envoyé. Réessayez.",
      password: "Le mot de passe n’a pas pu être mis à jour.",
      accountDelete: "Le compte n’a pas pu être supprimé."
    }
  },
  DE: {
    close: "Schließen",
    contactWith: "mit",
    contactImageAlt: "Uncensored Girlfriend-Kontaktsupport",
    restoringBond: "Deine Bindung wird wiederhergestellt...",
    translatingCharacter: "Dieser Begleiter wird übersetzt...",
    translationUnavailable: "Die Übersetzung dieses Begleiters ist vorübergehend nicht verfügbar. Versuche es erneut.",
    shareTitle: (name) => `${name} bei Uncensored Girlfriend`,
    shareText: (name) => `Lerne ${name} bei Uncensored Girlfriend kennen.`,
    googlePasswordTooltip:
      "Registrierung mit Google, kein Passwort angegeben",
    coinRequiredMessage:
      "Kaufe KissCoins, damit ich dein Begleiter bleiben kann. Ein KissCoins hält eine Nachricht am Laufen.",
    keepCompanion: "Behalte deinen Begleiter",
    chooseImage: "Bild auswählen",
    noImageSelected: "Kein Bild ausgewählt",
    bannerAlt: {
      discover: "Entdecke KI-Begleiter mit Memory",
      pricing: "Kaufe KissCoins für Nachrichten und Funktionen",
      create: "Erstelle deinen eigenen KI-Begleiter mit Memory"
    },
    reset: {
      notConfigured: "Das Zurücksetzen des Passworts ist nicht konfiguriert.",
      minimumLength: "Verwende ein Passwort mit mindestens 8 Zeichen.",
      mismatch: "Die Passwörter stimmen nicht überein.",
      openEmailFirst:
        "Öffne zuerst den Link zum Zurücksetzen aus deiner E-Mail.",
      updateFailed: "Das Passwort konnte nicht aktualisiert werden.",
      completeTitle: "Passwort aktualisiert",
      chooseTitle: "Wähle ein neues Passwort",
      completeBody:
        "Dein neues Passwort ist aktiv. Du kannst zu Meine Bindung zurückkehren und dein Konto weiterverwenden.",
      returnToBond: "Zurück zu Meine Bindung",
      verifying: "Dein Zurücksetzungslink wird geprüft...",
      newPassword: "Neues Passwort",
      confirmPassword: "Neues Passwort bestätigen",
      working: "Einen Moment...",
      updateButton: "Passwort aktualisieren",
      openEmailBody:
        "Öffne den Link zum Zurücksetzen aus deiner E-Mail, um fortzufahren."
    },
    safety: {
      description:
        "Uncensored Girlfriend ist für private emotionale Geschichten, erwachsene Romantik und Nutzerfreiheit konzipiert und verbietet illegale, ausbeuterische oder unsichere Inhalte.",
      bullet1:
        "Von Nutzern erstellte Begleiter sind privat oder nur über einen Freigabelink erreichbar.",
      bullet2:
        "Begleiter dürfen keine realen Personen imitieren oder Rechte am geistigen Eigentum verletzen.",
      bullet3:
        "Konto- und Ever-Memory-Daten können unter Meine Bindung verwaltet oder dauerhaft gelöscht werden."
    },
    metadata: {
      siteTitle: "Uncensored Girlfriend — KI-Begleiter, die sich an dich erinnern",
      description:
        "Private KI-Begleiter für dauerhafte Erinnerungen, fortlaufende Geschichten und emotionales Rollenspiel.",
      discover: "Begleiter entdecken — Uncensored Girlfriend",
      create: "Begleiter erstellen — Uncensored Girlfriend",
      coins: "KissCoins kaufen — Uncensored Girlfriend",
      shop: "Gift Shop — Uncensored Girlfriend",
      myBond: "Meine Bindung — Uncensored Girlfriend",
      why: "Warum Uncensored Girlfriend — Uncensored Girlfriend",
      safety: "Sicherheit — Uncensored Girlfriend",
      legal: "Rechtliches — Uncensored Girlfriend",
      contact: "Kontakt — Uncensored Girlfriend",
      account: "Konto — Uncensored Girlfriend",
      reset: "Passwort zurücksetzen — Uncensored Girlfriend",
      pricing: "KissCoins — Uncensored Girlfriend",
      companionNotFound: "Begleiter nicht gefunden — Uncensored Girlfriend"
    },
    errors: {
      generic: "Etwas ist schiefgelaufen. Versuche es erneut.",
      network: "Ein Netzwerkfehler ist aufgetreten. Versuche es erneut.",
      login: "Die Anmeldung konnte nicht abgeschlossen werden. Versuche es erneut.",
      signup: "Das Konto konnte nicht erstellt werden. Versuche es erneut.",
      google: "Die Google-Anmeldung konnte nicht gestartet werden. Versuche es erneut.",
      checkout: "Der Bezahlvorgang konnte nicht gestartet werden. Versuche es erneut.",
      createCharacter: "Der Begleiter konnte nicht erstellt werden.",
      updateCharacter: "Der Begleiter konnte nicht aktualisiert werden.",
      deleteCharacter: "Der Begleiter konnte nicht gelöscht werden.",
      loadBond: "Deine Bindung konnte nicht geladen werden.",
      media: "Die Medienanfrage konnte nicht abgeschlossen werden.",
      voice: "Der Sprachanruf konnte nicht abgeschlossen werden.",
      chat: "Die Nachricht konnte nicht gesendet werden. Versuche es erneut.",
      password: "Das Passwort konnte nicht aktualisiert werden.",
      accountDelete: "Das Konto konnte nicht gelöscht werden."
    }
  },
  JA: {
    close: "閉じる",
    contactWith: "",
    contactImageAlt: "Uncensored Girlfriendお問い合わせサポート",
    restoringBond: "絆を復元しています...",
    translatingCharacter: "このコンパニオンを翻訳しています...",
    translationUnavailable: "このコンパニオンの翻訳は一時的に利用できません。もう一度お試しください。",
    shareTitle: (name) => `Uncensored Girlfriendの${name}`,
    shareText: (name) => `Uncensored Girlfriendで${name}に会いましょう。`,
    googlePasswordTooltip:
      "Googleで登録したため、パスワードは設定されていません",
    coinRequiredMessage:
      "これからもコンパニオンでいられるようにKissCoinsを購入してください。1メッセージの継続に1 KissCoinsを使用します。",
    keepCompanion: "コンパニオンとの絆を続ける",
    chooseImage: "画像を選択",
    noImageSelected: "画像が選択されていません",
    bannerAlt: {
      discover: "Memoryを備えたAIコンパニオンを探す",
      pricing: "メッセージや機能に使うKissCoinsを購入",
      create: "Memoryを備えた自分だけのAIコンパニオンを作成"
    },
    reset: {
      notConfigured: "パスワードのリセットが設定されていません。",
      minimumLength: "8文字以上のパスワードを使用してください。",
      mismatch: "パスワードが一致しません。",
      openEmailFirst:
        "最初にメールに届いたパスワードリセットリンクを開いてください。",
      updateFailed: "パスワードを更新できませんでした。",
      completeTitle: "パスワードを更新しました",
      chooseTitle: "新しいパスワードを設定",
      completeBody:
        "新しいパスワードが有効になりました。マイボンドに戻ってアカウントを引き続き利用できます。",
      returnToBond: "マイボンドに戻る",
      verifying: "リセットリンクを確認しています...",
      newPassword: "新しいパスワード",
      confirmPassword: "新しいパスワードを確認",
      working: "処理中...",
      updateButton: "パスワードを更新",
      openEmailBody:
        "続行するには、メールに届いたパスワードリセットリンクを開いてください。"
    },
    safety: {
      description:
        "Uncensored Girlfriendは、違法・搾取的・危険なコンテンツを禁止しながら、非公開の感情的な物語チャット、大人向けロマンス、ユーザーの自由を提供します。",
      bullet1:
        "ユーザー作成のコンパニオンは非公開、または共有リンクからのみアクセスできます。",
      bullet2:
        "コンパニオンは実在の人物になりすましたり、知的財産権を侵害したりしてはなりません。",
      bullet3:
        "アカウントとMemoryのデータは、マイボンドから管理または完全に削除できます。"
    },
    metadata: {
      siteTitle: "Uncensored Girlfriend — あなたを覚えているAIコンパニオン",
      description:
        "長期記憶、物語の継続性、感情的なロールプレイのための非公開AIコンパニオン。",
      discover: "コンパニオンを探す — Uncensored Girlfriend",
      create: "コンパニオンを作成 — Uncensored Girlfriend",
      coins: "KissCoinsを購入 — Uncensored Girlfriend",
      shop: "Gift Shop — Uncensored Girlfriend",
      myBond: "マイボンド — Uncensored Girlfriend",
      why: "Uncensored Girlfriendを選ぶ理由 — Uncensored Girlfriend",
      safety: "安全性 — Uncensored Girlfriend",
      legal: "法的情報 — Uncensored Girlfriend",
      contact: "お問い合わせ — Uncensored Girlfriend",
      account: "アカウント — Uncensored Girlfriend",
      reset: "パスワードをリセット — Uncensored Girlfriend",
      pricing: "KissCoins — Uncensored Girlfriend",
      companionNotFound: "コンパニオンが見つかりません — Uncensored Girlfriend"
    },
    errors: {
      generic: "問題が発生しました。もう一度お試しください。",
      network: "ネットワークエラーが発生しました。もう一度お試しください。",
      login: "ログインできませんでした。もう一度お試しください。",
      signup: "アカウントを作成できませんでした。もう一度お試しください。",
      google: "Googleログインを開始できませんでした。もう一度お試しください。",
      checkout: "決済を開始できませんでした。もう一度お試しください。",
      createCharacter: "コンパニオンを作成できませんでした。",
      updateCharacter: "コンパニオンを更新できませんでした。",
      deleteCharacter: "コンパニオンを削除できませんでした。",
      loadBond: "絆を読み込めませんでした。",
      media: "メディアの処理を完了できませんでした。",
      voice: "音声通話を完了できませんでした。",
      chat: "メッセージを送信できませんでした。もう一度お試しください。",
      password: "パスワードを更新できませんでした。",
      accountDelete: "アカウントを削除できませんでした。"
    }
  },
  KO: {
    close: "닫기",
    contactWith: "",
    contactImageAlt: "Uncensored Girlfriend 문의 지원",
    restoringBond: "인연을 복원하는 중...",
    translatingCharacter: "이 컴패니언을 번역하는 중...",
    translationUnavailable: "이 컴패니언의 번역을 일시적으로 사용할 수 없습니다. 다시 시도하세요.",
    shareTitle: (name) => `Uncensored Girlfriend의 ${name}`,
    shareText: (name) => `Uncensored Girlfriend에서 ${name}을(를) 만나보세요.`,
    googlePasswordTooltip:
      "Google로 가입하여 비밀번호가 설정되지 않았습니다",
    coinRequiredMessage:
      "계속 당신의 컴패니언으로 함께할 수 있도록 KissCoins을 구매하세요. 메시지 하나를 이어가는 데 KissCoins 1개가 사용됩니다.",
    keepCompanion: "컴패니언과 계속 함께하기",
    chooseImage: "이미지 선택",
    noImageSelected: "선택된 이미지 없음",
    bannerAlt: {
      discover: "Memory가 있는 AI 컴패니언 찾기",
      pricing: "메시지와 기능을 위한 KissCoins 구매",
      create: "Memory가 있는 나만의 AI 컴패니언 만들기"
    },
    reset: {
      notConfigured: "비밀번호 재설정이 구성되지 않았습니다.",
      minimumLength: "8자 이상의 비밀번호를 사용하세요.",
      mismatch: "비밀번호가 일치하지 않습니다.",
      openEmailFirst:
        "먼저 이메일의 비밀번호 재설정 링크를 여세요.",
      updateFailed: "비밀번호를 업데이트할 수 없습니다.",
      completeTitle: "비밀번호가 업데이트되었습니다",
      chooseTitle: "새 비밀번호 설정",
      completeBody:
        "새 비밀번호가 활성화되었습니다. 마이 본드로 돌아가 계정을 계속 사용할 수 있습니다.",
      returnToBond: "마이 본드로 돌아가기",
      verifying: "재설정 링크를 확인하는 중...",
      newPassword: "새 비밀번호",
      confirmPassword: "새 비밀번호 확인",
      working: "잠시만요...",
      updateButton: "비밀번호 업데이트",
      openEmailBody:
        "계속하려면 이메일의 비밀번호 재설정 링크를 여세요."
    },
    safety: {
      description:
        "Uncensored Girlfriend는 불법적이거나 착취적이거나 위험한 콘텐츠를 금지하면서 비공개 감정 스토리 채팅, 성인 로맨스와 사용자 자유를 제공합니다.",
      bullet1:
        "사용자가 만든 컴패니언은 비공개이거나 공유 링크를 통해서만 접근할 수 있습니다.",
      bullet2:
        "컴패니언은 실제 인물을 사칭하거나 지식재산권을 침해해서는 안 됩니다.",
      bullet3:
        "계정과 Memory 데이터는 마이 본드에서 관리하거나 영구적으로 삭제할 수 있습니다."
    },
    metadata: {
      siteTitle: "Uncensored Girlfriend — 당신을 기억하는 AI 컴패니언",
      description:
        "지속적인 기억, 이야기의 연속성, 감정적 역할극을 위한 비공개 AI 컴패니언.",
      discover: "컴패니언 찾기 — Uncensored Girlfriend",
      create: "컴패니언 만들기 — Uncensored Girlfriend",
      coins: "KissCoins 구매 — Uncensored Girlfriend",
      shop: "Gift Shop — Uncensored Girlfriend",
      myBond: "마이 본드 — Uncensored Girlfriend",
      why: "Uncensored Girlfriend를 선택하는 이유 — Uncensored Girlfriend",
      safety: "안전 — Uncensored Girlfriend",
      legal: "법적 정보 — Uncensored Girlfriend",
      contact: "문의 — Uncensored Girlfriend",
      account: "계정 — Uncensored Girlfriend",
      reset: "비밀번호 재설정 — Uncensored Girlfriend",
      pricing: "KissCoins — Uncensored Girlfriend",
      companionNotFound: "컴패니언을 찾을 수 없음 — Uncensored Girlfriend"
    },
    errors: {
      generic: "문제가 발생했습니다. 다시 시도하세요.",
      network: "네트워크 오류가 발생했습니다. 다시 시도하세요.",
      login: "로그인할 수 없습니다. 다시 시도하세요.",
      signup: "계정을 만들 수 없습니다. 다시 시도하세요.",
      google: "Google 로그인을 시작할 수 없습니다. 다시 시도하세요.",
      checkout: "결제를 시작할 수 없습니다. 다시 시도하세요.",
      createCharacter: "컴패니언을 만들 수 없습니다.",
      updateCharacter: "컴패니언을 업데이트할 수 없습니다.",
      deleteCharacter: "컴패니언을 삭제할 수 없습니다.",
      loadBond: "인연을 불러올 수 없습니다.",
      media: "미디어 요청을 완료할 수 없습니다.",
      voice: "음성 통화를 완료할 수 없습니다.",
      chat: "메시지를 보낼 수 없습니다. 다시 시도하세요.",
      password: "비밀번호를 업데이트할 수 없습니다.",
      accountDelete: "계정을 삭제할 수 없습니다."
    }
  }
};

const NETWORK_ERRORS = new Set([
  "failed to fetch",
  "load failed",
  "networkerror when attempting to fetch resource.",
  "network request failed"
]);

const ERROR_CATEGORY_BY_CODE: Record<
  string,
  keyof FinalLocalizationCopy["errors"]
> = {
  SIGNUP_REQUIRED: "login",
  AUTH_REQUIRED: "login",
  UNAUTHORIZED: "login",
  INVALID_LOGIN_CREDENTIALS: "login",
  ACCOUNT_NOT_FOUND: "login",
  EMAIL_NOT_CONFIRMED: "login",
  USER_ALREADY_REGISTERED: "signup",
  GOOGLE_AUTH_FAILED: "google",
  CHECKOUT_FAILED: "checkout",
  PADDLE_NOT_CONFIGURED: "checkout",
  CHARACTER_CREATE_FAILED: "createCharacter",
  CHARACTER_LIMIT_REACHED: "createCharacter",
  INVALID_CHARACTER: "createCharacter",
  CHARACTER_UPDATE_FAILED: "updateCharacter",
  CHARACTER_DELETE_FAILED: "deleteCharacter",
  CHAT_HISTORY_FAILED: "loadBond",
  MY_BOND_LOAD_FAILED: "loadBond",
  IMAGE_PROVIDER_FAILED: "media",
  IMAGE_PROVIDER_RETURNED_INVALID_FILE: "media",
  IMAGE_DOWNLOAD_FAILED: "media",
  IMAGE_REQUEST_IN_PROGRESS: "media",
  IMAGE_LIMIT_REACHED: "media",
  VIDEO_PROVIDER_FAILED: "media",
  VIDEO_REQUEST_IN_PROGRESS: "media",
  VIDEO_LIMIT_REACHED: "media",
  VIDEO_PRICING_NOT_CONFIGURED: "media",
  MEDIA_ERROR: "media",
  VOICE_NOT_CONFIGURED: "voice",
  VOICE_PROVIDER_FAILED: "voice",
  MICROPHONE_DENIED: "voice",
  AUDIO_NOT_SUPPORTED: "voice",
  EMPTY_AUDIO: "voice",
  CALL_LIMIT_REACHED: "voice",
  CALL_IDLE_ENDED: "voice",
  CHAT_FAILED: "chat",
  INVALID_MESSAGE: "chat",
  REQUEST_TOO_LARGE: "chat",
  RATE_LIMITED: "chat",
  PASSWORD_UPDATE_FAILED: "password",
  ACCOUNT_DELETE_FAILED: "accountDelete"
};

function normalizedErrorCode(value: string) {
  return value
    .trim()
    .split(":", 1)[0]
    .replace(/[\s.-]+/g, "_")
    .toUpperCase();
}

export function localizedErrorMessage(
  value: unknown,
  language: LanguageCode,
  fallback?: string,
  category: keyof FinalLocalizationCopy["errors"] = "generic"
) {
  const copy =
    FINAL_LOCALIZATION_COPY[language] ?? FINAL_LOCALIZATION_COPY.EN;
  const raw = typeof value === "string" ? value.trim() : "";

  if (!raw) return fallback || copy.errors[category];
  if (NETWORK_ERRORS.has(raw.toLowerCase())) return copy.errors.network;

  const errorCategory = ERROR_CATEGORY_BY_CODE[normalizedErrorCode(raw)];
  return errorCategory
    ? copy.errors[errorCategory]
    : fallback || copy.errors[category];
}

export function localizedMetadataForPath(
  pathname: string,
  language: LanguageCode,
  dynamicName?: string
) {
  const copy =
    FINAL_LOCALIZATION_COPY[language] ?? FINAL_LOCALIZATION_COPY.EN;
  const normalized = pathname.replace(/\/+$/, "") || "/";

  if (normalized.startsWith("/chat/") || normalized.startsWith("/character/")) {
    return {
      title: dynamicName
        ? `${dynamicName} — Uncensored Girlfriend`
        : copy.metadata.siteTitle,
      description: copy.metadata.description
    };
  }

  const titleByPath: Record<string, string> = {
    "/": copy.metadata.siteTitle,
    "/characters": copy.metadata.discover,
    "/create": copy.metadata.create,
    "/coins": copy.metadata.coins,
    "/shop": copy.metadata.shop,
    "/my-bond": copy.metadata.myBond,
    "/why-everbond": copy.metadata.why,
    "/safety": copy.metadata.safety,
    "/legal": copy.metadata.legal,
    "/contact": copy.metadata.contact,
    "/account": copy.metadata.account,
    "/auth/reset-password": copy.metadata.reset,
    "/pricing": copy.metadata.pricing
  };

  return {
    title: titleByPath[normalized] ?? copy.metadata.siteTitle,
    description: copy.metadata.description
  };
}
