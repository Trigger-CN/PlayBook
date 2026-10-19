import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * 合并条件类名并消解 Tailwind 冲突。
 * 自定义组件类（如 toy-button）不在 Tailwind 的冲突表内，会被原样保留。
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
