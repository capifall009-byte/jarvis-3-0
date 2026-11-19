import { WebSearchView } from "./WebSearchView";

interface ResearchViewProps {
  isOnline: boolean;
  extremeDark: boolean;
  onSpeakText: (text: string) => void;
}

export function ResearchView(props: ResearchViewProps) {
  // Réutilise le module Recherche Web/approfondie existant (7.3) pour préserver les fonctionnalités.
  return <WebSearchView {...props} initialMode="research" />;
}
