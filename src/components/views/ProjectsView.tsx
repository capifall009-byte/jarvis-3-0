import { IntelligenceView } from "./IntelligenceView";
import type { ComponentProps } from "react";

type Props = Omit<ComponentProps<typeof IntelligenceView>, "initialTab">;

export function ProjectsView(props: Props) {
  return <IntelligenceView {...props} initialTab="projets" />;
}
