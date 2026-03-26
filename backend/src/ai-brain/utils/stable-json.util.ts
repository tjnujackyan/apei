/**
 * 稳定的JSON序列化工具
 * 
 * 确保相同的对象总是生成相同的JSON字符串，
 * 这对于KV缓存优化至关重要。
 * 
 * 使用确定性的键排序，而不是依赖JavaScript的对象键顺序。
 */

/**
 * 稳定的JSON序列化
 * @param obj 要序列化的对象
 * @param space 缩进空格数
 * @returns 稳定排序的JSON字符串
 */
export function stableStringify(obj: any, space: number = 2): string {
  return JSON.stringify(obj, stableReplacer, space);
}

/**
 * 稳定的replacer函数，对键进行排序
 */
function stableReplacer(key: string, value: any): any {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    // 对对象的键进行排序
    const sorted: Record<string, any> = {};
    Object.keys(value).sort().forEach(k => {
      sorted[k] = value[k];
    });
    return sorted;
  }
  return value;
}

/**
 * 稳定的JSON解析（与JSON.parse相同，为了API一致性）
 */
export function stableParse<T = any>(text: string): T {
  return JSON.parse(text);
}

