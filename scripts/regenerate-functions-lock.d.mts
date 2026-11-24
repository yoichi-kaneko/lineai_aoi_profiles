// regenerate-functions-lock.mjs が export する判断ロジックの型宣言（test/ から import するため）。

export declare const DEFAULT_MINIMUM_RELEASE_AGE_MINUTES: number;

export declare function readMinimumReleaseAgeMinutes(workspaceYaml: string): number;

export declare function toMinReleaseAgeDays(minutes: number): number;

export declare function buildNpmEnv<T extends Record<string, string | undefined>>(
  baseEnv: T,
  minReleaseAgeDays: number,
): T & { npm_config_min_release_age: string };
