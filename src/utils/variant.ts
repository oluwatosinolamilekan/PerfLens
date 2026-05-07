declare const __PERFLENS_VARIANT__: 'manual' | 'auto' | undefined;

export type ExtensionVariant = 'manual' | 'auto';

export const EXTENSION_VARIANT: ExtensionVariant =
  typeof __PERFLENS_VARIANT__ === 'undefined' ? 'manual' : __PERFLENS_VARIANT__;

export const IS_AUTO_VARIANT = EXTENSION_VARIANT === 'auto';

export const ACCESS_MODE_LABEL = IS_AUTO_VARIANT ? 'Automatic monitoring' : 'Current tab only';

export const ACCESS_MODE_DESCRIPTION = IS_AUTO_VARIANT
  ? 'Requires all-site access so PerfLens can monitor pages automatically after navigation.'
  : 'Runs only when you click audit on the active tab.';
