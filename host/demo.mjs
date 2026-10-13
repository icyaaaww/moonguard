import * as fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const demoFiles = [
  { path: 'README.md', content: '# Orbit 工作室 · 项目知识库\n\n这里收录产品、工程与研究文档。\n\n- [系统设计](Architecture.md#overview)\n- [发布计划](Roadmap.md)\n- [用户访谈](Interviews.md)\n- [接口说明](API.md)\n\n> 这是一份可自由操作的演示资料。\n' },
  { path: 'Architecture.md', content: '---\ncategory: engineering\n---\n# 系统设计\n\n## overview\n\n我们将规划、验证和执行分开，便于独立测试。\n\n关联：[接口说明](API.md) · [项目首页](README.md)\n' },
  { path: 'API.md', content: '---\ncategory: engineering\n---\n# 接口说明\n\n每个写操作都包含前置条件。\n\n详见：[系统设计](Architecture.md#overview)\n' },
  { path: 'Roadmap.md', content: '---\ncategory: product\n---\n# 发布计划\n\n第一阶段：跑通预演与恢复。\n第二阶段：接入真实用户反馈。\n\n依据：[用户访谈](Interviews.md)\n' },
  { path: 'Interviews.md', content: '---\ncategory: research\n---\n# 用户访谈 · 示例模板\n\n待验证的问题：用户能否理解操作前后的文件差异？\n\n本文是演示素材，不是真实访谈结论。\n\n返回：[项目首页](README.md)\n' },
  { path: 'notes.txt', content: '未标注类别的笔记保留原位。\n恢复操作不应覆盖后来的人为编辑。\n' },
];

export async function createDemo(parent) {
  const root = path.join(parent, `session-${randomUUID().slice(0, 8)}`);
  await fs.mkdir(root, { recursive: true });
  for (const file of demoFiles) await fs.writeFile(path.join(root, file.path), file.content, { flag: 'wx' });
  return fs.realpath(root);
}
