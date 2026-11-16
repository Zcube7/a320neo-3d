// 部件讲解总表。每个条目的 id 与模型里网格的 userData.part 一致，点模型和点列表走的是同一条路。
import { PARTS_A } from './content_a.js';
import { PARTS_B } from './content_b.js';

export const PARTS = [...PARTS_A, ...PARTS_B];
export const PART = Object.fromEntries(PARTS.map((p) => [p.id, p]));
export const GROUPS = [...new Set(PARTS.map((p) => p.group))];
