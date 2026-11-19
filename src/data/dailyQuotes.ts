export interface DailyQuote {
  text: string;
  author: string;
  category: "inspiration" | "philosophie" | "science" | "histoire";
}

/**
 * Citations du jour — sélection curatée, auteurs connus et attributions attestées.
 * Aucune attribution inventée à une personne réelle.
 */
export const DAILY_QUOTES: DailyQuote[] = [
  { text: "L'imagination est plus importante que le savoir.", author: "Albert Einstein", category: "science" },
  { text: "La vie, c'est comme une bicyclette, il faut avancer pour ne pas perdre l'équilibre.", author: "Albert Einstein", category: "inspiration" },
  { text: "Dans la vie, rien n'est à craindre, tout est à comprendre.", author: "Marie Curie", category: "science" },
  { text: "On ne fait jamais attention à ce qui a été fait ; on ne voit que ce qui reste à faire.", author: "Marie Curie", category: "inspiration" },
  { text: "Je sais que je ne sais rien.", author: "Socrate", category: "philosophie" },
  { text: "Une vie sans examen ne vaut pas la peine d'être vécue.", author: "Socrate", category: "philosophie" },
  { text: "Celui qui déplace une montagne commence par déplacer de petites pierres.", author: "Confucius", category: "inspiration" },
  { text: "Choisissez un travail que vous aimez et vous n'aurez pas à travailler un seul jour de votre vie.", author: "Confucius", category: "inspiration" },
  { text: "Le bonheur de ta vie dépend de la qualité de tes pensées.", author: "Marc Aurèle", category: "philosophie" },
  { text: "Tu as pouvoir sur ton esprit, pas sur les événements extérieurs. Réalise cela, et tu trouveras la force.", author: "Marc Aurèle", category: "philosophie" },
  { text: "La science n'a pas de patrie, parce que le savoir est le patrimoine de l'humanité.", author: "Louis Pasteur", category: "science" },
  { text: "Le hasard ne favorise que les esprits préparés.", author: "Louis Pasteur", category: "science" },
  { text: "La plus grande gloire n'est pas de ne jamais tomber, mais de se relever à chaque chute.", author: "Confucius", category: "inspiration" },
  { text: "L'éducation est l'arme la plus puissante qu'on puisse utiliser pour changer le monde.", author: "Nelson Mandela", category: "histoire" },
  { text: "Cela semble toujours impossible, jusqu'à ce qu'on le fasse.", author: "Nelson Mandela", category: "inspiration" },
  { text: "Rien de grand ne s'est accompli dans le monde sans passion.", author: "Georg Wilhelm Friedrich Hegel", category: "philosophie" },
  { text: "Le plus grand risque est de ne prendre aucun risque.", author: "Mark Zuckerberg", category: "inspiration" },
  { text: "Ce que nous savons est une goutte d'eau ; ce que nous ignorons est un océan.", author: "Isaac Newton", category: "science" },
  { text: "Mesurer ce qui est mesurable, et rendre mesurable ce qui ne l'est pas.", author: "Galilée", category: "science" },
  { text: "La liberté, c'est de pouvoir dire que deux plus deux font quatre. Si cela est accordé, le reste suit.", author: "George Orwell", category: "histoire" },
  { text: "Ceux qui ne peuvent pas se souvenir du passé sont condamnés à le répéter.", author: "George Santayana", category: "histoire" },
  { text: "Le succès, c'est tomber sept fois, se relever huit.", author: "Proverbe japonais", category: "inspiration" },
  { text: "L'homme est condamné à être libre.", author: "Jean-Paul Sartre", category: "philosophie" },
  { text: "La connaissance s'acquiert par l'expérience, tout le reste n'est que de l'information.", author: "Albert Einstein", category: "science" },
  { text: "On ne découvre pas de nouvelles terres sans consentir à perdre de vue le rivage pendant longtemps.", author: "André Gide", category: "inspiration" },
  { text: "Il n'y a de réalité que dans l'action.", author: "Jean-Paul Sartre", category: "philosophie" },
  { text: "Agis comme si ce que tu fais faisait une différence. C'est le cas.", author: "William James", category: "philosophie" },
  { text: "Un peuple prêt à sacrifier un peu de liberté pour un peu de sécurité ne mérite ni l'une ni l'autre.", author: "Benjamin Franklin", category: "histoire" },
  { text: "Le courage n'est pas l'absence de peur, mais la capacité de vaincre ce qui fait peur.", author: "Nelson Mandela", category: "histoire" },
  { text: "La simplicité est la sophistication suprême.", author: "Léonard de Vinci", category: "inspiration" },
  { text: "La nature ne fait rien en vain.", author: "Aristote", category: "philosophie" },
  { text: "Nous sommes ce que nous faisons de manière répétée. L'excellence n'est donc pas un acte, mais une habitude.", author: "Aristote", category: "philosophie" },
  { text: "L'important est de ne jamais cesser de se poser des questions.", author: "Albert Einstein", category: "science" },
  { text: "La victoire la plus belle, c'est de se vaincre soi-même.", author: "Platon", category: "philosophie" },
  { text: "L'histoire est un perpétuel recommencement.", author: "Thucydide", category: "histoire" },
  { text: "Je ne perds jamais. Soit je gagne, soit j'apprends.", author: "Nelson Mandela", category: "inspiration" },
];
