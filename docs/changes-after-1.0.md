# 1.0 发布后的改进

以下改进位于 GitHub 主分支。下载源码即可使用；已发布的应用 v1.0.0 和 Mooncakes 0.1.0 保持原样。

## 文档分类识别

归档器只采用文件开头、由 `---` 闭合的简化 frontmatter。支持 UTF-8 BOM、CRLF，以及不带引号或单/双引号包裹的 `engineering`、`product`、`research`。未闭合、重复 category、其他分类或复杂 YAML 值不会触发移动。正文中的 category 不作为元数据。

验证：新增未闭合/重复分类拒绝移动、带 BOM/引号分类的内容保留与恢复测试；MoonBit JS 和 Wasm GC 各 37 项通过。
