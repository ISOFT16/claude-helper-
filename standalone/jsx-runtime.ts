// На странице claude.ai React подключается готовым файлом с cdnjs (версия 18),
// а в нём нет модуля jsx-runtime. Эта маленькая замена делает то же самое.
import React from 'react';

type Props = Record<string, unknown> | null;

export const Fragment = React.Fragment;

export function jsx(type: React.ElementType, props: Props, key?: React.Key) {
  return React.createElement(type, key === undefined ? props : { ...props, key });
}

export const jsxs = jsx;
