import { version } from "../../package.json";

/** Release builds set package.json's version from the tag before bundling. */
export const engineVersion: string = version;
