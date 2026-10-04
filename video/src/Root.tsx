import React from "react";
import { Composition, useCurrentFrame } from "remotion";
import { Film, FILM_TOTAL } from "./Film";
const F: React.FC = () => <Film frame={useCurrentFrame()} />;
export const Root: React.FC = () => <Composition id="Film" component={F} durationInFrames={FILM_TOTAL} fps={30} width={1920} height={1080} />;
