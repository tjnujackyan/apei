/**
 * 错题树节点接口
 */
export interface TreeNode {
  id: string;
  name: string;
  level: number;
  subjectCode?: string;
  wrongCount: number;
  directWrongCount: number;
  children?: TreeNode[];
}

